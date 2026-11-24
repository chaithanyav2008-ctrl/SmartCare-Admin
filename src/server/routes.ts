import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { db } from "./db.ts";
import {
  type AuthenticatedRequest,
  getAdminConfigurationStatus,
  hashPassword,
  loadAuthUserById,
  requireAuth,
  requireRole,
  signToken,
  verifyEnvAdminPasscode,
  verifyPassword,
} from "./auth.ts";
import { createNotification, logActivity, sendAppointmentReminderPair } from "./notifications.ts";

export const apiRouter = Router();

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in Settings > Secrets.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function generateTimeSlots(start: string, end: string, durationMinutes: number): string[] {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startTotal = sh * 60 + sm;
  const endTotal = eh * 60 + em;
  const step = Math.max(15, Math.min(120, durationMinutes));
  const slots: string[] = [];
  for (let mins = startTotal; mins + step <= endTotal; mins += step) {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    slots.push(`${h}:${m}`);
  }
  return slots;
}

function computeDoctorSlotsForDate(doctorId: number, dateStr: string) {
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return [];
  }
  const dayOfWeek = parsed.getDay();
  const windows = db
    .prepare(
      "SELECT start_time, end_time, slot_duration_minutes FROM doctor_availability WHERE doctor_id = ? AND day_of_week = ? AND is_active = 1 ORDER BY start_time ASC"
    )
    .all(doctorId, dayOfWeek) as Array<{
    start_time: string;
    end_time: string;
    slot_duration_minutes: number;
  }>;

  const bookedRows = db
    .prepare(
      "SELECT time_slot FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status IN ('Pending', 'Confirmed', 'Completed')"
    )
    .all(doctorId, dateStr) as Array<{ time_slot: string }>;
  const bookedSet = new Set(bookedRows.map((r) => r.time_slot));

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const result: Array<{ time: string; available: boolean; reason?: string }> = [];
  const seen = new Set<string>();
  for (const w of windows) {
    const times = generateTimeSlots(w.start_time, w.end_time, w.slot_duration_minutes);
    for (const t of times) {
      if (seen.has(t)) continue;
      seen.add(t);
      const [th, tm] = t.split(":").map(Number);
      const slotMins = th * 60 + tm;
      if (dateStr < todayStr || (dateStr === todayStr && slotMins <= currentMins)) {
        result.push({ time: t, available: false, reason: "Past" });
      } else if (bookedSet.has(t)) {
        result.push({ time: t, available: false, reason: "Booked" });
      } else {
        result.push({ time: t, available: true });
      }
    }
  }
  return result;
}

// ==========================================
// PUBLIC DIRECTORY & SLOT ENDPOINTS
// ==========================================

apiRouter.get("/departments", (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT d.id, d.name, d.slug, d.description, d.location_wing,
              COUNT(doc.id) as doctor_count
       FROM departments d
       LEFT JOIN doctors doc ON doc.department_id = d.id
       GROUP BY d.id
       ORDER BY d.name ASC`
    )
    .all();
  res.json({ departments: rows });
});

apiRouter.get("/doctors", (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const departmentId = req.query.departmentId ? Number(req.query.departmentId) : null;
  const location = String(req.query.location ?? "").trim().toLowerCase();

  let sql = `
    SELECT doc.id, u.full_name, u.email, u.phone,
           CASE WHEN u.password_hash IS NOT NULL THEN 1 ELSE 0 END as is_claimed,
           doc.department_id, dept.name as department_name,
           doc.specialization, doc.qualification, doc.experience_years,
           doc.location, doc.consultation_fee, doc.bio, doc.avatar_url, doc.is_featured
    FROM doctors doc
    INNER JOIN users u ON u.id = doc.user_id
    INNER JOIN departments dept ON dept.id = doc.department_id
    WHERE 1=1
  `;
  const params: Array<string | number> = [];

  if (departmentId && Number.isInteger(departmentId)) {
    sql += " AND doc.department_id = ?";
    params.push(departmentId);
  }
  if (q) {
    const like = `%${q}%`;
    sql += " AND (LOWER(u.full_name) LIKE ? OR LOWER(doc.specialization) LIKE ? OR LOWER(dept.name) LIKE ? OR LOWER(doc.location) LIKE ?)";
    params.push(like, like, like, like);
  }
  if (location) {
    sql += " AND LOWER(doc.location) LIKE ?";
    params.push(`%${location}%`);
  }
  sql += " ORDER BY doc.is_featured DESC, doc.experience_years DESC, u.full_name ASC";

  const doctors = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const availStmt = db.prepare(
    "SELECT day_of_week, start_time, end_time, slot_duration_minutes FROM doctor_availability WHERE doctor_id = ? AND is_active = 1 ORDER BY day_of_week, start_time"
  );
  const enriched = doctors.map((d) => ({
    ...d,
    availability: availStmt.all(Number(d.id)),
  }));
  res.json({ doctors: enriched });
});

apiRouter.get("/doctors/:id/slots", (req: Request, res: Response) => {
  const doctorId = Number(req.params.id);
  const dateStr = String(req.query.date ?? "").trim();
  if (!Number.isInteger(doctorId) || doctorId <= 0) {
    res.status(400).json({ error: "Invalid doctor identifier." });
    return;
  }
  if (!VALID_DATE.test(dateStr)) {
    res.status(400).json({ error: "Date must be in YYYY-MM-DD format." });
    return;
  }
  const doctorExists = db.prepare("SELECT id FROM doctors WHERE id = ?").get(doctorId);
  if (!doctorExists) {
    res.status(404).json({ error: "Doctor not found." });
    return;
  }
  const slots = computeDoctorSlotsForDate(doctorId, dateStr);
  res.json({ doctorId, date: dateStr, slots });
});

apiRouter.get("/doctors/recommend", (req: Request, res: Response) => {
  const symptom = String(req.query.symptom ?? "").trim().toLowerCase();
  if (!symptom) {
    res.status(400).json({ error: "Please describe a symptom or specialty need." });
    return;
  }

  const keywordMap: Array<{ dept: string; keywords: string[] }> = [
    { dept: "Cardiology", keywords: ["heart", "chest", "palpitation", "blood pressure", "hypertension", "pulse", "cardiac", "cholesterol"] },
    { dept: "Neurology", keywords: ["headache", "migraine", "dizzy", "dizziness", "nerve", "numbness", "seizure", "memory", "tremor", "brain"] },
    { dept: "Pediatrics", keywords: ["child", "baby", "infant", "kid", "pediatric", "teen", "vaccination", "immunization", "toddler"] },
    { dept: "Orthopedics", keywords: ["knee", "back", "joint", "bone", "fracture", "shoulder", "ankle", "sprain", "spine", "sports", "muscle"] },
    { dept: "Dermatology", keywords: ["skin", "rash", "acne", "eczema", "mole", "itch", "psoriasis", "allergy", "hair", "nail"] },
    { dept: "Internal Medicine", keywords: ["fever", "cough", "fatigue", "diabetes", "thyroid", "checkup", "physical", "cold", "flu", "stomach", "general"] },
  ];

  let matchedDept = "Internal Medicine";
  for (const entry of keywordMap) {
    if (entry.keywords.some((kw) => symptom.includes(kw))) {
      matchedDept = entry.dept;
      break;
    }
  }

  const doctors = db
    .prepare(
      `SELECT doc.id, u.full_name, doc.department_id, dept.name as department_name,
              doc.specialization, doc.qualification, doc.experience_years,
              doc.location, doc.consultation_fee, doc.avatar_url
       FROM doctors doc
       INNER JOIN users u ON u.id = doc.user_id
       INNER JOIN departments dept ON dept.id = doc.department_id
       WHERE dept.name = ?
       ORDER BY doc.experience_years DESC`
    )
    .all(matchedDept);

  res.json({ recommendedDepartment: matchedDept, doctors });
});

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

apiRouter.post("/auth/patient/register", (req: Request, res: Response) => {
  const fullName = String(req.body?.fullName ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const phone = String(req.body?.phone ?? "").trim();
  const age = Number(req.body?.age);
  const gender = String(req.body?.gender ?? "").trim();
  const password = String(req.body?.password ?? "");

  if (fullName.length < 2) {
    res.status(400).json({ error: "Full name must be at least 2 characters." });
    return;
  }
  if (!VALID_EMAIL.test(email)) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }
  if (phone.length < 7) {
    res.status(400).json({ error: "Please enter a valid phone number." });
    return;
  }
  if (!Number.isInteger(age) || age < 1 || age > 120) {
    res.status(400).json({ error: "Please enter a valid age between 1 and 120." });
    return;
  }
  if (!["Male", "Female", "Other", "Prefer not to say"].includes(gender)) {
    res.status(400).json({ error: "Please select a valid gender option." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters long." });
    return;
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }

  const passwordHash = hashPassword(password);
  try {
    db.exec("BEGIN IMMEDIATE");
    const userRes = db
      .prepare("INSERT INTO users (full_name, email, password_hash, role, phone) VALUES (?, ?, ?, 'patient', ?)")
      .run(fullName, email, passwordHash, phone);
    const userId = Number(userRes.lastInsertRowid);

    db.prepare("INSERT INTO patients (user_id, age, gender) VALUES (?, ?, ?)").run(userId, age, gender);
    createNotification({
      userId,
      title: "Welcome to SmartCare",
      message: "Your patient account is ready. You can now search specialists and book appointments online.",
      channel: "email",
      recipientEmail: email,
    });
    logActivity(fullName, "patient", "PATIENT_REGISTERED", `New patient account created (${email}).`);
    db.exec("COMMIT");

    const user = loadAuthUserById(userId)!;
    const token = signToken({ userId: user.id, role: user.role, email: user.email });
    res.status(201).json({ token, user });
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("Registration failed:", err);
    res.status(500).json({ error: "Could not complete registration." });
  }
});

apiRouter.post("/auth/login", (req: Request, res: Response) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const expectedRole = req.body?.role ? String(req.body.role) : null;

  if (!VALID_EMAIL.test(email) || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const row = db
    .prepare("SELECT id, email, password_hash, role FROM users WHERE email = ?")
    .get(email) as { id: number; email: string; password_hash: string | null; role: string } | undefined;

  if (!row) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }
  if (expectedRole && row.role !== expectedRole) {
    res.status(403).json({ error: `This portal is for ${expectedRole} accounts only.` });
    return;
  }
  if (!row.password_hash) {
    res.status(403).json({
      error: "This doctor profile has not been activated yet. Use 'Activate Doctor Portal' to set your password.",
      needsActivation: row.role === "doctor",
    });
    return;
  }
  if (!verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const user = loadAuthUserById(row.id)!;
  const token = signToken({ userId: user.id, role: user.role, email: user.email });
  res.json({ token, user });
});

apiRouter.post("/auth/doctor/activate", (req: Request, res: Response) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!VALID_EMAIL.test(email)) {
    res.status(400).json({ error: "Select or enter a valid doctor email address." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters long." });
    return;
  }

  const row = db
    .prepare("SELECT id, full_name, password_hash, role FROM users WHERE email = ? AND role = 'doctor'")
    .get(email) as { id: number; full_name: string; password_hash: string | null; role: string } | undefined;

  if (!row) {
    res.status(404).json({ error: "Doctor profile not found." });
    return;
  }
  if (row.password_hash !== null) {
    res.status(409).json({ error: "This doctor account is already activated. Please sign in with your password." });
    return;
  }

  const hashed = hashPassword(password);
  const update = db
    .prepare("UPDATE users SET password_hash = ? WHERE id = ? AND password_hash IS NULL")
    .run(hashed, row.id);
  if (update.changes === 0) {
    res.status(409).json({ error: "Doctor account was already activated." });
    return;
  }

  logActivity(row.full_name, "doctor", "DOCTOR_PORTAL_ACTIVATED", `${row.full_name} activated their doctor portal credentials.`);
  const user = loadAuthUserById(row.id)!;
  const token = signToken({ userId: user.id, role: user.role, email: user.email });
  res.json({ token, user });
});

apiRouter.post("/auth/forgot-password", (req: Request, res: Response) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const phone = String(req.body?.phone ?? "").trim();
  const newPassword = String(req.body?.newPassword ?? "");

  if (!VALID_EMAIL.test(email) || !phone || newPassword.length < 8) {
    res.status(400).json({ error: "Valid email, registered phone number, and a new password (8+ chars) are required." });
    return;
  }

  const user = db
    .prepare("SELECT id, full_name, role, phone FROM users WHERE email = ? AND role IN ('patient', 'doctor')")
    .get(email) as { id: number; full_name: string; role: string; phone: string } | undefined;

  const normalizeDigits = (val: string) => val.replace(/\D/g, "");
  if (!user || normalizeDigits(user.phone) !== normalizeDigits(phone)) {
    res.status(400).json({ error: "Email and phone number do not match our records." });
    return;
  }

  const hashed = hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashed, user.id);
  createNotification({
    userId: user.id,
    title: "Password Reset Confirmed",
    message: "Your SmartCare account password was updated successfully.",
    channel: "email",
    recipientEmail: email,
  });
  logActivity(user.full_name, user.role, "PASSWORD_RESET", `Password reset completed for ${email}.`);

  res.json({ message: "Password updated successfully. You can now sign in." });
});

apiRouter.get("/auth/admin/status", (_req: Request, res: Response) => {
  res.json(getAdminConfigurationStatus());
});

apiRouter.post("/auth/admin/setup", (req: Request, res: Response) => {
  const status = getAdminConfigurationStatus();
  if (status.envConfigured) {
    res.status(403).json({ error: "Admin passcode is already managed via server environment configuration." });
    return;
  }
  if (status.claimedInDb) {
    res.status(409).json({ error: "Admin account has already been claimed. Please sign in." });
    return;
  }

  const fullName = String(req.body?.fullName ?? "SmartCare Administrator").trim() || "SmartCare Administrator";
  const email = String(req.body?.email ?? "admin@smartcare.health").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!VALID_EMAIL.test(email)) {
    res.status(400).json({ error: "Please enter a valid admin email address." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Admin password must be at least 8 characters long." });
    return;
  }

  const existingEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existingEmail) {
    res.status(409).json({ error: "That email is already registered to another role." });
    return;
  }

  try {
    db.exec("BEGIN IMMEDIATE");
    const checkAgain = db.prepare("SELECT id FROM users WHERE role = 'admin' AND password_hash IS NOT NULL LIMIT 1").get();
    if (checkAgain) {
      db.exec("ROLLBACK");
      res.status(409).json({ error: "Admin account has already been claimed." });
      return;
    }

    const hashed = hashPassword(password);
    const insertRes = db
      .prepare("INSERT INTO users (full_name, email, password_hash, role, phone) VALUES (?, ?, ?, 'admin', '+1 (555) 010-0000')")
      .run(fullName, email, hashed);
    const adminId = Number(insertRes.lastInsertRowid);
    logActivity(fullName, "admin", "ADMIN_INITIALIZED", `Admin portal claimed by ${email}.`);
    db.exec("COMMIT");

    const user = loadAuthUserById(adminId)!;
    const token = signToken({ userId: user.id, role: "admin", email: user.email });
    res.status(201).json({ token, user });
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("Admin setup error:", err);
    res.status(500).json({ error: "Could not complete admin setup." });
  }
});

apiRouter.post("/auth/admin/login", (req: Request, res: Response) => {
  const emailInput = String(req.body?.email ?? "admin@smartcare.health").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!password) {
    res.status(400).json({ error: "Admin password or passcode is required." });
    return;
  }

  const status = getAdminConfigurationStatus();
  if (status.envConfigured) {
    if (!verifyEnvAdminPasscode(password)) {
      res.status(401).json({ error: "Invalid administrator passcode." });
      return;
    }
    let adminUser = db
      .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
      .get() as { id: number } | undefined;
    if (!adminUser) {
      const created = db
        .prepare("INSERT INTO users (full_name, email, password_hash, role, phone) VALUES ('SmartCare Administrator', 'admin@smartcare.health', NULL, 'admin', '+1 (555) 010-0000')")
        .run();
      adminUser = { id: Number(created.lastInsertRowid) };
    }
    const user = loadAuthUserById(adminUser.id)!;
    const token = signToken({ userId: user.id, role: "admin", email: user.email });
    res.json({ token, user });
    return;
  }

  if (!status.claimedInDb) {
    res.status(403).json({ error: "Admin portal needs first-run setup.", needsFirstRunSetup: true });
    return;
  }

  const adminRow = db
    .prepare("SELECT id, email, password_hash FROM users WHERE role = 'admin' AND email = ? LIMIT 1")
    .get(emailInput) as { id: number; email: string; password_hash: string | null } | undefined;

  if (!adminRow || !adminRow.password_hash || !verifyPassword(password, adminRow.password_hash)) {
    res.status(401).json({ error: "Invalid administrator email or password." });
    return;
  }

  const user = loadAuthUserById(adminRow.id)!;
  const token = signToken({ userId: user.id, role: "admin", email: user.email });
  res.json({ token, user });
});

apiRouter.get("/auth/me", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

// ==========================================
// PATIENT PORTAL ENDPOINTS
// ==========================================

apiRouter.get("/patient/dashboard", requireAuth, requireRole("patient"), (req: AuthenticatedRequest, res: Response) => {
  const patientId = req.user!.patientId!;
  const profile = db
    .prepare(
      `SELECT u.id as user_id, u.full_name, u.email, u.phone,
              p.id as patient_id, p.age, p.gender, p.blood_group, p.allergies, p.emergency_contact, p.address
       FROM patients p
       INNER JOIN users u ON u.id = p.user_id
       WHERE p.id = ?`
    )
    .get(patientId);

  const appointments = db
    .prepare(
      `SELECT a.id, a.appointment_code, a.doctor_id, a.department_id, a.appointment_date, a.time_slot,
              a.reason, a.status, a.consultation_notes, a.created_at,
              du.full_name as doctor_name, doc.specialization, doc.location, doc.consultation_fee,
              dept.name as department_name
       FROM appointments a
       INNER JOIN doctors doc ON doc.id = a.doctor_id
       INNER JOIN users du ON du.id = doc.user_id
       INNER JOIN departments dept ON dept.id = a.department_id
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC, a.time_slot DESC`
    )
    .all(patientId);

  const medicalRecords = db
    .prepare(
      `SELECT mr.id, mr.record_date, mr.diagnosis, mr.prescription, mr.vitals, mr.notes,
              du.full_name as doctor_name, doc.specialization
       FROM medical_records mr
       LEFT JOIN doctors doc ON doc.id = mr.doctor_id
       LEFT JOIN users du ON du.id = doc.user_id
       WHERE mr.patient_id = ?
       ORDER BY mr.record_date DESC, mr.id DESC`
    )
    .all(patientId);

  const notifications = db
    .prepare("SELECT id, title, message, channel, recipient_email, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30")
    .all(req.user!.id);

  res.json({ profile, appointments, medicalRecords, notifications });
});

apiRouter.put("/patient/profile", requireAuth, requireRole("patient"), (req: AuthenticatedRequest, res: Response) => {
  const fullName = String(req.body?.fullName ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  const age = Number(req.body?.age);
  const gender = String(req.body?.gender ?? "").trim();
  const bloodGroup = String(req.body?.bloodGroup ?? "Unknown").trim();
  const allergies = String(req.body?.allergies ?? "None reported").trim();
  const emergencyContact = String(req.body?.emergencyContact ?? "").trim();
  const address = String(req.body?.address ?? "").trim();

  if (fullName.length < 2 || phone.length < 7 || !Number.isInteger(age) || age < 1 || age > 120) {
    res.status(400).json({ error: "Please provide valid full name, phone, and age." });
    return;
  }
  if (!["Male", "Female", "Other", "Prefer not to say"].includes(gender)) {
    res.status(400).json({ error: "Invalid gender selection." });
    return;
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE users SET full_name = ?, phone = ? WHERE id = ?").run(fullName, phone, req.user!.id);
    db.prepare(
      "UPDATE patients SET age = ?, gender = ?, blood_group = ?, allergies = ?, emergency_contact = ?, address = ? WHERE user_id = ?"
    ).run(age, gender, bloodGroup, allergies, emergencyContact, address, req.user!.id);
    db.exec("COMMIT");
    res.json({ message: "Patient profile updated.", user: loadAuthUserById(req.user!.id) });
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("Update patient profile failed:", err);
    res.status(500).json({ error: "Could not update profile." });
  }
});

apiRouter.post("/appointments", requireAuth, requireRole("patient"), (req: AuthenticatedRequest, res: Response) => {
  const doctorId = Number(req.body?.doctorId);
  const appointmentDate = String(req.body?.appointmentDate ?? "").trim();
  const timeSlot = String(req.body?.timeSlot ?? "").trim();
  const reason = String(req.body?.reason ?? "").trim();

  if (!Number.isInteger(doctorId) || doctorId <= 0) {
    res.status(400).json({ error: "Please select a valid doctor." });
    return;
  }
  if (!VALID_DATE.test(appointmentDate)) {
    res.status(400).json({ error: "Please select a valid appointment date." });
    return;
  }
  if (!VALID_TIME.test(timeSlot)) {
    res.status(400).json({ error: "Please select a valid time slot." });
    return;
  }
  if (reason.length < 3) {
    res.status(400).json({ error: "Please enter a brief reason for your visit." });
    return;
  }

  const doctorRow = db
    .prepare(
      `SELECT doc.id, doc.department_id, doc.user_id as doctor_user_id, u.full_name as doctor_name, u.email as doctor_email
       FROM doctors doc
       INNER JOIN users u ON u.id = doc.user_id
       WHERE doc.id = ?`
    )
    .get(doctorId) as
    | { id: number; department_id: number; doctor_user_id: number; doctor_name: string; doctor_email: string }
    | undefined;

  if (!doctorRow) {
    res.status(404).json({ error: "Selected doctor was not found." });
    return;
  }

  try {
    db.exec("BEGIN IMMEDIATE");
    const availableSlots = computeDoctorSlotsForDate(doctorId, appointmentDate);
    const matchingSlot = availableSlots.find((s) => s.time === timeSlot);
    if (!matchingSlot || !matchingSlot.available) {
      db.exec("ROLLBACK");
      res.status(409).json({ error: "This time slot is no longer available. Please pick another open slot." });
      return;
    }

    const code = `SC-${appointmentDate.slice(0, 4)}-${crypto.randomInt(1000, 9999)}`;
    const insertRes = db
      .prepare(
        `INSERT INTO appointments (
          appointment_code, patient_id, doctor_id, department_id, appointment_date, time_slot, reason, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Confirmed')`
      )
      .run(code, req.user!.patientId!, doctorId, doctorRow.department_id, appointmentDate, timeSlot, reason);

    sendAppointmentReminderPair({
      patientUserId: req.user!.id,
      patientEmail: req.user!.email,
      patientName: req.user!.fullName,
      doctorUserId: doctorRow.doctor_user_id,
      doctorEmail: doctorRow.doctor_email,
      doctorName: doctorRow.doctor_name,
      appointmentCode: code,
      date: appointmentDate,
      timeSlot,
      eventLabel: "Confirmed",
    });

    logActivity(
      req.user!.fullName,
      "patient",
      "APPOINTMENT_BOOKED",
      `Booked ${code} with ${doctorRow.doctor_name} on ${appointmentDate} at ${timeSlot}.`
    );

    db.exec("COMMIT");
    res.status(201).json({
      appointment: {
        id: Number(insertRes.lastInsertRowid),
        appointment_code: code,
        doctor_name: doctorRow.doctor_name,
        appointment_date: appointmentDate,
        time_slot: timeSlot,
        status: "Confirmed",
      },
    });
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("Appointment booking failed:", err);
    res.status(409).json({ error: "Unable to reserve that slot because it was just booked. Please select another time." });
  }
});

apiRouter.patch("/appointments/:id/reschedule", requireAuth, requireRole("patient"), (req: AuthenticatedRequest, res: Response) => {
  const apptId = Number(req.params.id);
  const newDate = String(req.body?.appointmentDate ?? "").trim();
  const newTime = String(req.body?.timeSlot ?? "").trim();

  if (!Number.isInteger(apptId) || !VALID_DATE.test(newDate) || !VALID_TIME.test(newTime)) {
    res.status(400).json({ error: "Valid appointment ID, date, and time slot are required." });
    return;
  }

  try {
    db.exec("BEGIN IMMEDIATE");
    const appt = db
      .prepare(
        `SELECT a.id, a.appointment_code, a.doctor_id, a.status,
                du.id as doctor_user_id, du.full_name as doctor_name, du.email as doctor_email
         FROM appointments a
         INNER JOIN doctors doc ON doc.id = a.doctor_id
         INNER JOIN users du ON du.id = doc.user_id
         WHERE a.id = ? AND a.patient_id = ?`
      )
      .get(apptId, req.user!.patientId!) as
      | {
          id: number;
          appointment_code: string;
          doctor_id: number;
          status: string;
          doctor_user_id: number;
          doctor_name: string;
          doctor_email: string;
        }
      | undefined;

    if (!appt) {
      db.exec("ROLLBACK");
      res.status(404).json({ error: "Appointment not found." });
      return;
    }
    if (["Completed", "Cancelled", "Rejected"].includes(appt.status)) {
      db.exec("ROLLBACK");
      res.status(400).json({ error: `Cannot reschedule a ${appt.status.toLowerCase()} appointment.` });
      return;
    }

    const availableSlots = computeDoctorSlotsForDate(appt.doctor_id, newDate);
    const matching = availableSlots.find((s) => s.time === newTime);
    if (!matching || !matching.available) {
      db.exec("ROLLBACK");
      res.status(409).json({ error: "Selected new slot is unavailable." });
      return;
    }

    db.prepare(
      "UPDATE appointments SET appointment_date = ?, time_slot = ?, status = 'Confirmed', updated_at = datetime('now') WHERE id = ?"
    ).run(newDate, newTime, appt.id);

    sendAppointmentReminderPair({
      patientUserId: req.user!.id,
      patientEmail: req.user!.email,
      patientName: req.user!.fullName,
      doctorUserId: appt.doctor_user_id,
      doctorEmail: appt.doctor_email,
      doctorName: appt.doctor_name,
      appointmentCode: appt.appointment_code,
      date: newDate,
      timeSlot: newTime,
      eventLabel: "Rescheduled",
    });
    logActivity(req.user!.fullName, "patient", "APPOINTMENT_RESCHEDULED", `Rescheduled ${appt.appointment_code} to ${newDate} ${newTime}.`);
    db.exec("COMMIT");
    res.json({ message: "Appointment rescheduled successfully." });
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("Reschedule error:", err);
    res.status(409).json({ error: "Could not reschedule to that slot." });
  }
});

apiRouter.patch("/appointments/:id/cancel", requireAuth, requireRole("patient"), (req: AuthenticatedRequest, res: Response) => {
  const apptId = Number(req.params.id);
  const appt = db
    .prepare(
      `SELECT a.id, a.appointment_code, a.appointment_date, a.time_slot, a.status,
              du.id as doctor_user_id, du.full_name as doctor_name, du.email as doctor_email
       FROM appointments a
       INNER JOIN doctors doc ON doc.id = a.doctor_id
       INNER JOIN users du ON du.id = doc.user_id
       WHERE a.id = ? AND a.patient_id = ?`
    )
    .get(apptId, req.user!.patientId!) as
    | {
        id: number;
        appointment_code: string;
        appointment_date: string;
        time_slot: string;
        status: string;
        doctor_user_id: number;
        doctor_name: string;
        doctor_email: string;
      }
    | undefined;

  if (!appt) {
    res.status(404).json({ error: "Appointment not found." });
    return;
  }
  if (appt.status === "Completed" || appt.status === "Cancelled") {
    res.status(400).json({ error: `Appointment is already ${appt.status.toLowerCase()}.` });
    return;
  }

  db.prepare("UPDATE appointments SET status = 'Cancelled', updated_at = datetime('now') WHERE id = ?").run(appt.id);
  sendAppointmentReminderPair({
    patientUserId: req.user!.id,
    patientEmail: req.user!.email,
    patientName: req.user!.fullName,
    doctorUserId: appt.doctor_user_id,
    doctorEmail: appt.doctor_email,
    doctorName: appt.doctor_name,
    appointmentCode: appt.appointment_code,
    date: appt.appointment_date,
    timeSlot: appt.time_slot,
    eventLabel: "Cancelled",
  });
  logActivity(req.user!.fullName, "patient", "APPOINTMENT_CANCELLED", `Cancelled ${appt.appointment_code}.`);
  res.json({ message: "Appointment cancelled." });
});

apiRouter.post("/notifications/read-all", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.user!.id);
  res.json({ ok: true });
});

// ==========================================
// DOCTOR PORTAL ENDPOINTS
// ==========================================

apiRouter.get("/doctor/dashboard", requireAuth, requireRole("doctor"), (req: AuthenticatedRequest, res: Response) => {
  const doctorId = req.user!.doctorId!;
  const profile = db
    .prepare(
      `SELECT doc.id as doctor_id, u.full_name, u.email, u.phone,
              doc.department_id, dept.name as department_name,
              doc.specialization, doc.qualification, doc.experience_years,
              doc.location, doc.consultation_fee, doc.bio, doc.avatar_url
       FROM doctors doc
       INNER JOIN users u ON u.id = doc.user_id
       INNER JOIN departments dept ON dept.id = doc.department_id
       WHERE doc.id = ?`
    )
    .get(doctorId);

  const availability = db
    .prepare("SELECT id, day_of_week, start_time, end_time, slot_duration_minutes, is_active FROM doctor_availability WHERE doctor_id = ? ORDER BY day_of_week, start_time")
    .all(doctorId);

  const appointments = db
    .prepare(
      `SELECT a.id, a.appointment_code, a.patient_id, a.appointment_date, a.time_slot,
              a.reason, a.status, a.consultation_notes, a.created_at,
              pu.full_name as patient_name, pu.email as patient_email, pu.phone as patient_phone,
              p.age as patient_age, p.gender as patient_gender, p.blood_group, p.allergies
       FROM appointments a
       INNER JOIN patients p ON p.id = a.patient_id
       INNER JOIN users pu ON pu.id = p.user_id
       WHERE a.doctor_id = ?
       ORDER BY a.appointment_date DESC, a.time_slot ASC`
    )
    .all(doctorId);

  const notifications = db
    .prepare("SELECT id, title, message, channel, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30")
    .all(req.user!.id);

  res.json({ profile, availability, appointments, notifications });
});

apiRouter.put("/doctor/availability", requireAuth, requireRole("doctor"), (req: AuthenticatedRequest, res: Response) => {
  const doctorId = req.user!.doctorId!;
  const windows = req.body?.windows;
  if (!Array.isArray(windows)) {
    res.status(400).json({ error: "Availability windows must be an array." });
    return;
  }

  for (const w of windows) {
    const day = Number(w.day_of_week);
    const start = String(w.start_time ?? "");
    const end = String(w.end_time ?? "");
    const dur = Number(w.slot_duration_minutes ?? 30);
    if (!Number.isInteger(day) || day < 0 || day > 6 || !VALID_TIME.test(start) || !VALID_TIME.test(end) || start >= end) {
      res.status(400).json({ error: "Each availability window needs a valid day (0-6), start time, and end time." });
      return;
    }
    if (!Number.isInteger(dur) || dur < 15 || dur > 120) {
      res.status(400).json({ error: "Slot duration must be between 15 and 120 minutes." });
      return;
    }
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM doctor_availability WHERE doctor_id = ?").run(doctorId);
    const insert = db.prepare(
      "INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, is_active) VALUES (?, ?, ?, ?, ?, 1)"
    );
    for (const w of windows) {
      insert.run(doctorId, Number(w.day_of_week), String(w.start_time), String(w.end_time), Number(w.slot_duration_minutes ?? 30));
    }
    logActivity(req.user!.fullName, "doctor", "AVAILABILITY_UPDATED", `${req.user!.fullName} updated consultation hours (${windows.length} windows).`);
    db.exec("COMMIT");
    res.json({ message: "Schedule availability updated." });
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("Availability update error:", err);
    res.status(400).json({ error: "Duplicate or invalid availability windows provided." });
  }
});

apiRouter.get("/doctor/patients/:patientId/records", requireAuth, requireRole("doctor"), (req: AuthenticatedRequest, res: Response) => {
  const doctorId = req.user!.doctorId!;
  const patientId = Number(req.params.patientId);
  if (!Number.isInteger(patientId)) {
    res.status(400).json({ error: "Invalid patient ID." });
    return;
  }

  const hasRelation = db
    .prepare("SELECT id FROM appointments WHERE doctor_id = ? AND patient_id = ? LIMIT 1")
    .get(doctorId, patientId);
  if (!hasRelation) {
    res.status(403).json({ error: "Access restricted to patients with scheduled appointments under your care." });
    return;
  }

  const records = db
    .prepare(
      `SELECT mr.id, mr.record_date, mr.diagnosis, mr.prescription, mr.vitals, mr.notes,
              du.full_name as doctor_name
       FROM medical_records mr
       LEFT JOIN doctors doc ON doc.id = mr.doctor_id
       LEFT JOIN users du ON du.id = doc.user_id
       WHERE mr.patient_id = ?
       ORDER BY mr.record_date DESC, mr.id DESC`
    )
    .all(patientId);
  res.json({ records });
});

apiRouter.patch("/doctor/appointments/:id/status", requireAuth, requireRole("doctor"), (req: AuthenticatedRequest, res: Response) => {
  const doctorId = req.user!.doctorId!;
  const apptId = Number(req.params.id);
  const status = String(req.body?.status ?? "").trim();
  const consultationNotes = String(req.body?.consultationNotes ?? "").trim();
  const diagnosis = String(req.body?.diagnosis ?? "").trim();
  const prescription = String(req.body?.prescription ?? "").trim();
  const vitals = String(req.body?.vitals ?? "").trim();

  if (!["Confirmed", "Rejected", "Completed"].includes(status)) {
    res.status(400).json({ error: "Status must be Confirmed, Rejected, or Completed." });
    return;
  }

  const appt = db
    .prepare(
      `SELECT a.id, a.appointment_code, a.patient_id, a.appointment_date, a.time_slot,
              pu.id as patient_user_id, pu.full_name as patient_name, pu.email as patient_email
       FROM appointments a
       INNER JOIN patients p ON p.id = a.patient_id
       INNER JOIN users pu ON pu.id = p.user_id
       WHERE a.id = ? AND a.doctor_id = ?`
    )
    .get(apptId, doctorId) as
    | {
        id: number;
        appointment_code: string;
        patient_id: number;
        appointment_date: string;
        time_slot: string;
        patient_user_id: number;
        patient_name: string;
        patient_email: string;
      }
    | undefined;

  if (!appt) {
    res.status(404).json({ error: "Appointment not found under your schedule." });
    return;
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "UPDATE appointments SET status = ?, consultation_notes = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(status, consultationNotes, appt.id);

    if (status === "Completed" && (diagnosis || prescription || consultationNotes)) {
      db.prepare(
        `INSERT INTO medical_records (patient_id, doctor_id, appointment_id, record_date, diagnosis, prescription, vitals, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        appt.patient_id,
        doctorId,
        appt.id,
        appt.appointment_date,
        diagnosis || "Consultation completed",
        prescription || "Follow care instructions",
        vitals,
        consultationNotes
      );
    }

    sendAppointmentReminderPair({
      patientUserId: appt.patient_user_id,
      patientEmail: appt.patient_email,
      patientName: appt.patient_name,
      doctorUserId: req.user!.id,
      doctorEmail: req.user!.email,
      doctorName: req.user!.fullName,
      appointmentCode: appt.appointment_code,
      date: appt.appointment_date,
      timeSlot: appt.time_slot,
      eventLabel: status,
    });

    logActivity(
      req.user!.fullName,
      "doctor",
      `APPOINTMENT_${status.toUpperCase()}`,
      `${req.user!.fullName} marked ${appt.appointment_code} as ${status}.`
    );
    db.exec("COMMIT");
    res.json({ message: `Appointment updated to ${status}.` });
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("Doctor status update error:", err);
    res.status(500).json({ error: "Could not update appointment." });
  }
});

// ==========================================
// ADMIN PORTAL ENDPOINTS
// ==========================================

apiRouter.get("/admin/dashboard", requireAuth, requireRole("admin"), (_req: AuthenticatedRequest, res: Response) => {
  const totalPatients = (db.prepare("SELECT COUNT(*) as c FROM patients").get() as { c: number }).c;
  const totalDoctors = (db.prepare("SELECT COUNT(*) as c FROM doctors").get() as { c: number }).c;
  const totalAppointments = (db.prepare("SELECT COUNT(*) as c FROM appointments").get() as { c: number }).c;
  const pendingOrConfirmed = (
    db.prepare("SELECT COUNT(*) as c FROM appointments WHERE status IN ('Pending', 'Confirmed')").get() as { c: number }
  ).c;
  const completedAppointments = (
    db.prepare("SELECT COUNT(*) as c FROM appointments WHERE status = 'Completed'").get() as { c: number }
  ).c;

  const doctors = db
    .prepare(
      `SELECT doc.id, u.id as user_id, u.full_name, u.email, u.phone,
              doc.department_id, dept.name as department_name,
              doc.specialization, doc.qualification, doc.experience_years,
              doc.location, doc.consultation_fee, doc.bio, doc.avatar_url, doc.is_featured
       FROM doctors doc
       INNER JOIN users u ON u.id = doc.user_id
       INNER JOIN departments dept ON dept.id = doc.department_id
       ORDER BY doc.id DESC`
    )
    .all();

  const patients = db
    .prepare(
      `SELECT p.id, u.id as user_id, u.full_name, u.email, u.phone, u.created_at,
              p.age, p.gender, p.blood_group,
              (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id) as appointment_count
       FROM patients p
       INNER JOIN users u ON u.id = p.user_id
       ORDER BY p.id DESC`
    )
    .all();

  const departments = db
    .prepare(
      `SELECT d.id, d.name, d.slug, d.description, d.location_wing, COUNT(doc.id) as doctor_count
       FROM departments d
       LEFT JOIN doctors doc ON doc.department_id = d.id
       GROUP BY d.id
       ORDER BY d.name ASC`
    )
    .all();

  const appointments = db
    .prepare(
      `SELECT a.id, a.appointment_code, a.appointment_date, a.time_slot, a.reason, a.status,
              pu.full_name as patient_name, du.full_name as doctor_name, dept.name as department_name
       FROM appointments a
       INNER JOIN patients p ON p.id = a.patient_id
       INNER JOIN users pu ON pu.id = p.user_id
       INNER JOIN doctors doc ON doc.id = a.doctor_id
       INNER JOIN users du ON du.id = doc.user_id
       INNER JOIN departments dept ON dept.id = a.department_id
       ORDER BY a.id DESC LIMIT 100`
    )
    .all();

  const activityLogs = db
    .prepare("SELECT id, actor_name, actor_role, action, details, created_at FROM activity_logs ORDER BY id DESC LIMIT 40")
    .all();

  res.json({
    stats: {
      totalPatients,
      totalDoctors,
      totalAppointments,
      pendingOrConfirmed,
      completedAppointments,
    },
    doctors,
    patients,
    departments,
    appointments,
    activityLogs,
  });
});

apiRouter.post("/admin/doctors", requireAuth, requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const fullName = String(req.body?.fullName ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const phone = String(req.body?.phone ?? "").trim();
  const password = String(req.body?.password ?? "");
  const departmentId = Number(req.body?.departmentId);
  const specialization = String(req.body?.specialization ?? "").trim();
  const qualification = String(req.body?.qualification ?? "").trim();
  const experienceYears = Number(req.body?.experienceYears ?? 5);
  const location = String(req.body?.location ?? "").trim();
  const consultationFee = Number(req.body?.consultationFee ?? 100);
  const bio = String(req.body?.bio ?? "").trim();

  if (fullName.length < 3 || !VALID_EMAIL.test(email) || phone.length < 7 || !Number.isInteger(departmentId) || !specialization || !qualification || !location) {
    res.status(400).json({ error: "Please fill all required doctor fields." });
    return;
  }
  if (password && password.length < 8) {
    res.status(400).json({ error: "If providing an initial password, it must be at least 8 characters." });
    return;
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    res.status(409).json({ error: "A user with this email already exists." });
    return;
  }

  const passwordHash = password ? hashPassword(password) : null;
  db.exec("BEGIN IMMEDIATE");
  try {
    const userRes = db
      .prepare("INSERT INTO users (full_name, email, password_hash, role, phone) VALUES (?, ?, ?, 'doctor', ?)")
      .run(fullName, email, passwordHash, phone);
    const userId = Number(userRes.lastInsertRowid);

    const docRes = db
      .prepare(
        `INSERT INTO doctors (user_id, department_id, specialization, qualification, experience_years, location, consultation_fee, bio, avatar_url, is_featured)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 0)`
      )
      .run(userId, departmentId, specialization, qualification, experienceYears, location, consultationFee, bio);
    const doctorId = Number(docRes.lastInsertRowid);

    const insertAvail = db.prepare(
      "INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, is_active) VALUES (?, ?, ?, ?, 30, 1)"
    );
    for (const day of [1, 2, 3, 4, 5]) {
      insertAvail.run(doctorId, day, "09:00", "12:00");
      insertAvail.run(doctorId, day, "14:00", "17:00");
    }

    logActivity(req.user!.fullName, "admin", "DOCTOR_CREATED", `Added ${fullName} (${specialization}).`);
    db.exec("COMMIT");
    res.status(201).json({ id: doctorId, message: "Doctor profile created." });
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("Create doctor error:", err);
    res.status(500).json({ error: "Could not create doctor profile." });
  }
});

apiRouter.put("/admin/doctors/:id", requireAuth, requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const doctorId = Number(req.params.id);
  const fullName = String(req.body?.fullName ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  const departmentId = Number(req.body?.departmentId);
  const specialization = String(req.body?.specialization ?? "").trim();
  const qualification = String(req.body?.qualification ?? "").trim();
  const experienceYears = Number(req.body?.experienceYears ?? 1);
  const location = String(req.body?.location ?? "").trim();
  const consultationFee = Number(req.body?.consultationFee ?? 100);
  const bio = String(req.body?.bio ?? "").trim();
  const isFeatured = req.body?.isFeatured ? 1 : 0;

  const existing = db.prepare("SELECT user_id FROM doctors WHERE id = ?").get(doctorId) as { user_id: number } | undefined;
  if (!existing) {
    res.status(404).json({ error: "Doctor not found." });
    return;
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE users SET full_name = ?, phone = ? WHERE id = ?").run(fullName, phone, existing.user_id);
    db.prepare(
      `UPDATE doctors SET department_id = ?, specialization = ?, qualification = ?, experience_years = ?, location = ?, consultation_fee = ?, bio = ?, is_featured = ?
       WHERE id = ?`
    ).run(departmentId, specialization, qualification, experienceYears, location, consultationFee, bio, isFeatured, doctorId);
    logActivity(req.user!.fullName, "admin", "DOCTOR_UPDATED", `Updated profile for ${fullName}.`);
    db.exec("COMMIT");
    res.json({ message: "Doctor profile updated." });
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("Update doctor error:", err);
    res.status(500).json({ error: "Could not update doctor." });
  }
});

apiRouter.delete("/admin/doctors/:id", requireAuth, requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const doctorId = Number(req.params.id);
  const doc = db
    .prepare("SELECT d.user_id, u.full_name FROM doctors d INNER JOIN users u ON u.id = d.user_id WHERE d.id = ?")
    .get(doctorId) as { user_id: number; full_name: string } | undefined;

  if (!doc) {
    res.status(404).json({ error: "Doctor not found." });
    return;
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(doc.user_id);
  logActivity(req.user!.fullName, "admin", "DOCTOR_DELETED", `Removed ${doc.full_name} from platform.`);
  res.json({ message: "Doctor deleted." });
});

apiRouter.post("/admin/departments", requireAuth, requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const name = String(req.body?.name ?? "").trim();
  const description = String(req.body?.description ?? "").trim();
  const locationWing = String(req.body?.locationWing ?? "").trim();
  if (name.length < 2 || !description || !locationWing) {
    res.status(400).json({ error: "Department name, description, and wing location are required." });
    return;
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  try {
    const info = db
      .prepare("INSERT INTO departments (name, slug, description, location_wing) VALUES (?, ?, ?, ?)")
      .run(name, slug, description, locationWing);
    logActivity(req.user!.fullName, "admin", "DEPARTMENT_CREATED", `Created department: ${name}.`);
    res.status(201).json({ id: Number(info.lastInsertRowid), name, slug });
  } catch {
    res.status(409).json({ error: "Department with that name already exists." });
  }
});

apiRouter.delete("/admin/departments/:id", requireAuth, requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const deptId = Number(req.params.id);
  const count = (db.prepare("SELECT COUNT(*) as c FROM doctors WHERE department_id = ?").get(deptId) as { c: number }).c;
  if (count > 0) {
    res.status(409).json({ error: "Reassign or remove doctors in this department before deleting it." });
    return;
  }
  const info = db.prepare("DELETE FROM departments WHERE id = ?").run(deptId);
  if (info.changes === 0) {
    res.status(404).json({ error: "Department not found." });
    return;
  }
  logActivity(req.user!.fullName, "admin", "DEPARTMENT_DELETED", `Deleted department ID ${deptId}.`);
  res.json({ message: "Department deleted." });
});

apiRouter.delete("/admin/patients/:id", requireAuth, requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const patientId = Number(req.params.id);
  const p = db
    .prepare("SELECT p.user_id, u.full_name FROM patients p INNER JOIN users u ON u.id = p.user_id WHERE p.id = ?")
    .get(patientId) as { user_id: number; full_name: string } | undefined;
  if (!p) {
    res.status(404).json({ error: "Patient not found." });
    return;
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(p.user_id);
  logActivity(req.user!.fullName, "admin", "PATIENT_DELETED", `Removed patient account: ${p.full_name}.`);
  res.json({ message: "Patient account deleted." });
});

apiRouter.patch("/admin/appointments/:id/status", requireAuth, requireRole("admin"), (req: AuthenticatedRequest, res: Response) => {
  const apptId = Number(req.params.id);
  const status = String(req.body?.status ?? "").trim();
  if (!["Pending", "Confirmed", "Completed", "Cancelled", "Rejected"].includes(status)) {
    res.status(400).json({ error: "Invalid appointment status." });
    return;
  }
  const info = db.prepare("UPDATE appointments SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, apptId);
  if (info.changes === 0) {
    res.status(404).json({ error: "Appointment not found." });
    return;
  }
  logActivity(req.user!.fullName, "admin", "APPOINTMENT_ADMIN_OVERRIDE", `Updated appointment #${apptId} to ${status}.`);
  res.json({ message: "Appointment status updated." });
});

// ==========================================
// AI HEALTHCARE CHATBOT ENDPOINT (Gemini API)
// ==========================================

apiRouter.post("/ai/chat", async (req: Request, res: Response) => {
  const message = String(req.body?.message ?? "").trim();
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  if (!message) {
    res.status(400).json({ error: "Message is required." });
    return;
  }

  try {
    const ai = getAiClient();
    const doctors = db
      .prepare(
        `SELECT u.full_name, dept.name as department, doc.specialization, doc.location, doc.experience_years
         FROM doctors doc
         INNER JOIN users u ON u.id = doc.user_id
         INNER JOIN departments dept ON dept.id = doc.department_id`
      )
      .all() as Array<{ full_name: string; department: string; specialization: string; location: string; experience_years: number }>;

    const directoryContext = doctors
      .map((d) => `- ${d.full_name} (${d.department} · ${d.specialization}, ${d.experience_years} yrs exp, ${d.location})`)
      .join("\n");

    const systemInstruction = `You are SmartCare Health Guide, a helpful, empathetic healthcare assistant for the SmartCare Appointment Booking System.
Your role:
1. Provide clear, general health information in plain language (never diagnose definitively or prescribe medications).
2. Recommend the appropriate SmartCare medical department and specific doctor from the live directory below based on the user's needs.
3. Guide users on how to book an appointment in SmartCare (choose department, doctor, date, and open time slot).
4. Always include a brief note for urgent/emergency symptoms (chest pain, difficulty breathing, severe bleeding, sudden stroke signs) to call emergency services (911) immediately.
Keep responses concise, structured, and under 160 words.

SmartCare Live Specialist Directory:
${directoryContext}`;

    const transcript = history
      .slice(-6)
      .map((item: { role?: string; text?: string }) => `${item.role === "assistant" ? "Assistant" : "Patient"}: ${String(item.text ?? "")}`)
      .join("\n");

    const prompt = transcript ? `${transcript}\nPatient: ${message}` : message;

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config: {
        systemInstruction,
      },
    });

    res.json({ reply: response.text ?? "I am here to help you find the right SmartCare specialist. Could you share a bit more about what you need?" });
  } catch (err: unknown) {
    console.error("AI chat error:", err);
    const msg = err instanceof Error ? err.message : "Unable to reach the healthcare assistant.";
    res.status(502).json({ error: msg });
  }
});
