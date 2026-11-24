import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Calendar,
  Clock,
  FileText,
  LogOut,
  Plus,
  RefreshCw,
  UserCheck,
  X,
} from "lucide-react";
import { apiRequest } from "../lib/api.ts";
import type {
  AppNotification,
  Appointment,
  AuthUser,
  MedicalRecord,
  PatientProfile,
  TimeSlot,
} from "../types.ts";

interface PatientDashboardProps {
  user: AuthUser;
  refreshSignal: number;
  onBookNew: () => void;
  onLogout: () => void;
  onUserUpdated: (user: AuthUser) => void;
}

type PatientTab = "upcoming" | "previous" | "records" | "reminders" | "profile";

function statusTextClass(status: Appointment["status"]): string {
  switch (status) {
    case "Confirmed":
      return "text-[#4CAF50] font-semibold";
    case "Pending":
      return "text-amber-700 font-semibold";
    case "Completed":
      return "text-[#1976D2] font-semibold";
    case "Cancelled":
    case "Rejected":
      return "text-red-600 font-semibold";
  }
}

export function PatientDashboard({
  user,
  refreshSignal,
  onBookNew,
  onLogout,
  onUserUpdated,
}: PatientDashboardProps) {
  const [tab, setTab] = useState<PatientTab>("upcoming");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Reschedule modal state
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState("");
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [newSlot, setNewSlot] = useState("");
  const [rescheduling, setRescheduling] = useState(false);

  // Profile form state
  const [pName, setPName] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pAge, setPAge] = useState("28");
  const [pGender, setPGender] = useState<PatientProfile["gender"]>("Female");
  const [pBlood, setPBlood] = useState("Unknown");
  const [pAllergies, setPAllergies] = useState("");
  const [pEmergency, setPEmergency] = useState("");
  const [pAddress, setPAddress] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest<{
        profile: PatientProfile;
        appointments: Appointment[];
        medicalRecords: MedicalRecord[];
        notifications: AppNotification[];
      }>("/api/patient/dashboard");
      setProfile(res.profile);
      setAppointments(res.appointments);
      setRecords(res.medicalRecords);
      setNotifications(res.notifications);

      if (res.profile) {
        setPName(res.profile.full_name);
        setPPhone(res.profile.phone);
        setPAge(String(res.profile.age));
        setPGender(res.profile.gender);
        setPBlood(res.profile.blood_group || "Unknown");
        setPAllergies(res.profile.allergies || "");
        setPEmergency(res.profile.emergency_contact || "");
        setPAddress(res.profile.address || "");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load patient dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, refreshSignal]);

  useEffect(() => {
    if (!rescheduleTarget || !newDate || !rescheduleTarget.doctor_id) return;
    setNewSlot("");
    apiRequest<{ slots: TimeSlot[] }>(
      `/api/doctors/${rescheduleTarget.doctor_id}/slots?date=${encodeURIComponent(newDate)}`
    )
      .then((res) => setSlots(res.slots))
      .catch(() => setSlots([]));
  }, [rescheduleTarget, newDate]);

  const upcomingAppointments = appointments.filter((a) =>
    ["Pending", "Confirmed"].includes(a.status)
  );
  const previousAppointments = appointments.filter((a) =>
    ["Completed", "Cancelled", "Rejected"].includes(a.status)
  );
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleCancel = async (appt: Appointment) => {
    setActionMessage("");
    setError("");
    try {
      await apiRequest(`/api/appointments/${appt.id}/cancel`, { method: "PATCH" });
      setActionMessage(`Appointment ${appt.appointment_code} has been cancelled.`);
      loadDashboard();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not cancel appointment.");
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget || !newDate || !newSlot) return;
    setRescheduling(true);
    setError("");
    try {
      await apiRequest(`/api/appointments/${rescheduleTarget.id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify({ appointmentDate: newDate, timeSlot: newSlot }),
      });
      setActionMessage(`Appointment ${rescheduleTarget.appointment_code} rescheduled to ${newDate} at ${newSlot}.`);
      setRescheduleTarget(null);
      loadDashboard();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reschedule failed.");
    } finally {
      setRescheduling(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setError("");
    setActionMessage("");
    try {
      const res = await apiRequest<{ message: string; user: AuthUser }>("/api/patient/profile", {
        method: "PUT",
        body: JSON.stringify({
          fullName: pName,
          phone: pPhone,
          age: Number(pAge),
          gender: pGender,
          bloodGroup: pBlood,
          allergies: pAllergies,
          emergencyContact: pEmergency,
          address: pAddress,
        }),
      });
      onUserUpdated(res.user);
      setActionMessage("Patient profile saved.");
      loadDashboard();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleMarkAllRead = async () => {
    await apiRequest("/api/notifications/read-all", { method: "POST" });
    loadDashboard();
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <section className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 border-b border-[#DCE7F5] pb-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold text-[#1976D2]">Patient Portal</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#0F172A] sm:text-3xl">
            Welcome, {user.fullName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {user.email} · {user.phone}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBookNew}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1976D2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1565C0] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Book Appointment</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-lg border border-[#DCE7F5] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Row */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[#DCE7F5] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Upcoming Visits</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#0F172A] tabular-nums">
            {upcomingAppointments.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#DCE7F5] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Previous Visits</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#0F172A] tabular-nums">
            {previousAppointments.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#DCE7F5] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Medical Records</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#0F172A] tabular-nums">
            {records.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#DCE7F5] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Unread Reminders</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#1976D2] tabular-nums">
            {unreadCount}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {actionMessage && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {actionMessage}
        </div>
      )}

      {/* Workspace layout: Sidebar + Main Panel */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-1">
          {[
            { id: "upcoming" as const, label: "Upcoming Appointments", icon: Calendar },
            { id: "previous" as const, label: "Previous Visits", icon: Clock },
            { id: "records" as const, label: "Medical History", icon: FileText },
            { id: "reminders" as const, label: `Reminders (${unreadCount})`, icon: Bell },
            { id: "profile" as const, label: "Profile Management", icon: UserCheck },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#1976D2] text-white"
                    : "text-slate-700 hover:bg-white hover:text-[#1976D2]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </aside>

        <div className="min-w-0 rounded-2xl border border-[#DCE7F5] bg-white p-6">
          {loading ? (
            <div className="space-y-3">
              <div className="h-6 w-48 animate-pulse rounded bg-slate-100" />
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : tab === "upcoming" ? (
            <div>
              <div className="flex items-center justify-between border-b border-[#DCE7F5] pb-4">
                <h2 className="font-display text-lg font-bold text-[#0F172A]">Upcoming Appointments</h2>
                <button
                  type="button"
                  onClick={loadDashboard}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1976D2] hover:underline"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Refresh</span>
                </button>
              </div>

              {upcomingAppointments.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-slate-600">You have no upcoming appointments scheduled.</p>
                  <button
                    type="button"
                    onClick={onBookNew}
                    className="mt-4 rounded-lg bg-[#1976D2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1565C0]"
                  >
                    Book Your First Visit
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[#DCE7F5]">
                  {upcomingAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-semibold text-[#1976D2] tabular-nums">
                            {appt.appointment_code}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{appt.department_name}</span>
                          <span aria-hidden="true">·</span>
                          <span className={statusTextClass(appt.status)}>{appt.status}</span>
                        </div>
                        <p className="mt-1 font-display text-base font-bold text-slate-900">
                          {appt.doctor_name}
                        </p>
                        <p className="text-sm text-slate-600">
                          <span className="font-mono tabular-nums">
                            {appt.appointment_date} at {appt.time_slot}
                          </span>{" "}
                          · {appt.location}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Reason: {appt.reason}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRescheduleTarget(appt);
                            setNewDate(appt.appointment_date >= todayStr ? appt.appointment_date : todayStr);
                          }}
                          className="rounded-lg border border-[#DCE7F5] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#1976D2] hover:text-[#1976D2]"
                        >
                          Reschedule
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancel(appt)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : tab === "previous" ? (
            <div>
              <h2 className="border-b border-[#DCE7F5] pb-4 font-display text-lg font-bold text-[#0F172A]">
                Previous Appointments
              </h2>
              {previousAppointments.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-600">
                  Completed, cancelled, or past appointments will appear here.
                </p>
              ) : (
                <div className="divide-y divide-[#DCE7F5]">
                  {previousAppointments.map((appt) => (
                    <div key={appt.id} className="py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-semibold text-slate-700 tabular-nums">
                            {appt.appointment_code}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {appt.appointment_date} {appt.time_slot}
                          </span>
                        </div>
                        <span className={`text-xs ${statusTextClass(appt.status)}`}>{appt.status}</span>
                      </div>
                      <p className="mt-1 font-display text-base font-bold text-slate-900">
                        {appt.doctor_name} · <span className="font-normal text-slate-600">{appt.department_name}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-600">Reason: {appt.reason}</p>
                      {appt.consultation_notes && (
                        <p className="mt-2 rounded-lg bg-[#F4F9FF] p-3 text-xs text-slate-700">
                          Doctor Notes: {appt.consultation_notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : tab === "records" ? (
            <div>
              <h2 className="border-b border-[#DCE7F5] pb-4 font-display text-lg font-bold text-[#0F172A]">
                Medical History & Prescriptions
              </h2>
              {records.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-600">
                  No clinical records have been added yet. Records appear automatically after completed consultations.
                </p>
              ) : (
                <div className="divide-y divide-[#DCE7F5]">
                  {records.map((rec) => (
                    <div key={rec.id} className="py-4">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-mono tabular-nums">{rec.record_date}</span>
                        <span>{rec.doctor_name || "Attending Physician"}</span>
                      </div>
                      <p className="mt-1 font-display text-base font-bold text-slate-900">{rec.diagnosis}</p>
                      <p className="mt-1 text-sm text-slate-700">
                        <span className="font-semibold">Prescription:</span> {rec.prescription}
                      </p>
                      {rec.vitals && (
                        <p className="mt-1 font-mono text-xs text-slate-600 tabular-nums">
                          Vitals: {rec.vitals}
                        </p>
                      )}
                      {rec.notes && <p className="mt-1 text-xs text-slate-500">{rec.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : tab === "reminders" ? (
            <div>
              <div className="flex items-center justify-between border-b border-[#DCE7F5] pb-4">
                <h2 className="font-display text-lg font-bold text-[#0F172A]">
                  Appointment Reminders & Notifications
                </h2>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-xs font-semibold text-[#1976D2] hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-600">No notifications yet.</p>
              ) : (
                <div className="divide-y divide-[#DCE7F5]">
                  {notifications.map((n) => (
                    <div key={n.id} className="py-3.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          {n.channel === "email" ? "Email Reminder" : "In-App Alert"} ·{" "}
                          {n.is_read ? "Read" : "Unread"}
                        </span>
                        <span className="font-mono tabular-nums">{n.created_at}</span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-slate-900">{n.title}</p>
                      <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <h2 className="border-b border-[#DCE7F5] pb-4 font-display text-lg font-bold text-[#0F172A]">
                Profile & Emergency Details
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Full Name</label>
                  <input
                    type="text"
                    required
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={pPhone}
                    onChange={(e) => setPPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Age</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    required
                    value={pAge}
                    onChange={(e) => setPAge(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Gender</label>
                  <select
                    value={pGender}
                    onChange={(e) => setPGender(e.target.value as PatientProfile["gender"])}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Blood Group</label>
                  <select
                    value={pBlood}
                    onChange={(e) => setPBlood(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm"
                  >
                    {["Unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Emergency Contact</label>
                  <input
                    type="text"
                    value={pEmergency}
                    onChange={(e) => setPEmergency(e.target.value)}
                    placeholder="Name & phone number"
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">Known Allergies</label>
                  <input
                    type="text"
                    value={pAllergies}
                    onChange={(e) => setPAllergies(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">Address</label>
                  <input
                    type="text"
                    value={pAddress}
                    onChange={(e) => setPAddress(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={savingProfile}
                className="rounded-lg bg-[#1976D2] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1565C0] disabled:opacity-60"
              >
                {savingProfile ? "Saving..." : "Save Profile"}
              </button>
              {profile && (
                <p className="text-xs text-slate-500">Email: {profile.email}</p>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-md rounded-2xl border border-[#DCE7F5] bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setRescheduleTarget(null)}
              aria-label="Close reschedule dialog"
              className="absolute top-4 right-4 rounded-lg border border-[#DCE7F5] p-1.5 text-slate-500 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="font-display text-lg font-bold text-[#0F172A]">
              Reschedule {rescheduleTarget.appointment_code}
            </h3>
            <p className="mt-1 text-xs text-slate-600">{rescheduleTarget.doctor_name}</p>
            <form onSubmit={handleRescheduleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">New Date</label>
                <input
                  type="date"
                  min={todayStr}
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Available Slots</label>
                {slots.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">No consultation slots on this date.</p>
                ) : (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {slots.map((s) => (
                      <button
                        key={s.time}
                        type="button"
                        disabled={!s.available}
                        onClick={() => setNewSlot(s.time)}
                        className={`rounded-lg border px-2 py-1.5 font-mono text-xs tabular-nums ${
                          !s.available
                            ? "cursor-not-allowed bg-slate-100 text-slate-400 line-through"
                            : newSlot === s.time
                            ? "border-[#1976D2] bg-[#1976D2] text-white"
                            : "border-[#DCE7F5] bg-white text-slate-700 hover:border-[#1976D2]"
                        }`}
                      >
                        {s.time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRescheduleTarget(null)}
                  className="rounded-lg border border-[#DCE7F5] px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduling || !newSlot}
                  className="rounded-lg bg-[#1976D2] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {rescheduling ? "Updating..." : "Save New Time"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
