import { useState } from "react";
import { Menu, X } from "lucide-react";
import type { AuthUser } from "../types.ts";

interface NavbarProps {
  user: AuthUser | null;
  activeView: "home" | "dashboard";
  onNavigateHome: (sectionId?: string) => void;
  onOpenBooking: () => void;
  onOpenDashboard: () => void;
  onOpenPortalAuth: () => void;
  onOpenChat: () => void;
  onLogout: () => void;
}

export function Navbar({
  user,
  activeView,
  onNavigateHome,
  onOpenBooking,
  onOpenDashboard,
  onOpenPortalAuth,
  onOpenChat,
}: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLink = (sectionId?: string) => {
    setMobileOpen(false);
    onNavigateHome(sectionId);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#DCE7F5] bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleLink()}
          className="flex shrink-0 items-center gap-2 whitespace-nowrap font-display text-xl font-bold tracking-tight text-[#0F172A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1976D2]"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="shrink-0 text-[#1976D2]"
          >
            <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
            <path
              d="M12 7V17M7 12H17"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
          <span>SmartCare</span>
        </button>

        {/* Zone 2: 5 concise single-line text links */}
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <button
            type="button"
            onClick={() => handleLink("doctors-section")}
            className="shrink-0 whitespace-nowrap transition-colors hover:text-[#1976D2] hover:underline hover:underline-offset-4"
          >
            Find Doctors
          </button>
          <button
            type="button"
            onClick={() => handleLink("departments-section")}
            className="shrink-0 whitespace-nowrap transition-colors hover:text-[#1976D2] hover:underline hover:underline-offset-4"
          >
            Departments
          </button>
          <button
            type="button"
            onClick={() => handleLink("portals-section")}
            className="shrink-0 whitespace-nowrap transition-colors hover:text-[#1976D2] hover:underline hover:underline-offset-4"
          >
            Portals
          </button>
          <button
            type="button"
            onClick={onOpenChat}
            className="shrink-0 whitespace-nowrap transition-colors hover:text-[#1976D2] hover:underline hover:underline-offset-4"
          >
            Health Guide
          </button>
          <button
            type="button"
            onClick={user ? onOpenDashboard : onOpenPortalAuth}
            className="shrink-0 whitespace-nowrap transition-colors hover:text-[#1976D2] hover:underline hover:underline-offset-4"
          >
            {user ? (activeView === "dashboard" ? "Home" : "My Portal") : "Sign In"}
          </button>
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex shrink-0 items-center gap-3">
          {user && activeView !== "dashboard" ? (
            <button
              type="button"
              onClick={onOpenDashboard}
              className="hidden shrink-0 whitespace-nowrap rounded-lg bg-[#1976D2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1565C0] md:inline-flex"
            >
              Open Dashboard
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenBooking}
              className="hidden shrink-0 whitespace-nowrap rounded-lg bg-[#1976D2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1565C0] md:inline-flex"
            >
              Book Appointment
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#DCE7F5] text-slate-700 md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-[#DCE7F5] bg-white px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3 text-sm font-medium text-slate-700">
            <button type="button" onClick={() => handleLink("doctors-section")} className="py-2 text-left">
              Find Doctors
            </button>
            <button type="button" onClick={() => handleLink("departments-section")} className="py-2 text-left">
              Departments
            </button>
            <button type="button" onClick={() => handleLink("portals-section")} className="py-2 text-left">
              Portals
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenChat();
              }}
              className="py-2 text-left"
            >
              Health Guide
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                if (user) {
                  onOpenDashboard();
                } else {
                  onOpenPortalAuth();
                }
              }}
              className="py-2 text-left text-[#1976D2]"
            >
              {user ? "Open Dashboard" : "Sign In / Register"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenBooking();
              }}
              className="mt-1 rounded-lg bg-[#1976D2] px-4 py-2.5 text-center font-semibold text-white"
            >
              Book Appointment
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
