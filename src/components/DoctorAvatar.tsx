import { useState } from "react";
import { Stethoscope } from "lucide-react";

interface DoctorAvatarProps {
  name: string;
  src?: string;
  className?: string;
}

export function DoctorAvatar({ name, src, className = "h-20 w-20" }: DoctorAvatarProps) {
  const [failed, setFailed] = useState(false);

  const initials = name
    .replace(/^Dr\.\s*/i, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (!src || failed) {
    return (
      <div
        className={`${className} flex shrink-0 flex-col items-center justify-center rounded-xl border border-[#DCE7F5] bg-gradient-to-br from-[#E8F2FD] to-[#F4F9FF] text-[#1976D2]`}
        aria-label={name}
      >
        <Stethoscope className="mb-1 h-4 w-4 opacity-70" aria-hidden="true" />
        <span className="font-display text-sm font-bold tracking-tight">{initials || "MD"}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} shrink-0 rounded-xl border border-[#DCE7F5] bg-[#E8F2FD] object-cover`}
    />
  );
}
