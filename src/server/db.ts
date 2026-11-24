import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const dbPath = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : path.resolve(process.cwd(), "smartcare.db");

export const db = new DatabaseSync(dbPath);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      location_wing TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
      blood_group TEXT NOT NULL DEFAULT 'Unknown',
      allergies TEXT NOT NULL DEFAULT 'None reported',
      emergency_contact TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      department_id INTEGER NOT NULL,
      specialization TEXT NOT NULL,
      qualification TEXT NOT NULL,
      experience_years INTEGER NOT NULL DEFAULT 1,
      location TEXT NOT NULL,
      consultation_fee REAL NOT NULL DEFAULT 85.0,
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      is_featured INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS doctor_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      slot_duration_minutes INTEGER NOT NULL DEFAULT 30,
      is_active INTEGER NOT NULL DEFAULT 1,
      UNIQUE (doctor_id, day_of_week, start_time),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_code TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      department_id INTEGER NOT NULL,
      appointment_date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Confirmed' CHECK (status IN ('Pending', 'Confirmed', 'Completed', 'Cancelled', 'Rejected')),
      consultation_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_slot
      ON appointments (doctor_id, appointment_date, time_slot)
      WHERE status IN ('Pending', 'Confirmed', 'Completed');

    CREATE TABLE IF NOT EXISTS medical_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER,
      appointment_id INTEGER,
      record_date TEXT NOT NULL,
      diagnosis TEXT NOT NULL,
      prescription TEXT NOT NULL,
      vitals TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'in-app' CHECK (channel IN ('in-app', 'email')),
      recipient_email TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  seedInitialData();
}

function seedInitialData(): void {
  const deptCount = (db.prepare("SELECT COUNT(*) as count FROM departments").get() as { count: number }).count;
  if (deptCount > 0) {
    return;
  }

  const insertDept = db.prepare(
    "INSERT INTO departments (name, slug, description, location_wing) VALUES (?, ?, ?, ?)"
  );

  const departments = [
    ["Cardiology", "cardiology", "Preventive heart care, echocardiography, arrhythmia management, and interventional cardiology.", "Building A · Floor 3"],
    ["Neurology", "neurology", "Comprehensive diagnostics for migraines, epilepsy, stroke recovery, and neuromuscular disorders.", "Building B · Floor 2"],
    ["Pediatrics", "pediatrics", "Infant wellness, childhood immunizations, developmental screenings, and acute pediatric care.", "Family Pavilion · Floor 1"],
    ["Orthopedics", "orthopedics", "Sports medicine, joint preservation, fracture care, spine evaluation, and physical rehabilitation.", "Surgical Wing · Floor 2"],
    ["Dermatology", "dermatology", "Clinical skin cancer screening, eczema and psoriasis care, and dermatologic procedures.", "Outpatient Plaza · Floor 4"],
    ["Internal Medicine", "internal-medicine", "Primary adult care, chronic disease management, annual physicals, and preventive diagnostics.", "Building A · Floor 1"],
  ];

  const deptMap = new Map<string, number>();
  for (const [name, slug, description, wing] of departments) {
    const info = insertDept.run(name, slug, description, wing);
    deptMap.set(slug, Number(info.lastInsertRowid));
  }

  const insertUser = db.prepare(
    "INSERT INTO users (full_name, email, password_hash, role, phone) VALUES (?, ?, NULL, 'doctor', ?)"
  );
  const insertDoctor = db.prepare(
    `INSERT INTO doctors (
      user_id, department_id, specialization, qualification, experience_years,
      location, consultation_fee, bio, avatar_url, is_featured
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertAvailability = db.prepare(
    "INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, is_active) VALUES (?, ?, ?, ?, ?, 1)"
  );

  const sampleDoctors = [
    {
      fullName: "Dr. Elena Brooks",
      email: "elena.brooks@smartcare.health",
      phone: "+1 (555) 234-8810",
      deptSlug: "cardiology",
      specialization: "Interventional & Preventive Cardiology",
      qualification: "MD, FACC · Johns Hopkins Medicine",
      experienceYears: 14,
      location: "Main Medical Campus · Downtown",
      fee: 140,
      bio: "Board-certified cardiologist specializing in non-invasive cardiac imaging, hypertension control, and preventive lipid care.",
      avatarUrl: "/src/assets/images/doctor_cardiology_1795498316950.jpg",
      featured: 1,
      days: [1, 2, 3, 4, 5],
    },
    {
      fullName: "Dr. David Alistair",
      email: "david.alistair@smartcare.health",
      phone: "+1 (555) 234-8824",
      deptSlug: "neurology",
      specialization: "Clinical Neurology & Headache Medicine",
      qualification: "MD, PhD · Stanford Neurology",
      experienceYears: 16,
      location: "Northside Specialty Center",
      fee: 155,
      bio: "Neurologist focused on migraine therapeutics, neuro-electrophysiology, and cognitive health management.",
      avatarUrl: "/src/assets/images/doctor_neurology_1795498318052.jpg",
      featured: 1,
      days: [1, 2, 4, 5, 6],
    },
    {
      fullName: "Dr. Sarah Jenkins",
      email: "sarah.jenkins@smartcare.health",
      phone: "+1 (555) 234-8839",
      deptSlug: "pediatrics",
      specialization: "General Pediatrics & Adolescent Care",
      qualification: "MD, FAAP · Boston Children's",
      experienceYears: 11,
      location: "Family Pavilion · Westside",
      fee: 95,
      bio: "Dedicated pediatrician partnering with families from newborn wellness through adolescent preventive medicine.",
      avatarUrl: "/src/assets/images/doctor_pediatrics_1795498316913.jpg",
      featured: 1,
      days: [1, 2, 3, 4, 5, 6],
    },
    {
      fullName: "Dr. David Chen",
      email: "david.chen@smartcare.health",
      phone: "+1 (555) 234-8852",
      deptSlug: "orthopedics",
      specialization: "Orthopedic Sports Medicine",
      qualification: "MD, FAAOS · Hospital for Special Surgery",
      experienceYears: 13,
      location: "Surgical & Rehab Wing · Downtown",
      fee: 160,
      bio: "Orthopedic specialist treating ligament injuries, joint degeneration, and minimally invasive arthroscopic recovery.",
      avatarUrl: "/src/assets/images/doctor_orthopedics_1795498317264.jpg",
      featured: 1,
      days: [1, 3, 4, 5],
    },
    {
      fullName: "Dr. Priya Nair",
      email: "priya.nair@smartcare.health",
      phone: "+1 (555) 234-8867",
      deptSlug: "dermatology",
      specialization: "Medical & Clinical Dermatology",
      qualification: "MD, FAAD · UCSF Dermatology",
      experienceYears: 9,
      location: "Outpatient Plaza · Midtown",
      fee: 115,
      bio: "Focuses on dermoscopy mole mapping, inflammatory skin conditions, and evidence-based cutaneous care.",
      avatarUrl: "",
      featured: 0,
      days: [1, 2, 3, 5],
    },
    {
      fullName: "Dr. Marcus Vance",
      email: "marcus.vance@smartcare.health",
      phone: "+1 (555) 234-8891",
      deptSlug: "internal-medicine",
      specialization: "Internal Medicine & Metabolic Health",
      qualification: "MD, FACP · Mayo Clinic Residency",
      experienceYears: 12,
      location: "Main Medical Campus · Downtown",
      fee: 90,
      bio: "Primary care internist managing complex chronic care, diabetes prevention, and annual diagnostic checkups.",
      avatarUrl: "",
      featured: 0,
      days: [1, 2, 3, 4, 5, 6],
    },
  ];

  for (const doc of sampleDoctors) {
    const userRes = insertUser.run(doc.fullName, doc.email, doc.phone);
    const userId = Number(userRes.lastInsertRowid);
    const deptId = deptMap.get(doc.deptSlug)!;
    const docRes = insertDoctor.run(
      userId,
      deptId,
      doc.specialization,
      doc.qualification,
      doc.experienceYears,
      doc.location,
      doc.fee,
      doc.bio,
      doc.avatarUrl,
      doc.featured
    );
    const doctorId = Number(docRes.lastInsertRowid);
    for (const day of doc.days) {
      insertAvailability.run(doctorId, day, "09:00", "12:00", 30);
      insertAvailability.run(doctorId, day, "14:00", "17:00", 30);
    }
  }

  db.prepare(
    "INSERT INTO activity_logs (actor_name, actor_role, action, details) VALUES (?, ?, ?, ?)"
  ).run("System Initialization", "system", "SEED_COMPLETE", "Initialized 6 medical departments and 6 specialist schedules.");
}
