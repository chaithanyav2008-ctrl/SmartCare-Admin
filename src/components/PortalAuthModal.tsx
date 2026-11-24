import { useEffect, useState } from "react";
import { X, ShieldCheck, Stethoscope, UserRound } from "lucide-react";
import { apiRequest, setAuthToken } from "../lib/api.ts";
import type { AuthUser, Doctor, UserRole } from "../types.ts";

interface PortalAuthModalProps {
  isOpen: boolean;
  initialRole?: UserRole;
  initialMode?: "login" | "register" | "activate" | "forgot";
  doctors: Doctor[];
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}

export function PortalAuthModal({
  isOpen,
  initialRole = "patient",
  initialMode = "login",
  doctors,
  onClose,
  onSuccess,
}: PortalAuthModalProps) {
  const [role, setRole] = useState<UserRole>(initialRole);
  const [mode, setMode] = useState<"login" | "register" | "activate" | "forgot">(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Shared / Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Patient Registration state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("28");
  const [gender, setGender] = useState<"Male" | "Female" | "Other" | "Prefer not to say">("Female");

  // Doctor Activation state
  const [selectedDoctorEmail, setSelectedDoctorEmail] = useState("");

  // Admin status
  const [adminStatus, setAdminStatus] = useState<{
    envConfigured: boolean;
    claimedInDb: boolean;
    needsFirstRunSetup: boolean;
    adminEmail: string | null;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRole(initialRole);
    setMode(initialMode);
    setError("");
    setNotice("");
  }, [isOpen, initialRole, initialMode]);

  useEffect(() => {
    if (!isOpen || role !== "admin") return;
    apiRequest<{
      envConfigured: boolean;
      claimedInDb: boolean;
      needsFirstRunSetup: boolean;
      adminEmail: string | null;
    }>("/api/auth/admin/status")
      .then((status) => {
        setAdminStatus(status);
        if (status.adminEmail) {
          setEmail(status.adminEmail);
        } else {
          setEmail("admin@smartcare.health");
        }
      })
      .catch(() => {});
  }, [isOpen, role]);

  useEffect(() => {
    const unclaimed = doctors.filter((d) => !d.is_claimed);
    if (unclaimed.length > 0 && !selectedDoctorEmail) {
      setSelectedDoctorEmail(unclaimed[0].email);
    } else if (doctors.length > 0 && !selectedDoctorEmail) {
      setSelectedDoctorEmail(doctors[0].email);
    }
  }, [doctors, selectedDoctorEmail]);

  if (!isOpen) return null;

  const unclaimedDoctors = doctors.filter((d) => !d.is_claimed);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (role === "patient" && mode === "register") {
        const res = await apiRequest<{ token: string; user: AuthUser }>("/api/auth/patient/register", {
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
        setAuthToken(res.token);
        onSuccess(res.user);
        return;
      }

      if ((role === "patient" || role === "doctor") && mode === "forgot") {
        const res = await apiRequest<{ message: string }>("/api/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email, phone, newPassword: password }),
        });
        setNotice(res.message);
        setMode("login");
        setPassword("");
        return;
      }

      if (role === "doctor" && mode === "activate") {
        const res = await apiRequest<{ token: string; user: AuthUser }>("/api/auth/doctor/activate", {
          method: "POST",
          body: JSON.stringify({ email: selectedDoctorEmail || email, password }),
        });
        setAuthToken(res.token);
        onSuccess(res.user);
        return;
      }

      if (role === "admin") {
        if (adminStatus?.needsFirstRunSetup) {
          const res = await apiRequest<{ token: string; user: AuthUser }>("/api/auth/admin/setup", {
            method: "POST",
            body: JSON.stringify({
              fullName: fullName || "SmartCare Administrator",
              email: email || "admin@smartcare.health",
              password,
            }),
          });
          setAuthToken(res.token);
          onSuccess(res.user);
          return;
        }
        const res = await apiRequest<{ token: string; user: AuthUser }>("/api/auth/admin/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setAuthToken(res.token);
        onSuccess(res.user);
        return;
      }

      const res = await apiRequest<{ token: string; user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, role }),
      });
      setAuthToken(res.token);
      onSuccess(res.user);
    } catch (err: unknown) {
      const typedErr = err as Error & { needsActivation?: boolean };
      if (typedErr.needsActivation) {
        setMode("activate");
        setSelectedDoctorEmail(email);
      }
      setError(typedErr.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-auth-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-[#DCE7F5] bg-white p-6 shadow-xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close portal modal"
          className="absolute top-5 right-5 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#DCE7F5] text-slate-500 hover:bg-[#F4F9FF] hover:text-slate-900"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 id="portal-auth-title" className="font-display text-2xl font-bold text-[#0F172A]">
          SmartCare Access Portals
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Select your role to access appointments, schedules, or clinical administration.
        </p>

        {/* Role Selector Tabs */}
        <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-[#F4F9FF] p-1 border border-[#DCE7F5]">
          <button
            type="button"
            onClick={() => {
              setRole("patient");
              setMode("login");
              setError("");
              setNotice("");
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              role === "patient" ? "bg-white text-[#1976D2] shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Patient</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRole("doctor");
              setMode(unclaimedDoctors.length > 0 ? "activate" : "login");
              setError("");
              setNotice("");
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              role === "doctor" ? "bg-white text-[#1976D2] shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Doctor</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRole("admin");
              setMode("login");
              setError("");
              setNotice("");
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              role === "admin" ? "bg-white text-[#1976D2] shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Admin</span>
          </button>
        </div>

        {/* Sub-mode tabs for Patient & Doctor */}
        {role === "patient" && (
          <div className="mt-4 flex gap-4 border-b border-[#DCE7F5] text-sm">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`pb-2 font-semibold transition-colors ${
                mode === "login" ? "border-b-2 border-[#1976D2] text-[#1976D2]" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError("");
              }}
              className={`pb-2 font-semibold transition-colors ${
                mode === "register" ? "border-b-2 border-[#1976D2] text-[#1976D2]" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError("");
              }}
              className={`pb-2 font-semibold transition-colors ${
                mode === "forgot" ? "border-b-2 border-[#1976D2] text-[#1976D2]" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Forgot Password
            </button>
          </div>
        )}

        {role === "doctor" && (
          <div className="mt-4 flex gap-4 border-b border-[#DCE7F5] text-sm">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`pb-2 font-semibold transition-colors ${
                mode === "login" ? "border-b-2 border-[#1976D2] text-[#1976D2]" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Doctor Sign In
            </button>
            {unclaimedDoctors.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMode("activate");
                  setError("");
                }}
                className={`pb-2 font-semibold transition-colors ${
                  mode === "activate" ? "border-b-2 border-[#1976D2] text-[#1976D2]" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                First-Time Activation
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError("");
              }}
              className={`pb-2 font-semibold transition-colors ${
                mode === "forgot" ? "border-b-2 border-[#1976D2] text-[#1976D2]" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Reset Password
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {role === "patient" && mode === "register" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jordan Taylor"
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm focus:border-[#1976D2] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 290-1414"
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm focus:border-[#1976D2] focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Age</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    required
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm tabular-nums focus:border-[#1976D2] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as typeof gender)}
                    className="mt-1 w-full rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm focus:border-[#1976D2] focus:outline-none"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {role === "doctor" && mode === "activate" && (
            <div className="rounded-xl border border-[#DCE7F5] bg-[#F4F9FF] p-3.5 text-xs text-slate-700">
              Select your seeded specialist profile below to set your personal Doctor Portal password for the first time.
              <div className="mt-2.5">
                <label className="block text-xs font-semibold text-slate-700">Specialist Profile</label>
                <select
                  value={selectedDoctorEmail}
                  onChange={(e) => setSelectedDoctorEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm focus:border-[#1976D2] focus:outline-none"
                >
                  {unclaimedDoctors.map((doc) => (
                    <option key={doc.id} value={doc.email}>
                      {doc.full_name} — {doc.department_name} ({doc.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {role === "admin" && adminStatus?.needsFirstRunSetup && (
            <div className="rounded-xl border border-[#DCE7F5] bg-[#F4F9FF] p-3.5 text-xs text-slate-700">
              First-run setup: claim the Administrator Portal by choosing your admin email and password. This setup locks automatically once claimed.
              <div className="mt-3">
                <label className="block text-xs font-semibold text-slate-700">Administrator Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="SmartCare Administrator"
                  className="mt-1 w-full rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-sm focus:border-[#1976D2] focus:outline-none"
                />
              </div>
            </div>
          )}

          {!(role === "doctor" && mode === "activate") && !(role === "admin" && adminStatus?.envConfigured) && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={role === "admin" ? "admin@smartcare.health" : "name@example.com"}
                className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm focus:border-[#1976D2] focus:outline-none"
              />
            </div>
          )}

          {(role === "patient" || role === "doctor") && mode === "forgot" && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">Registered Phone Number</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 290-1414"
                className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm focus:border-[#1976D2] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              {mode === "forgot"
                ? "New Password (min 8 chars)"
                : role === "admin" && adminStatus?.envConfigured
                ? "Administrator Passcode"
                : mode === "register" || mode === "activate" || (role === "admin" && adminStatus?.needsFirstRunSetup)
                ? "Set Password (min 8 chars)"
                : "Password"}
            </label>
            <input
              type="password"
              required
              minLength={mode === "register" || mode === "activate" || mode === "forgot" || adminStatus?.needsFirstRunSetup ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm focus:border-[#1976D2] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#1976D2] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1565C0] disabled:opacity-60"
          >
            {loading
              ? "Please wait..."
              : role === "patient" && mode === "register"
              ? "Create Patient Account"
              : mode === "forgot"
              ? "Reset Password"
              : role === "doctor" && mode === "activate"
              ? "Activate & Open Doctor Portal"
              : role === "admin" && adminStatus?.needsFirstRunSetup
              ? "Claim Admin Portal"
              : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
