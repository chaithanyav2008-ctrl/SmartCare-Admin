import { useCallback, useEffect, useState } from "react";
import { Calendar, Check, Clock, FileText, LogOut, Plus, Trash2, X } from "lucide-react";
import { apiRequest } from "../lib/api.ts";
import type { Appointment, AuthUser, AvailabilityWindow, MedicalRecord } from "../types.ts";
import { DoctorAvatar } from "./DoctorAvatar.tsx";

interface DoctorDashboardProps {
  user: AuthUser;
  onLogout: () => void;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface DoctorProfileInfo {
  doctor_id: number;
  full_name: string;
  email: string;
  phone: string;
  department_name: string;
  specialization: string;
  qualification: string;
  experience_years: number;
  location: string;
  consultation_fee: number;
  bio: string;
  avatar_url: string;
}

export function DoctorDashboard({ user, onLogout }: DoctorDashboardProps) {
  const [tab, setTab] = useState<"appointments" | "availability">("appointments");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [profile, setProfile] = useState<DoctorProfileInfo | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);

  // Complete consultation modal
  const [consultTarget, setConsultTarget] = useState<Appointment | null>(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [prescription, setPrescription] = useState("");
  const [vitals, setVitals] = useState("");
  const [consultationNotes, setConsultationNotes] = useState("");

  // Patient history drawer/modal
  const [historyPatient, setHistoryPatient] = useState<{ name: string; records: MedicalRecord[] } | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest<{
        profile: DoctorProfileInfo;
        availability: AvailabilityWindow[];
        appointments: Appointment[];
      }>("/api/doctor/dashboard");
      setProfile(res.profile);
      setWindows(res.availability);
      setAppointments(res.appointments);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load doctor dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleStatusUpdate = async (
    apptId: number,
    status: "Confirmed" | "Rejected" | "Completed",
    extra?: { diagnosis: string; prescription: string; vitals: string; consultationNotes: string }
  ) => {
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/doctor/appointments/${apptId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...extra,
        }),
      });
      setNotice(`Appointment marked as ${status}.`);
      setConsultTarget(null);
      setDiagnosis("");
      setPrescription("");
      setVitals("");
      setConsultationNotes("");
      loadDashboard();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update appointment.");
    }
  };

  const handleViewPatientHistory = async (patientId: number, patientName: string) => {
    setError("");
    try {
      const res = await apiRequest<{ records: MedicalRecord[] }>(
        `/api/doctor/patients/${patientId}/records`
      );
      setHistoryPatient({ name: patientName, records: res.records });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load patient records.");
    }
  };

  const handleAddWindow = () => {
    setWindows((prev) => [
      ...prev,
      { day_of_week: 1, start_time: "09:00", end_time: "12:00", slot_duration_minutes: 30 },
    ]);
  };

  const handleSaveAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      await apiRequest("/api/doctor/availability", {
        method: "PUT",
        body: JSON.stringify({ windows }),
      });
      setNotice("Weekly schedule availability saved.");
      loadDashboard();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save schedule.");
    }
  };

  const filteredAppointments =
    statusFilter === "All"
      ? appointments
      : appointments.filter((a) => a.status === statusFilter);

  return (
    <section className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      {/* Doctor Profile Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#DCE7F5] bg-white p-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <DoctorAvatar
            name={profile?.full_name || user.fullName}
            src={profile?.avatar_url}
            className="h-18 w-18"
          />
          <div>
            <p className="text-xs font-semibold text-[#1976D2]">
              Doctor Portal · {profile?.department_name || "Medical Staff"}
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-bold text-[#0F172A]">
              {profile?.full_name || user.fullName}
            </h1>
            <p className="mt-0.5 text-sm text-slate-600">
              {profile?.specialization} · {profile?.qualification} · {profile?.experience_years} yrs exp
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{profile?.location}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-[#DCE7F5] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:self-center"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Metrics */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[#DCE7F5] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Patient Bookings</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#0F172A] tabular-nums">
            {appointments.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#DCE7F5] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Confirmed Upcoming</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#4CAF50] tabular-nums">
            {appointments.filter((a) => a.status === "Confirmed" || a.status === "Pending").length}
          </p>
        </div>
        <div className="rounded-xl border border-[#DCE7F5] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Completed Consultations</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#1976D2] tabular-nums">
            {appointments.filter((a) => a.status === "Completed").length}
          </p>
        </div>
        <div className="rounded-xl border border-[#DCE7F5] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Active Schedule Windows</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#0F172A] tabular-nums">
            {windows.length}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="mt-6 flex gap-2 border-b border-[#DCE7F5]">
        <button
          type="button"
          onClick={() => setTab("appointments")}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === "appointments"
              ? "border-[#1976D2] text-[#1976D2]"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Calendar className="h-4 w-4" aria-hidden="true" />
          <span>Patient Appointments</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("availability")}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === "availability"
              ? "border-[#1976D2] text-[#1976D2]"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Clock className="h-4 w-4" aria-hidden="true" />
          <span>Manage Availability Slots</span>
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-[#DCE7F5] bg-white p-6">
        {loading ? (
          <div className="space-y-3">
            <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ) : tab === "appointments" ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCE7F5] pb-4">
              <h2 className="font-display text-lg font-bold text-[#0F172A]">Patient Queue</h2>
              <div className="flex flex-wrap gap-1 rounded-lg bg-[#F4F9FF] p-1 border border-[#DCE7F5]">
                {["All", "Pending", "Confirmed", "Completed", "Cancelled", "Rejected"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      statusFilter === st ? "bg-white text-[#1976D2] shadow-xs" : "text-slate-600"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {filteredAppointments.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-600">
                No appointments match the selected filter.
              </p>
            ) : (
              <div className="divide-y divide-[#DCE7F5]">
                {filteredAppointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="flex flex-col justify-between gap-4 py-4 lg:flex-row lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-[#1976D2] tabular-nums">
                          {appt.appointment_code}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {appt.appointment_date} at {appt.time_slot}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-800">{appt.status}</span>
                      </div>
                      <p className="mt-1 font-display text-base font-bold text-slate-900">
                        {appt.patient_name} ·{" "}
                        <span className="text-sm font-normal text-slate-600">
                          {appt.patient_age} yrs, {appt.patient_gender} · Blood: {appt.blood_group}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Phone: {appt.patient_phone} · Allergies: {appt.allergies || "None"}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">Reason: {appt.reason}</p>
                    </div>

                    <div className="flex flex-wrap shrink-0 items-center gap-2">
                      {appt.patient_id && (
                        <button
                          type="button"
                          onClick={() =>
                            handleViewPatientHistory(appt.patient_id!, appt.patient_name || "Patient")
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-[#DCE7F5] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#1976D2] hover:text-[#1976D2]"
                        >
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Medical History</span>
                        </button>
                      )}
                      {appt.status === "Pending" && (
                        <button
                          type="button"
                          onClick={() => handleStatusUpdate(appt.id, "Confirmed")}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#4CAF50] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Accept</span>
                        </button>
                      )}
                      {(appt.status === "Pending" || appt.status === "Confirmed") && (
                        <>
                          <button
                            type="button"
                            onClick={() => setConsultTarget(appt)}
                            className="rounded-lg bg-[#1976D2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1565C0]"
                          >
                            Complete Consultation
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusUpdate(appt.id, "Rejected")}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSaveAvailability} className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#DCE7F5] pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-[#0F172A]">Weekly Consultation Hours</h2>
                <p className="text-xs text-slate-600">
                  Patients book real-time slots generated from these active windows.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddWindow}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE7F5] px-3 py-1.5 text-xs font-semibold text-[#1976D2] hover:bg-[#F4F9FF]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Window</span>
              </button>
            </div>

            {windows.length === 0 ? (
              <p className="py-6 text-sm text-slate-600">
                No availability windows configured. Add at least one weekday window.
              </p>
            ) : (
              <div className="space-y-3">
                {windows.map((w, idx) => (
                  <div
                    key={idx}
                    className="grid items-center gap-3 rounded-xl border border-[#DCE7F5] bg-[#F4F9FF] p-3 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto]"
                  >
                    <select
                      value={w.day_of_week}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setWindows((prev) => prev.map((row, i) => (i === idx ? { ...row, day_of_week: val } : row)));
                      }}
                      className="rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm"
                    >
                      {WEEKDAYS.map((day, dIdx) => (
                        <option key={day} value={dIdx}>
                          {day}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={w.start_time}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWindows((prev) => prev.map((row, i) => (i === idx ? { ...row, start_time: val } : row)));
                      }}
                      className="rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 font-mono text-sm tabular-nums"
                    />
                    <input
                      type="time"
                      value={w.end_time}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWindows((prev) => prev.map((row, i) => (i === idx ? { ...row, end_time: val } : row)));
                      }}
                      className="rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 font-mono text-sm tabular-nums"
                    />
                    <select
                      value={w.slot_duration_minutes}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setWindows((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, slot_duration_minutes: val } : row))
                        );
                      }}
                      className="rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm tabular-nums"
                    >
                      <option value={15}>15 min slots</option>
                      <option value={30}>30 min slots</option>
                      <option value={45}>45 min slots</option>
                      <option value={60}>60 min slots</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setWindows((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove window"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="submit"
              className="rounded-lg bg-[#1976D2] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1565C0]"
            >
              Save Schedule Availability
            </button>
          </form>
        )}
      </div>

      {/* Complete Consultation Modal */}
      {consultTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-lg rounded-2xl border border-[#DCE7F5] bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setConsultTarget(null)}
              aria-label="Close consultation form"
              className="absolute top-4 right-4 rounded-lg border border-[#DCE7F5] p-1.5 text-slate-500"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="font-display text-lg font-bold text-[#0F172A]">
              Complete Consultation · {consultTarget.appointment_code}
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Patient: {consultTarget.patient_name}. This updates the patient's permanent Medical History.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleStatusUpdate(consultTarget.id, "Completed", {
                  diagnosis,
                  prescription,
                  vitals,
                  consultationNotes,
                });
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700">Diagnosis / Assessment</label>
                <input
                  type="text"
                  required
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="Mild tension headache, BP normal"
                  className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Prescription / Plan</label>
                <input
                  type="text"
                  required
                  value={prescription}
                  onChange={(e) => setPrescription(e.target.value)}
                  placeholder="Hydration, ibuprofen 400mg PRN, follow-up in 4 weeks"
                  className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Vitals</label>
                <input
                  type="text"
                  value={vitals}
                  onChange={(e) => setVitals(e.target.value)}
                  placeholder="BP 118/76 mmHg, HR 72 bpm, Temp 98.4°F"
                  className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 font-mono text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Clinical Notes</label>
                <textarea
                  rows={3}
                  value={consultationNotes}
                  onChange={(e) => setConsultationNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConsultTarget(null)}
                  className="rounded-lg border border-[#DCE7F5] px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#1976D2] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1565C0]"
                >
                  Save & Complete Visit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patient History Modal */}
      {historyPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="relative max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#DCE7F5] bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setHistoryPatient(null)}
              aria-label="Close patient records"
              className="absolute top-4 right-4 rounded-lg border border-[#DCE7F5] p-1.5 text-slate-500"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="font-display text-lg font-bold text-[#0F172A]">
              Medical History · {historyPatient.name}
            </h3>
            {historyPatient.records.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">No prior clinical records found for this patient.</p>
            ) : (
              <div className="mt-4 divide-y divide-[#DCE7F5]">
                {historyPatient.records.map((rec) => (
                  <div key={rec.id} className="py-3">
                    <p className="font-mono text-xs text-slate-500 tabular-nums">
                      {rec.record_date} · {rec.doctor_name}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{rec.diagnosis}</p>
                    <p className="text-xs text-slate-700">Rx: {rec.prescription}</p>
                    {rec.vitals && <p className="mt-0.5 font-mono text-xs text-slate-500">{rec.vitals}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
