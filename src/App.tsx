import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Calendar,
  Clock,
  MapPin,
  MessageSquareHeart,
  PhoneCall,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { apiRequest, setAuthToken } from "./lib/api.ts";
import type { AuthUser, Department, Doctor, UserRole } from "./types.ts";
import { Navbar } from "./components/Navbar.tsx";
import { DoctorAvatar } from "./components/DoctorAvatar.tsx";
import { PortalAuthModal } from "./components/PortalAuthModal.tsx";
import { BookingModal } from "./components/BookingModal.tsx";
import { PatientDashboard } from "./components/PatientDashboard.tsx";
import { DoctorDashboard } from "./components/DoctorDashboard.tsx";
import { AdminDashboard } from "./components/AdminDashboard.tsx";
import { AiHealthChat } from "./components/AiHealthChat.tsx";

const HERO_IMAGE_URL = "/src/assets/images/hero_smartcare_clinic_1795498316833.jpg";
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeView, setActiveView] = useState<"home" | "dashboard">("home");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  // Directory filters
  const [searchQuery, setSearchQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState<number>(0);

  // Smart symptom recommender
  const [symptomInput, setSymptomInput] = useState("");
  const [recommendation, setRecommendation] = useState<{
    department: string;
    doctors: Doctor[];
  } | null>(null);
  const [recommending, setRecommending] = useState(false);
  const [recommendError, setRecommendError] = useState("");

  // Modals & Drawers
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialRole, setAuthInitialRole] = useState<UserRole>("patient");
  const [authInitialMode, setAuthInitialMode] = useState<"login" | "register" | "activate" | "forgot">("login");

  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [preselectedDoctorId, setPreselectedDoctorId] = useState<number | null>(null);
  const [preselectedDeptId, setPreselectedDeptId] = useState<number | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const [chatOpen, setChatOpen] = useState(false);

  const loadDirectory = useCallback(async () => {
    setLoadingDirectory(true);
    try {
      const [deptRes, docRes] = await Promise.all([
        apiRequest<{ departments: Department[] }>("/api/departments"),
        apiRequest<{ doctors: Doctor[] }>("/api/doctors"),
      ]);
      setDepartments(deptRes.departments);
      setDoctors(docRes.doctors);
    } catch {
      // ignore transient error
    } finally {
      setLoadingDirectory(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const filteredDoctors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const loc = locationQuery.trim().toLowerCase();
    return doctors.filter((doc) => {
      if (selectedDeptId !== 0 && doc.department_id !== selectedDeptId) {
        return false;
      }
      if (loc && !doc.location.toLowerCase().includes(loc)) {
        return false;
      }
      if (q) {
        const hay = `${doc.full_name} ${doc.specialization} ${doc.department_name} ${doc.location}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [doctors, selectedDeptId, searchQuery, locationQuery]);

  const handleNavigateHome = (sectionId?: string) => {
    setActiveView("home");
    if (sectionId) {
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const openPortal = (role: UserRole, mode: "login" | "register" | "activate" = "login") => {
    if (user && user.role === role) {
      setActiveView("dashboard");
      return;
    }
    setAuthInitialRole(role);
    setAuthInitialMode(mode);
    setAuthModalOpen(true);
  };

  const openBookingFor = (opts?: { doctorId?: number; departmentId?: number }) => {
    setPreselectedDoctorId(opts?.doctorId ?? null);
    setPreselectedDeptId(opts?.departmentId ?? null);
    setBookingModalOpen(true);
  };

  const handleRecommend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = symptomInput.trim();
    if (!trimmed) return;
    setRecommending(true);
    setRecommendError("");
    try {
      const res = await apiRequest<{ recommendedDepartment: string; doctors: Doctor[] }>(
        `/api/doctors/recommend?symptom=${encodeURIComponent(trimmed)}`
      );
      setRecommendation({ department: res.recommendedDepartment, doctors: res.doctors });
    } catch (err: unknown) {
      setRecommendError(err instanceof Error ? err.message : "Could not match recommendation.");
    } finally {
      setRecommending(false);
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setUser(null);
    setActiveView("home");
  };

  const formatAvailabilityDays = (doc: Doctor): string => {
    if (!doc.availability || doc.availability.length === 0) return "By appointment";
    const uniqueDays = Array.from(new Set(doc.availability.map((a) => a.day_of_week))).sort();
    return uniqueDays.map((d) => DAY_SHORT[d]).join(", ");
  };

  return (
    <div className="min-h-screen bg-[#F4F9FF] text-[#0F172A]">
      <Navbar
        user={user}
        activeView={activeView}
        onNavigateHome={handleNavigateHome}
        onOpenBooking={() => openBookingFor()}
        onOpenDashboard={() => setActiveView("dashboard")}
        onOpenPortalAuth={() => openPortal("patient", "login")}
        onOpenChat={() => setChatOpen(true)}
        onLogout={handleLogout}
      />

      {activeView === "dashboard" && user ? (
        <main className="pb-16">
          {user.role === "patient" && (
            <PatientDashboard
              user={user}
              refreshSignal={refreshSignal}
              onBookNew={() => openBookingFor()}
              onLogout={handleLogout}
              onUserUpdated={(updated) => setUser(updated)}
            />
          )}
          {user.role === "doctor" && <DoctorDashboard user={user} onLogout={handleLogout} />}
          {user.role === "admin" && (
            <AdminDashboard
              user={user}
              onLogout={handleLogout}
              onDirectoryChanged={() => {
                loadDirectory();
                setRefreshSignal((s) => s + 1);
              }}
            />
          )}
        </main>
      ) : (
        <main>
          {/* HERO SECTION */}
          <section className="border-b border-[#DCE7F5] bg-white">
            <div className="mx-auto grid max-w-[1200px] items-stretch gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
              <div className="flex flex-col justify-between gap-8">
                <div>
                  <p className="text-sm font-semibold text-[#1976D2]">
                    SmartCare Medical Network · Multi-Specialty Care
                  </p>
                  <h1 className="mt-3 max-w-2xl font-display text-[clamp(2.25rem,4vw,3.35rem)] leading-[1.12] font-extrabold tracking-tight text-[#0F172A] text-balance">
                    Book verified specialists with real-time slot availability.
                  </h1>
                  <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                    Find board-certified doctors by name, specialization, or clinic location. Schedule confirmed visits without double-booking, access medical records, and receive automated reminders.
                  </p>

                  {/* Search Bar */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      document.getElementById("doctors-section")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="mt-7 grid gap-2.5 rounded-xl border border-[#DCE7F5] bg-[#F4F9FF] p-2.5 sm:grid-cols-[1fr_0.85fr_auto]"
                  >
                    <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 border border-[#DCE7F5]">
                      <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Doctor name or specialty"
                        className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 border border-[#DCE7F5]">
                      <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <input
                        type="text"
                        value={locationQuery}
                        onChange={(e) => setLocationQuery(e.target.value)}
                        placeholder="Campus or location"
                        className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#1976D2] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1565C0] whitespace-nowrap"
                    >
                      Search Doctors
                    </button>
                  </form>

                  <div className="mt-5 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => openBookingFor()}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#1976D2] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1565C0] whitespace-nowrap"
                    >
                      <Calendar className="h-4 w-4" aria-hidden="true" />
                      <span>Book Appointment</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChatOpen(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-[#DCE7F5] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-[#1976D2] hover:text-[#1976D2] whitespace-nowrap"
                    >
                      <MessageSquareHeart className="h-4 w-4 text-[#1976D2]" aria-hidden="true" />
                      <span>Ask AI Health Guide</span>
                    </button>
                  </div>
                </div>

                {/* Emergency Contact Strip */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#DCE7F5] pt-5 text-sm">
                  <div className="flex items-center gap-2.5 text-slate-800">
                    <PhoneCall className="h-4 w-4 shrink-0 text-[#1976D2]" aria-hidden="true" />
                    <span className="font-semibold">24/7 Emergency Contact:</span>
                    <span className="font-mono font-semibold text-[#1976D2] tabular-nums">
                      +1 (800) 555-0199
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    Urgent Ambulance Dispatch: 911 · Walk-in Trauma Wing A
                  </span>
                </div>
              </div>

              <div className="min-h-[300px] overflow-hidden rounded-2xl border border-[#DCE7F5] bg-[#E8F2FD]">
                {heroImgFailed ? (
                  <div className="flex h-full min-h-[300px] flex-col items-center justify-center p-8 text-center">
                    <Stethoscope className="h-12 w-12 text-[#1976D2]" />
                    <p className="mt-3 font-display text-lg font-bold text-slate-900">
                      SmartCare Clinical Pavilion
                    </p>
                  </div>
                ) : (
                  <img
                    src={HERO_IMAGE_URL}
                    alt="Sunlit SmartCare medical pavilion reception and consultation suite"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            </div>
          </section>

          {/* SMART SYMPTOM-TO-SPECIALIST RECOMMENDER */}
          <section className="mx-auto max-w-[1200px] px-4 pt-10 sm:px-6">
            <div className="rounded-2xl border border-[#DCE7F5] bg-white p-6 sm:p-8">
              <div className="grid items-center gap-6 lg:grid-cols-[1fr_1.1fr]">
                <div>
                  <h2 className="font-display text-xl font-bold text-[#0F172A]">
                    Smart Specialist Recommendation
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Enter your primary symptom or health concern to match with the right department and available doctors.
                  </p>
                </div>

                <form onSubmit={handleRecommend} className="flex flex-col gap-2.5 sm:flex-row">
                  <input
                    type="text"
                    value={symptomInput}
                    onChange={(e) => setSymptomInput(e.target.value)}
                    placeholder="e.g., recurring migraine, chest palpitations, knee pain..."
                    className="flex-1 rounded-lg border border-[#DCE7F5] px-3.5 py-2.5 text-sm focus:border-[#1976D2] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={recommending || !symptomInput.trim()}
                    className="rounded-lg bg-[#4CAF50] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                  >
                    {recommending ? "Matching..." : "Find Match"}
                  </button>
                </form>
              </div>

              {recommendError && (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {recommendError}
                </p>
              )}

              {recommendation && (
                <div className="mt-6 border-t border-[#DCE7F5] pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      Recommended Department:{" "}
                      <span className="text-[#1976D2]">{recommendation.department}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setRecommendation(null)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-900"
                    >
                      Clear match
                    </button>
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {recommendation.doctors.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[#DCE7F5] bg-[#F4F9FF] p-3.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-display text-sm font-bold text-slate-900">
                            {doc.full_name}
                          </p>
                          <p className="truncate text-xs text-slate-600">
                            {doc.specialization} · {doc.experience_years} yrs exp
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openBookingFor({ doctorId: doc.id })}
                          className="shrink-0 rounded-lg bg-[#1976D2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1565C0]"
                        >
                          Book
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* DOCTORS DIRECTORY */}
          <section id="doctors-section" className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="font-display text-2xl font-bold text-[#0F172A] sm:text-3xl">
                  Featured Specialists
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Filter by medical department, doctor name, or clinic campus to inspect live slots.
                </p>
              </div>
              {(selectedDeptId !== 0 || searchQuery || locationQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDeptId(0);
                    setSearchQuery("");
                    setLocationQuery("");
                  }}
                  className="self-start text-xs font-semibold text-[#1976D2] hover:underline"
                >
                  Reset filters
                </button>
              )}
            </div>

            {/* Department Filter Segmented Bar */}
            <div className="mt-6 flex flex-wrap gap-1.5 rounded-xl border border-[#DCE7F5] bg-white p-1.5">
              <button
                type="button"
                onClick={() => setSelectedDeptId(0)}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  selectedDeptId === 0
                    ? "bg-[#1976D2] text-white"
                    : "text-slate-600 hover:bg-[#F4F9FF] hover:text-slate-900"
                }`}
              >
                All Departments
              </button>
              {departments.map((dept) => (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => setSelectedDeptId(dept.id)}
                  className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    selectedDeptId === dept.id
                      ? "bg-[#1976D2] text-white"
                      : "text-slate-600 hover:bg-[#F4F9FF] hover:text-slate-900"
                  }`}
                >
                  {dept.name}
                </button>
              ))}
            </div>

            {loadingDirectory ? (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-64 animate-pulse rounded-2xl border border-[#DCE7F5] bg-white" />
                ))}
              </div>
            ) : filteredDoctors.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-[#DCE7F5] bg-white p-10 text-center">
                <p className="text-sm text-slate-600">
                  No doctors match your current search criteria.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDeptId(0);
                    setSearchQuery("");
                    setLocationQuery("");
                  }}
                  className="mt-3 rounded-lg bg-[#1976D2] px-4 py-2 text-xs font-semibold text-white"
                >
                  Show All Doctors
                </button>
              </div>
            ) : (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredDoctors.map((doc) => (
                  <article
                    key={doc.id}
                    className="flex flex-col justify-between rounded-2xl border border-[#DCE7F5] bg-white p-6 transition-transform duration-150 hover:-translate-y-0.5"
                  >
                    <div>
                      <div className="flex items-start gap-4">
                        <DoctorAvatar name={doc.full_name} src={doc.avatar_url} className="h-20 w-20" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[#1976D2]">
                            {doc.department_name}
                          </p>
                          <h3 className="mt-0.5 truncate font-display text-lg font-bold text-[#0F172A]">
                            {doc.full_name}
                          </h3>
                          <p className="mt-0.5 text-xs text-slate-600">{doc.specialization}</p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-1.5 border-t border-[#DCE7F5] pt-4 text-xs text-slate-600">
                        <p>{doc.qualification}</p>
                        <p className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          <span>{doc.location}</span>
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          <span>{formatAvailabilityDays(doc)}</span>
                        </p>
                      </div>

                      {doc.bio && (
                        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-500">
                          {doc.bio}
                        </p>
                      )}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-[#DCE7F5] pt-4">
                      <div className="text-xs text-slate-600 tabular-nums">
                        <span className="font-mono text-sm font-bold text-[#0F172A]">
                          ${doc.consultation_fee}
                        </span>{" "}
                        / visit · {doc.experience_years} yrs exp
                      </div>
                      <button
                        type="button"
                        onClick={() => openBookingFor({ doctorId: doc.id })}
                        className="rounded-lg bg-[#1976D2] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1565C0] whitespace-nowrap"
                      >
                        Book Slot
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* MEDICAL DEPARTMENTS */}
          <section id="departments-section" className="border-y border-[#DCE7F5] bg-white py-14">
            <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
              <div className="max-w-2xl">
                <h2 className="font-display text-2xl font-bold text-[#0F172A] sm:text-3xl">
                  Medical Departments
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Coordinated specialty care across six clinical wings with unified patient records.
                </p>
              </div>

              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {departments.map((dept, idx) => (
                  <div
                    key={dept.id}
                    className="flex flex-col justify-between rounded-2xl border border-[#DCE7F5] bg-[#F4F9FF]/60 p-6"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-mono tabular-nums">
                          {String(idx + 1).padStart(2, "0")}. Department
                        </span>
                        <span className="font-mono tabular-nums">
                          {dept.doctor_count} specialists
                        </span>
                      </div>
                      <h3 className="mt-2 font-display text-lg font-bold text-[#0F172A]">
                        {dept.name}
                      </h3>
                      <p className="mt-1 text-xs font-medium text-[#1976D2]">
                        {dept.location_wing}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        {dept.description}
                      </p>
                    </div>

                    <div className="mt-5 flex items-center gap-4 border-t border-[#DCE7F5] pt-4 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDeptId(dept.id);
                          document.getElementById("doctors-section")?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="text-slate-700 hover:text-[#1976D2]"
                      >
                        View Doctors
                      </button>
                      <button
                        type="button"
                        onClick={() => openBookingFor({ departmentId: dept.id })}
                        className="inline-flex items-center gap-1 text-[#1976D2] hover:underline"
                      >
                        <span>Book Department</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* THREE DEDICATED LOGIN PORTALS */}
          <section id="portals-section" className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-bold text-[#0F172A] sm:text-3xl">
                Dedicated Role Portals
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Separate secure workspaces for patients, attending physicians, and hospital administrators.
              </p>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              {/* Patient Portal */}
              <div className="flex flex-col justify-between rounded-2xl border border-[#DCE7F5] bg-white p-6">
                <div>
                  <UserRound className="h-6 w-6 text-[#1976D2]" aria-hidden="true" />
                  <h3 className="mt-4 font-display text-xl font-bold text-[#0F172A]">
                    Patient Portal
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Register an account, search specialists, book appointments, reschedule or cancel visits, and review your medical history and reminders.
                  </p>
                </div>
                <div className="mt-6 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => openPortal("patient", "login")}
                    className="rounded-lg bg-[#1976D2] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1565C0]"
                  >
                    Patient Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => openPortal("patient", "register")}
                    className="rounded-lg border border-[#DCE7F5] px-4 py-2 text-xs font-semibold text-slate-700 hover:border-[#1976D2] hover:text-[#1976D2]"
                  >
                    Register
                  </button>
                </div>
              </div>

              {/* Doctor Portal */}
              <div className="flex flex-col justify-between rounded-2xl border border-[#DCE7F5] bg-white p-6">
                <div>
                  <Stethoscope className="h-6 w-6 text-[#4CAF50]" aria-hidden="true" />
                  <h3 className="mt-4 font-display text-xl font-bold text-[#0F172A]">
                    Doctor Portal
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Manage weekly consultation hours, review incoming patient bookings, inspect patient histories, and record diagnoses and prescriptions.
                  </p>
                </div>
                <div className="mt-6 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => openPortal("doctor", "login")}
                    className="rounded-lg bg-[#1976D2] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1565C0]"
                  >
                    Doctor Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => openPortal("doctor", "activate")}
                    className="rounded-lg border border-[#DCE7F5] px-4 py-2 text-xs font-semibold text-slate-700 hover:border-[#1976D2] hover:text-[#1976D2]"
                  >
                    Activate Profile
                  </button>
                </div>
              </div>

              {/* Admin Portal */}
              <div className="flex flex-col justify-between rounded-2xl border border-[#DCE7F5] bg-white p-6">
                <div>
                  <ShieldCheck className="h-6 w-6 text-[#0F172A]" aria-hidden="true" />
                  <h3 className="mt-4 font-display text-xl font-bold text-[#0F172A]">
                    Admin Portal
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Monitor clinic totals, manage doctor profiles and medical departments, oversee patient accounts, and audit website activity logs.
                  </p>
                </div>
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => openPortal("admin", "login")}
                    className="rounded-lg bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Open Admin Console
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* QUIET FOOTER */}
      <footer className="border-t border-[#DCE7F5] bg-white py-10">
        <div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-6 px-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:px-6">
          <div>
            <p className="font-display text-base font-bold text-[#0F172A]">SmartCare</p>
            <p className="mt-1 text-xs text-slate-500">
              Main Campus: 450 Medical Plaza, Downtown · Emergency Triage: +1 (800) 555-0199
            </p>
          </div>
          <div className="flex flex-wrap gap-6 text-xs font-medium">
            <button type="button" onClick={() => openPortal("patient", "login")} className="hover:text-[#1976D2]">
              Patient Portal
            </button>
            <button type="button" onClick={() => openPortal("doctor", "login")} className="hover:text-[#1976D2]">
              Doctor Portal
            </button>
            <button type="button" onClick={() => openPortal("admin", "login")} className="hover:text-[#1976D2]">
              Admin Portal
            </button>
            <button type="button" onClick={() => setChatOpen(true)} className="hover:text-[#1976D2]">
              Health Guide
            </button>
          </div>
        </div>
      </footer>

      {/* Floating Health Guide Button */}
      {!chatOpen && (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          aria-label="Open SmartCare Health Guide"
          className="fixed right-5 bottom-5 z-40 inline-flex items-center gap-2 rounded-full bg-[#1976D2] px-4 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] hover:bg-[#1565C0]"
        >
          <MessageSquareHeart className="h-4 w-4" aria-hidden="true" />
          <span>Health Guide</span>
        </button>
      )}

      <PortalAuthModal
        isOpen={authModalOpen}
        initialRole={authInitialRole}
        initialMode={authInitialMode}
        doctors={doctors}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(authedUser) => {
          setUser(authedUser);
          setAuthModalOpen(false);
          setActiveView("dashboard");
        }}
      />

      <BookingModal
        isOpen={bookingModalOpen}
        user={user}
        departments={departments}
        doctors={doctors}
        preselectedDoctorId={preselectedDoctorId}
        preselectedDepartmentId={preselectedDeptId}
        onClose={() => setBookingModalOpen(false)}
        onAuthSuccess={(authedUser) => setUser(authedUser)}
        onBookingComplete={() => setRefreshSignal((s) => s + 1)}
      />

      <AiHealthChat
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        onBookFromChat={() => openBookingFor()}
      />
    </div>
  );
}
