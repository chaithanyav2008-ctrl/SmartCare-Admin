import { useCallback, useEffect, useState } from "react";
import { Building2, Calendar, Edit3, LogOut, Plus, ShieldCheck, Stethoscope, Trash2, Users, X } from "lucide-react";
import { apiRequest } from "../lib/api.ts";
import type { Appointment, AuthUser, Department, Doctor } from "../types.ts";

interface AdminDashboardProps {
  user: AuthUser;
  onLogout: () => void;
  onDirectoryChanged: () => void;
}

interface AdminPatientRow {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  age: number;
  gender: string;
  blood_group: string;
  appointment_count: number;
  created_at: string;
}

interface ActivityLogRow {
  id: number;
  actor_name: string;
  actor_role: string;
  action: string;
  details: string;
  created_at: string;
}

export function AdminDashboard({ user, onLogout, onDirectoryChanged }: AdminDashboardProps) {
  const [tab, setTab] = useState<"doctors" | "departments" | "appointments" | "patients" | "activities">("doctors");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [stats, setStats] = useState({
    totalPatients: 0,
    totalDoctors: 0,
    totalAppointments: 0,
    pendingOrConfirmed: 0,
    completedAppointments: 0,
  });
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [patients, setPatients] = useState<AdminPatientRow[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRow[]>([]);

  // Doctor add/edit modal
  const [doctorModalOpen, setDoctorModalOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [dName, setDName] = useState("");
  const [dEmail, setDEmail] = useState("");
  const [dPhone, setDPhone] = useState("");
  const [dPassword, setDPassword] = useState("");
  const [dDeptId, setDDeptId] = useState<number>(0);
  const [dSpec, setDSpec] = useState("");
  const [dQual, setDQual] = useState("");
  const [dExp, setDExp] = useState("8");
  const [dLocation, setDLocation] = useState("Main Medical Campus · Downtown");
  const [dFee, setDFee] = useState("120");
  const [dBio, setDBio] = useState("");
  const [dFeatured, setDFeatured] = useState(false);

  // Add department form
  const [deptName, setDeptName] = useState("");
  const [deptWing, setDeptWing] = useState("");
  const [deptDesc, setDeptDesc] = useState("");

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest<{
        stats: typeof stats;
        doctors: Doctor[];
        patients: AdminPatientRow[];
        departments: Department[];
        appointments: Appointment[];
        activityLogs: ActivityLogRow[];
      }>("/api/admin/dashboard");
      setStats(res.stats);
      setDoctors(res.doctors);
      setPatients(res.patients);
      setDepartments(res.departments);
      setAppointments(res.appointments);
      setActivityLogs(res.activityLogs);
      if (res.departments.length > 0 && dDeptId === 0) {
        setDDeptId(res.departments[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load admin dashboard.");
    } finally {
      setLoading(false);
    }
  }, [dDeptId]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const openAddDoctor = () => {
    setEditingDoctor(null);
    setDName("");
    setDEmail("");
    setDPhone("+1 (555) 234-9000");
    setDPassword("");
    setDDeptId(departments[0]?.id ?? 0);
    setDSpec("");
    setDQual("MD");
    setDExp("8");
    setDLocation("Main Medical Campus · Downtown");
    setDFee("120");
    setDBio("");
    setDFeatured(false);
    setDoctorModalOpen(true);
  };

  const openEditDoctor = (doc: Doctor) => {
    setEditingDoctor(doc);
    setDName(doc.full_name);
    setDEmail(doc.email);
    setDPhone(doc.phone);
    setDPassword("");
    setDDeptId(doc.department_id);
    setDSpec(doc.specialization);
    setDQual(doc.qualification);
    setDExp(String(doc.experience_years));
    setDLocation(doc.location);
    setDFee(String(doc.consultation_fee));
    setDBio(doc.bio);
    setDFeatured(Boolean(doc.is_featured));
    setDoctorModalOpen(true);
  };

  const handleSaveDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      if (editingDoctor) {
        await apiRequest(`/api/admin/doctors/${editingDoctor.id}`, {
          method: "PUT",
          body: JSON.stringify({
            fullName: dName,
            phone: dPhone,
            departmentId: dDeptId,
            specialization: dSpec,
            qualification: dQual,
            experienceYears: Number(dExp),
            location: dLocation,
            consultationFee: Number(dFee),
            bio: dBio,
            isFeatured: dFeatured,
          }),
        });
        setNotice(`Updated profile for ${dName}.`);
      } else {
        await apiRequest("/api/admin/doctors", {
          method: "POST",
          body: JSON.stringify({
            fullName: dName,
            email: dEmail,
            phone: dPhone,
            password: dPassword,
            departmentId: dDeptId,
            specialization: dSpec,
            qualification: dQual,
            experienceYears: Number(dExp),
            location: dLocation,
            consultationFee: Number(dFee),
            bio: dBio,
          }),
        });
        setNotice(`Added ${dName} to SmartCare.`);
      }
      setDoctorModalOpen(false);
      loadAdminData();
      onDirectoryChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save doctor.");
    }
  };

  const handleDeleteDoctor = async (doc: Doctor) => {
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/admin/doctors/${doc.id}`, { method: "DELETE" });
      setNotice(`Removed ${doc.full_name}.`);
      loadAdminData();
      onDirectoryChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not delete doctor.");
    }
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      await apiRequest("/api/admin/departments", {
        method: "POST",
        body: JSON.stringify({ name: deptName, locationWing: deptWing, description: deptDesc }),
      });
      setDeptName("");
      setDeptWing("");
      setDeptDesc("");
      setNotice("Medical department added.");
      loadAdminData();
      onDirectoryChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add department.");
    }
  };

  const handleDeleteDepartment = async (deptId: number) => {
    setError("");
    try {
      await apiRequest(`/api/admin/departments/${deptId}`, { method: "DELETE" });
      setNotice("Department deleted.");
      loadAdminData();
      onDirectoryChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not delete department.");
    }
  };

  const handleDeletePatient = async (patientId: number) => {
    setError("");
    try {
      await apiRequest(`/api/admin/patients/${patientId}`, { method: "DELETE" });
      setNotice("Patient account removed.");
      loadAdminData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not remove patient.");
    }
  };

  const handleAdminApptStatus = async (apptId: number, status: string) => {
    setError("");
    try {
      await apiRequest(`/api/admin/appointments/${apptId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setNotice("Appointment status updated.");
      loadAdminData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update appointment.");
    }
  };

  return (
    <section className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 border-b border-[#DCE7F5] pb-6 sm:flex-row sm:items-center">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1976D2]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>Administrator Console</span>
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#0F172A] sm:text-3xl">
            SmartCare Operations & Directory
          </h1>
          <p className="mt-1 text-sm text-slate-600">Signed in as {user.email}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-[#DCE7F5] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:self-center"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* 4-column Admin KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[#DCE7F5] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Patients</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#0F172A] tabular-nums">
            {stats.totalPatients}
          </p>
        </div>
        <div className="rounded-xl border border-[#DCE7F5] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Doctors</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#0F172A] tabular-nums">
            {stats.totalDoctors}
          </p>
        </div>
        <div className="rounded-xl border border-[#DCE7F5] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Appointments</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#1976D2] tabular-nums">
            {stats.totalAppointments}
          </p>
        </div>
        <div className="rounded-xl border border-[#DCE7F5] bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Pending & Active / Completed</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#4CAF50] tabular-nums">
            {stats.pendingOrConfirmed} <span className="text-base font-normal text-slate-400">/</span>{" "}
            <span className="text-[#0F172A]">{stats.completedAppointments}</span>
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
      <div className="mt-6 flex flex-wrap gap-2 border-b border-[#DCE7F5]">
        {[
          { id: "doctors" as const, label: "Doctors", icon: Stethoscope },
          { id: "departments" as const, label: "Departments", icon: Building2 },
          { id: "appointments" as const, label: "Appointments", icon: Calendar },
          { id: "patients" as const, label: "Patients", icon: Users },
          { id: "activities" as const, label: "Website Activities", icon: ShieldCheck },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                tab === item.id
                  ? "border-[#1976D2] text-[#1976D2]"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-[#DCE7F5] bg-white p-6">
        {loading ? (
          <div className="space-y-3">
            <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ) : tab === "doctors" ? (
          <div>
            <div className="flex items-center justify-between border-b border-[#DCE7F5] pb-4">
              <h2 className="font-display text-lg font-bold text-[#0F172A]">Doctor Profiles</h2>
              <button
                type="button"
                onClick={openAddDoctor}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1976D2] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1565C0]"
              >
                <Plus className="h-4 w-4" />
                <span>Add Doctor</span>
              </button>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#DCE7F5] text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="py-3 pr-4">Doctor</th>
                    <th className="py-3 pr-4">Department</th>
                    <th className="py-3 pr-4">Location</th>
                    <th className="py-3 pr-4 text-right">Exp</th>
                    <th className="py-3 pr-4 text-right">Fee</th>
                    <th className="py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE7F5]">
                  {doctors.map((doc) => (
                    <tr key={doc.id} className="hover:bg-[#F4F9FF]/60">
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-slate-900">{doc.full_name}</p>
                        <p className="text-xs text-slate-500">{doc.email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-slate-800">{doc.department_name}</p>
                        <p className="text-xs text-slate-500">{doc.specialization}</p>
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-600">{doc.location}</td>
                      <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums">
                        {doc.experience_years}y
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums">
                        ${doc.consultation_fee}
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditDoctor(doc)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#DCE7F5] px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-[#1976D2] hover:text-[#1976D2]"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDoctor(doc)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : tab === "departments" ? (
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h2 className="border-b border-[#DCE7F5] pb-4 font-display text-lg font-bold text-[#0F172A]">
                Medical Departments
              </h2>
              <div className="divide-y divide-[#DCE7F5]">
                {departments.map((dept) => (
                  <div key={dept.id} className="flex items-start justify-between gap-4 py-3.5">
                    <div>
                      <p className="font-display text-base font-bold text-slate-900">
                        {dept.name} ·{" "}
                        <span className="font-mono text-xs font-medium text-[#1976D2] tabular-nums">
                          {dept.doctor_count} doctors
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">{dept.location_wing}</p>
                      <p className="mt-1 text-xs text-slate-600">{dept.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteDepartment(dept.id)}
                      className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddDepartment} className="space-y-3 rounded-xl border border-[#DCE7F5] bg-[#F4F9FF] p-5">
              <h3 className="font-display text-base font-bold text-[#0F172A]">Add New Department</h3>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Department Name</label>
                <input
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="Ophthalmology"
                  className="mt-1 w-full rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Location Wing</label>
                <input
                  type="text"
                  required
                  value={deptWing}
                  onChange={(e) => setDeptWing(e.target.value)}
                  placeholder="Building C · Floor 2"
                  className="mt-1 w-full rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Description</label>
                <textarea
                  rows={3}
                  required
                  value={deptDesc}
                  onChange={(e) => setDeptDesc(e.target.value)}
                  placeholder="Comprehensive eye exams, retinal care, and vision correction."
                  className="mt-1 w-full rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-[#1976D2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1565C0]"
              >
                Create Department
              </button>
            </form>
          </div>
        ) : tab === "appointments" ? (
          <div>
            <h2 className="border-b border-[#DCE7F5] pb-4 font-display text-lg font-bold text-[#0F172A]">
              All Appointments
            </h2>
            {appointments.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-600">No appointments booked yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#DCE7F5] text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="py-3 pr-4">ID</th>
                      <th className="py-3 pr-4">Patient</th>
                      <th className="py-3 pr-4">Doctor</th>
                      <th className="py-3 pr-4">Date & Slot</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 text-right">Update</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE7F5]">
                    {appointments.map((a) => (
                      <tr key={a.id}>
                        <td className="py-3 pr-4 font-mono text-xs font-semibold text-[#1976D2] tabular-nums">
                          {a.appointment_code}
                        </td>
                        <td className="py-3 pr-4 text-slate-900">{a.patient_name}</td>
                        <td className="py-3 pr-4 text-slate-700">
                          {a.doctor_name} <span className="text-xs text-slate-500">({a.department_name})</span>
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs tabular-nums">
                          {a.appointment_date} · {a.time_slot}
                        </td>
                        <td className="py-3 pr-4 text-xs font-semibold text-slate-800">{a.status}</td>
                        <td className="py-3 text-right">
                          <select
                            value={a.status}
                            onChange={(e) => handleAdminApptStatus(a.id, e.target.value)}
                            className="rounded-lg border border-[#DCE7F5] bg-white px-2 py-1 text-xs"
                          >
                            {["Pending", "Confirmed", "Completed", "Cancelled", "Rejected"].map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : tab === "patients" ? (
          <div>
            <h2 className="border-b border-[#DCE7F5] pb-4 font-display text-lg font-bold text-[#0F172A]">
              Registered Patients
            </h2>
            {patients.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-600">No patients have registered yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#DCE7F5] text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Contact</th>
                      <th className="py-3 pr-4">Demographics</th>
                      <th className="py-3 pr-4 text-right">Visits</th>
                      <th className="py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE7F5]">
                    {patients.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 pr-4 font-semibold text-slate-900">{p.full_name}</td>
                        <td className="py-3 pr-4 text-xs text-slate-600">
                          {p.email} · {p.phone}
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-600 tabular-nums">
                          {p.age} yrs · {p.gender} · {p.blood_group}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums">
                          {p.appointment_count}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeletePatient(p.id)}
                            className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div>
            <h2 className="border-b border-[#DCE7F5] pb-4 font-display text-lg font-bold text-[#0F172A]">
              Website Activity Log
            </h2>
            <div className="divide-y divide-[#DCE7F5]">
              {activityLogs.map((log) => (
                <div key={log.id} className="flex flex-col justify-between gap-1 py-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {log.actor_name}{" "}
                      <span className="font-normal text-slate-500">({log.actor_role})</span>
                    </p>
                    <p className="text-xs text-slate-600">{log.details}</p>
                  </div>
                  <span className="font-mono text-xs text-slate-400 tabular-nums">{log.created_at}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Doctor Modal */}
      {doctorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="relative my-8 w-full max-w-lg rounded-2xl border border-[#DCE7F5] bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setDoctorModalOpen(false)}
              aria-label="Close doctor modal"
              className="absolute top-4 right-4 rounded-lg border border-[#DCE7F5] p-1.5 text-slate-500"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="font-display text-lg font-bold text-[#0F172A]">
              {editingDoctor ? `Edit ${editingDoctor.full_name}` : "Add New Doctor Profile"}
            </h3>
            <form onSubmit={handleSaveDoctor} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Full Name</label>
                  <input
                    type="text"
                    required
                    value={dName}
                    onChange={(e) => setDName(e.target.value)}
                    placeholder="Dr. Jordan Patel"
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Phone</label>
                  <input
                    type="tel"
                    required
                    value={dPhone}
                    onChange={(e) => setDPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {!editingDoctor && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Doctor Email</label>
                    <input
                      type="email"
                      required
                      value={dEmail}
                      onChange={(e) => setDEmail(e.target.value)}
                      placeholder="doctor@smartcare.health"
                      className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Initial Password (Optional)</label>
                    <input
                      type="password"
                      value={dPassword}
                      onChange={(e) => setDPassword(e.target.value)}
                      placeholder="Leave blank to let doctor activate"
                      className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Department</label>
                  <select
                    value={dDeptId}
                    onChange={(e) => setDDeptId(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm"
                  >
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Specialization</label>
                  <input
                    type="text"
                    required
                    value={dSpec}
                    onChange={(e) => setDSpec(e.target.value)}
                    placeholder="Non-Invasive Cardiology"
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">Qualification</label>
                  <input
                    type="text"
                    required
                    value={dQual}
                    onChange={(e) => setDQual(e.target.value)}
                    placeholder="MD, FACC"
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Years Exp</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    required
                    value={dExp}
                    onChange={(e) => setDExp(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Clinic Location</label>
                  <input
                    type="text"
                    required
                    value={dLocation}
                    onChange={(e) => setDLocation(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Fee ($)</label>
                  <input
                    type="number"
                    min={10}
                    required
                    value={dFee}
                    onChange={(e) => setDFee(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Short Bio</label>
                <textarea
                  rows={2}
                  value={dBio}
                  onChange={(e) => setDBio(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm"
                />
              </div>

              {editingDoctor && (
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={dFeatured}
                    onChange={(e) => setDFeatured(e.target.checked)}
                  />
                  <span>Feature on SmartCare Home Page</span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDoctorModalOpen(false)}
                  className="rounded-lg border border-[#DCE7F5] px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#1976D2] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1565C0]"
                >
                  {editingDoctor ? "Update Doctor" : "Create Doctor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
