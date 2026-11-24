import { db } from "./db.ts";

export interface NotificationInput {
  userId: number;
  title: string;
  message: string;
  recipientEmail?: string;
  channel?: "in-app" | "email";
}

export function createNotification(input: NotificationInput): void {
  const channel = input.channel ?? "in-app";
  const email = input.recipientEmail ?? "";
  db.prepare(
    "INSERT INTO notifications (user_id, title, message, channel, recipient_email) VALUES (?, ?, ?, ?, ?)"
  ).run(input.userId, input.title, input.message, channel, email);
}

export function sendAppointmentReminderPair(params: {
  patientUserId: number;
  patientEmail: string;
  patientName: string;
  doctorUserId: number;
  doctorEmail: string;
  doctorName: string;
  appointmentCode: string;
  date: string;
  timeSlot: string;
  eventLabel: string;
}): void {
  createNotification({
    userId: params.patientUserId,
    title: `Appointment ${params.eventLabel} · ${params.appointmentCode}`,
    message: `Your visit with ${params.doctorName} on ${params.date} at ${params.timeSlot} is ${params.eventLabel.toLowerCase()}. Automated reminder queued for ${params.patientEmail}.`,
    channel: "email",
    recipientEmail: params.patientEmail,
  });

  createNotification({
    userId: params.doctorUserId,
    title: `Schedule Update · ${params.appointmentCode}`,
    message: `Patient ${params.patientName} (${params.date} at ${params.timeSlot}) status: ${params.eventLabel}.`,
    channel: "in-app",
    recipientEmail: params.doctorEmail,
  });
}

export function logActivity(actorName: string, actorRole: string, action: string, details: string): void {
  db.prepare(
    "INSERT INTO activity_logs (actor_name, actor_role, action, details) VALUES (?, ?, ?, ?)"
  ).run(actorName, actorRole, action, details);
}
