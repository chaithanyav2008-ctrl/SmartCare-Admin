import { useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle2, Clock, X } from "lucide-react";
import { apiRequest, setAuthToken } from "../lib/api.ts";
import type { AuthUser, Department, Doctor, TimeSlot } from "../types.ts";
import { DoctorAvatar } from "./DoctorAvatar.tsx";

interface BookingModalProps {
  isOpen: boolean;
  user: AuthUser | null;
  departments: Department[];
  doctors: Doctor[];
  preselectedDoctorId?: number | null;
  preselectedDepartmentId?: number | null;
  onClose: () => void;
  onAuthSuccess: (user: AuthUser) => void;
  onBookingComplete: () => void;
}

function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function BookingModal({
  isOpen,
  user,
  departments,
  doctors,
  preselectedDoctorId,
  preselectedDepartmentId,
  onClose,
  onAuthSuccess,
  onBookingComplete,
}: BookingModalProps) {
  const [departmentId, setDepartmentId] = useState<number>(0);
  const [doctorId, setDoctorId] = useState<number>(0);
  const [appointmentDate, setAppointmentDate] = useState<string>(getTomorrowDate);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmedBooking, setConfirmedBooking] = useState<{
    appointment_code: string;
    doctor_name: string;
    appointment_date: string;
    time_slot: string;
    status: string;
  } | null>(null);

  // Inline patient auth if not signed in as patient
  const [inlineAuthTab, setInlineAuthTab] = useState<"register" | "login">("register");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("30");
  const [gender, setGender] = useState<"Male" | "Female" | "Other" | "Prefer not to say">("Female");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setConfirmedBooking(null);
    setSelectedSlot("");

    if (preselectedDoctorId) {
      const doc = doctors.find((d) => d.id === preselectedDoctorId);
      if (doc) {
        setDepartmentId(doc.department_id);
        setDoctorId(doc.id);
        return;
      }
    }
    if (preselectedDepartmentId) {
      setDepartmentId(preselectedDepartmentId);
      const doc = doctors.find((d) => d.department_id === preselectedDepartmentId);
      setDoctorId(doc?.id ?? 0);
      return;
    }
    if (departments.length > 0 && departmentId === 0) {
      setDepartmentId(departments[0].id);
    }
  }, [isOpen, preselectedDoctorId, preselectedDepartmentId, doctors, departments, departmentId]);

  const filteredDoctors = useMemo(() => {
    if (!departmentId) return doctors;
    return doctors.filter((d) => d.department_id === departmentId);
  }, [doctors, departmentId]);

  useEffect(() => {
    if (filteredDoctors.length > 0 && !filteredDoctors.some((d) => d.id === doctorId)) {
      setDoctorId(filteredDoctors[0].id);
    }
  }, [filteredDoctors, doctorId]);

  useEffect(() => {
    if (!isOpen || !doctorId || !appointmentDate) return;
    setSlotsLoading(true);
    setSelectedSlot("");
    apiRequest<{ slots: TimeSlot[] }>(`/api/doctors/${doctorId}/slots?date=${encodeURIComponent(appointmentDate)}`)
      .then((res) => setSlots(res.slots))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [isOpen, doctorId, appointmentDate]);

  if (!isOpen) return null;

  const activeDoctor = doctors.find((d) => d.id === doctorId);
  const todayStr = new Date().toISOString().slice(0, 10);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!doctorId || !appointmentDate || !selectedSlot) {
      setError("Please select a doctor, date, and available time slot.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Please describe the reason for your appointment.");
      return;
    }

    setSubmitting(true);
    try {
      let currentUser = user;
      if (!currentUser || currentUser.role !== "patient") {
        if (currentUser && currentUser.role !== "patient") {
          setError("Please sign in with a Patient account to book an appointment.");
          setSubmitting(false);
          return;
        }
        if (inlineAuthTab === "register") {
          const authRes = await apiRequest<{ token: string; user: AuthUser }>("/api/auth/patient/register", {
            method: "POST",
            body: JSON.stringify({
              fullName,
              email,
              phone,
              age: Number(age),
              gender,
              password,
            }),
          });
          setAuthToken(authRes.token);
          onAuthSuccess(authRes.user);
          currentUser = authRes.user;
        } else {
          const authRes = await apiRequest<{ token: string; user: AuthUser }>("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password, role: "patient" }),
          });
          setAuthToken(authRes.token);
          onAuthSuccess(authRes.user);
          currentUser = authRes.user;
        }
      }

      const bookingRes = await apiRequest<{
        appointment: {
          appointment_code: string;
          doctor_name: string;
          appointment_date: string;
          time_slot: string;
          status: string;
        };
      }>("/api/appointments", {
        method: "POST",
        body: JSON.stringify({
          doctorId,
          appointmentDate,
          timeSlot: selectedSlot,
          reason: reason.trim(),
        }),
      });

      setConfirmedBooking(bookingRes.appointment);
      onBookingComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not confirm appointment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="relative my-8 w-full max-w-2xl rounded-2xl border border-[#DCE7F5] bg-white p-6 shadow-xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close appointment booking"
          className="absolute top-5 right-5 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#DCE7F5] text-slate-500 hover:bg-[#F4F9FF] hover:text-slate-900"
        >
          <X className="h-4 w-4" />
        </button>

        {confirmedBooking ? (
          <div className="py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-[#4CAF50]">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold text-[#0F172A]">Appointment Confirmed</h2>
            <p className="mt-1 text-sm text-slate-600">
              An email and in-app reminder has been queued for your visit.
            </p>
            <div className="mx-auto mt-6 max-w-md rounded-xl border border-[#DCE7F5] bg-[#F4F9FF] p-5 text-left text-sm">
              <div className="flex items-center justify-between border-b border-[#DCE7F5] pb-3">
                <span className="text-slate-500">Appointment ID</span>
                <span className="font-mono font-semibold text-[#1976D2] tabular-nums">
                  {confirmedBooking.appointment_code}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Specialist</span>
                  <span className="font-semibold text-slate-900">{confirmedBooking.doctor_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date & Time</span>
                  <span className="font-mono font-medium text-slate-900 tabular-nums">
                    {confirmedBooking.appointment_date} · {confirmedBooking.time_slot}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className="font-semibold text-[#4CAF50]">{confirmedBooking.status}</span>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-[#1976D2] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1565C0]"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 id="booking-modal-title" className="font-display text-2xl font-bold text-[#0F172A]">
              Book an Appointment
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Real-time slot verification prevents double booking. Confirm in seconds.
            </p>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleConfirm} className="mt-5 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">1. Medical Department</label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm focus:border-[#1976D2] focus:outline-none"
                  >
                    <option value={0}>All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">2. Select Specialist</label>
                  <select
                    value={doctorId}
                    onChange={(e) => setDoctorId(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm focus:border-[#1976D2] focus:outline-none"
                  >
                    {filteredDoctors.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.full_name} ({doc.department_name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {activeDoctor && (
                <div className="flex items-center gap-4 rounded-xl border border-[#DCE7F5] bg-[#F4F9FF] p-3.5">
                  <DoctorAvatar name={activeDoctor.full_name} src={activeDoctor.avatar_url} className="h-14 w-14" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold text-slate-900">{activeDoctor.full_name}</p>
                    <p className="truncate text-xs text-slate-600">
                      {activeDoctor.specialization} · {activeDoctor.experience_years} yrs exp
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {activeDoctor.location} · Consultation ${activeDoctor.consultation_fee}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Calendar className="h-3.5 w-3.5 text-[#1976D2]" aria-hidden="true" />
                    <span>3. Appointment Date</span>
                  </label>
                  <input
                    type="date"
                    min={todayStr}
                    required
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm tabular-nums focus:border-[#1976D2] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Reason for Visit</label>
                  <input
                    type="text"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Annual heart checkup, recurring migraine..."
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm focus:border-[#1976D2] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Clock className="h-3.5 w-3.5 text-[#1976D2]" aria-hidden="true" />
                    <span>4. Available Time Slots</span>
                  </label>
                  <span className="text-xs text-slate-500">Booked slots are disabled automatically</span>
                </div>

                {slotsLoading ? (
                  <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div key={idx} className="h-9 animate-pulse rounded-lg bg-slate-100" />
                    ))}
                  </div>
                ) : slots.length === 0 ? (
                  <div className="mt-2 rounded-lg border border-[#DCE7F5] bg-[#F4F9FF] p-3 text-xs text-slate-600">
                    No consultation hours scheduled on this weekday. Please try Monday–Friday or another date.
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {slots.map((slot) => {
                      const active = selectedSlot === slot.time;
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => setSelectedSlot(slot.time)}
                          className={`rounded-lg border px-2 py-2 font-mono text-xs font-medium tabular-nums transition-colors ${
                            !slot.available
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through"
                              : active
                              ? "border-[#1976D2] bg-[#1976D2] text-white"
                              : "border-[#DCE7F5] bg-white text-slate-700 hover:border-[#1976D2] hover:text-[#1976D2]"
                          }`}
                        >
                          {slot.time}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {!user && (
                <div className="rounded-xl border border-[#DCE7F5] bg-[#F4F9FF] p-4">
                  <div className="flex items-center justify-between border-b border-[#DCE7F5] pb-2.5">
                    <span className="text-xs font-semibold text-slate-800">5. Patient Account Details</span>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setInlineAuthTab("register")}
                        className={`font-semibold ${inlineAuthTab === "register" ? "text-[#1976D2] underline" : "text-slate-500"}`}
                      >
                        New Patient
                      </button>
                      <span className="text-slate-300">/</span>
                      <button
                        type="button"
                        onClick={() => setInlineAuthTab("login")}
                        className={`font-semibold ${inlineAuthTab === "login" ? "text-[#1976D2] underline" : "text-slate-500"}`}
                      >
                        Existing Patient Sign In
                      </button>
                    </div>
                  </div>

                  {inlineAuthTab === "register" ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        required
                        placeholder="Full Name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="email"
                        required
                        placeholder="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="tel"
                        required
                        placeholder="Phone Number"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min={1}
                          max={120}
                          required
                          placeholder="Age"
                          value={age}
                          onChange={(e) => setAge(e.target.value)}
                          className="rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm tabular-nums"
                        />
                        <select
                          value={gender}
                          onChange={(e) => setGender(e.target.value as typeof gender)}
                          className="rounded-lg border border-[#DCE7F5] bg-white px-2 py-2 text-sm"
                        >
                          <option value="Female">Female</option>
                          <option value="Male">Male</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="Password (min 8 chars)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="sm:col-span-2 rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input
                        type="email"
                        required
                        placeholder="Patient Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="password"
                        required
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-[#DCE7F5] pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-[#DCE7F5] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedSlot}
                  className="rounded-lg bg-[#1976D2] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1565C0] disabled:opacity-50"
                >
                  {submitting ? "Confirming..." : "Confirm Appointment"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
