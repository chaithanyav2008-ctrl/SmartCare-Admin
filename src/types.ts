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

export interface Department {
  id: number;
  name: string;
  slug: string;
  description: string;
  location_wing: string;
  doctor_count: number;
}

export interface AvailabilityWindow {
  id?: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  is_active?: number;
}

export interface Doctor {
  id: number;
  user_id?: number;
  full_name: string;
  email: string;
  phone: string;
  is_claimed?: number;
  department_id: number;
  department_name: string;
  specialization: string;
  qualification: string;
  experience_years: number;
  location: string;
  consultation_fee: number;
  bio: string;
  avatar_url: string;
  is_featured: number;
  availability?: AvailabilityWindow[];
}

export interface TimeSlot {
  time: string;
  available: boolean;
  reason?: string;
}

export interface Appointment {
  id: number;
  appointment_code: string;
  patient_id?: number;
  doctor_id?: number;
  department_id?: number;
  appointment_date: string;
  time_slot: string;
  reason: string;
  status: "Pending" | "Confirmed" | "Completed" | "Cancelled" | "Rejected";
  consultation_notes?: string;
  created_at?: string;
  doctor_name?: string;
  specialization?: string;
  location?: string;
  consultation_fee?: number;
  department_name?: string;
  patient_name?: string;
  patient_email?: string;
  patient_phone?: string;
  patient_age?: number;
  patient_gender?: string;
  blood_group?: string;
  allergies?: string;
}

export interface MedicalRecord {
  id: number;
  record_date: string;
  diagnosis: string;
  prescription: string;
  vitals: string;
  notes: string;
  doctor_name?: string;
  specialization?: string;
}

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  channel: "in-app" | "email";
  recipient_email?: string;
  is_read: number;
  created_at: string;
}

export interface PatientProfile {
  user_id: number;
  full_name: string;
  email: string;
  phone: string;
  patient_id: number;
  age: number;
  gender: "Male" | "Female" | "Other" | "Prefer not to say";
  blood_group: string;
  allergies: string;
  emergency_contact: string;
  address: string;
}
