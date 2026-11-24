import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { db } from "./db.ts";

export type UserRole = "patient" | "doctor" | "admin";

export interface AuthUser {
  id: number;
  fullName: string;
  email: string;
  role: UserRole;
  phone: string;
  patientId?: number;
  doctorId?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString("hex");

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, "hex");
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

export function signToken(payload: { userId: number; role: UserRole; email: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12; // 12h
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): { userId: number; role: UserRole; email: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      userId: number;
      role: UserRole;
      email: string;
      exp: number;
    };
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { userId: parsed.userId, role: parsed.role, email: parsed.email };
  } catch {
    return null;
  }
}

export function loadAuthUserById(userId: number): AuthUser | null {
  const row = db
    .prepare("SELECT id, full_name, email, role, phone FROM users WHERE id = ?")
    .get(userId) as
    | { id: number; full_name: string; email: string; role: UserRole; phone: string }
    | undefined;
  if (!row) return null;

  const user: AuthUser = {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    phone: row.phone,
  };

  if (row.role === "patient") {
    const p = db.prepare("SELECT id FROM patients WHERE user_id = ?").get(row.id) as { id: number } | undefined;
    if (p) user.patientId = p.id;
  } else if (row.role === "doctor") {
    const d = db.prepare("SELECT id FROM doctors WHERE user_id = ?").get(row.id) as { id: number } | undefined;
    if (d) user.doctorId = d.id;
  }
  return user;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: "Invalid or expired session token." });
    return;
  }
  const user = loadAuthUserById(decoded.userId);
  if (!user || user.role !== decoded.role) {
    res.status(401).json({ error: "Account session is no longer valid." });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "You do not have permission to perform this action." });
      return;
    }
    next();
  };
}

export function getAdminConfigurationStatus(): {
  envConfigured: boolean;
  claimedInDb: boolean;
  needsFirstRunSetup: boolean;
  adminEmail: string | null;
} {
  const envPasscode = process.env.ADMIN_PASSCODE?.trim() ?? "";
  const envConfigured = envPasscode.length > 0;
  const adminRow = db
    .prepare("SELECT email, password_hash FROM users WHERE role = 'admin' LIMIT 1")
    .get() as { email: string; password_hash: string | null } | undefined;
  const claimedInDb = Boolean(adminRow && adminRow.password_hash);
  return {
    envConfigured,
    claimedInDb,
    needsFirstRunSetup: !envConfigured && !claimedInDb,
    adminEmail: adminRow?.email ?? null,
  };
}

export function verifyEnvAdminPasscode(inputPasscode: string): boolean {
  const envPasscode = process.env.ADMIN_PASSCODE?.trim() ?? "";
  if (!envPasscode) return false;
  const a = Buffer.from(inputPasscode);
  const b = Buffer.from(envPasscode);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
