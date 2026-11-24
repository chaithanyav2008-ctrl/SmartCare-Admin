-- SmartCare – Smart Healthcare Appointment Booking System
-- MySQL 8.0+ Relational Schema Reference (all 8 core tables with PKs, FKs, and indexes)

CREATE DATABASE IF NOT EXISTS smartcare_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smartcare_db;

CREATE TABLE Users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  role ENUM('patient', 'doctor', 'admin') NOT NULL DEFAULT 'patient',
  phone VARCHAR(30) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  location_wing VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  age INT NOT NULL,
  gender ENUM('Male', 'Female', 'Other', 'Prefer not to say') NOT NULL,
  blood_group VARCHAR(10) DEFAULT 'Unknown',
  allergies TEXT,
  emergency_contact VARCHAR(120),
  address VARCHAR(255),
  CONSTRAINT fk_patients_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE TABLE Doctors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  department_id INT NOT NULL,
  specialization VARCHAR(120) NOT NULL,
  qualification VARCHAR(160) NOT NULL,
  experience_years INT NOT NULL DEFAULT 1,
  location VARCHAR(160) NOT NULL,
  consultation_fee DECIMAL(10, 2) NOT NULL DEFAULT 75.00,
  bio TEXT,
  avatar_url VARCHAR(255),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_doctors_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  CONSTRAINT fk_doctors_department FOREIGN KEY (department_id) REFERENCES Departments(id) ON DELETE RESTRICT
);

CREATE TABLE Doctor_Availability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  day_of_week TINYINT NOT NULL COMMENT '0=Sunday .. 6=Saturday',
  start_time CHAR(5) NOT NULL COMMENT 'HH:MM 24h',
  end_time CHAR(5) NOT NULL COMMENT 'HH:MM 24h',
  slot_duration_minutes INT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_doctor_day_start (doctor_id, day_of_week, start_time),
  CONSTRAINT fk_availability_doctor FOREIGN KEY (doctor_id) REFERENCES Doctors(id) ON DELETE CASCADE
);

CREATE TABLE Appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_code VARCHAR(32) NOT NULL UNIQUE,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  department_id INT NOT NULL,
  appointment_date DATE NOT NULL,
  time_slot CHAR(5) NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('Pending', 'Confirmed', 'Completed', 'Cancelled', 'Rejected') NOT NULL DEFAULT 'Confirmed',
  consultation_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_appointments_doctor_date (doctor_id, appointment_date),
  KEY idx_appointments_patient (patient_id),
  CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id) REFERENCES Patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_appointments_doctor FOREIGN KEY (doctor_id) REFERENCES Doctors(id) ON DELETE CASCADE,
  CONSTRAINT fk_appointments_department FOREIGN KEY (department_id) REFERENCES Departments(id) ON DELETE RESTRICT
);

CREATE TABLE Medical_Records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT NULL,
  appointment_id INT NULL,
  record_date DATE NOT NULL,
  diagnosis VARCHAR(255) NOT NULL,
  prescription TEXT NOT NULL,
  vitals VARCHAR(160),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_records_patient FOREIGN KEY (patient_id) REFERENCES Patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_records_doctor FOREIGN KEY (doctor_id) REFERENCES Doctors(id) ON DELETE SET NULL,
  CONSTRAINT fk_records_appointment FOREIGN KEY (appointment_id) REFERENCES Appointments(id) ON DELETE SET NULL
);

CREATE TABLE Notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  channel ENUM('in-app', 'email') NOT NULL DEFAULT 'in-app',
  recipient_email VARCHAR(160),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);
