/** Shared profile shapes for the /console picker + AppShell chip. */
import { ROLE_ACCESS } from "./access";

export interface Profile {
  role: string;
  title: string;
  subtitle: string;
  accent: string;
  can: string[];
}

export const FALLBACK_PROFILES: Profile[] = [
  {
    role: "mission_director",
    title: "Mission Director",
    subtitle: "Full access",
    accent: "somaiya",
    can: [...ROLE_ACCESS.mission_director.can],
  },
  {
    role: "station_operator_bom",
    title: "Mumbai Station",
    subtitle: "GS-BOM, VU2KJS",
    accent: "blue",
    can: [...ROLE_ACCESS.station_operator_bom.can],
  },
  {
    role: "station_operator_hel",
    title: "Espoo Station",
    subtitle: "GS-HEL, OH2SOM",
    accent: "blue",
    can: [...ROLE_ACCESS.station_operator_hel.can],
  },
  {
    role: "student_analyst",
    title: "Student Analyst",
    subtitle: "Read-only",
    accent: "muted",
    can: [...ROLE_ACCESS.student_analyst.can],
  },
  {
    role: "ai_router",
    title: "AI Router",
    subtitle: "Spacecraft sensor",
    accent: "green",
    can: [...ROLE_ACCESS.ai_router.can],
  },
];

export function accentRing(accent: string): string {
  if (accent === "somaiya") return "var(--somaiya)";
  if (accent === "green") return "var(--ok)";
  if (accent === "muted") return "var(--text-3)";
  return "var(--ice)";
}

/** Simple geometric SVG avatars in brand style — never emoji. */
export function ProfileAvatar({ role, size = 44 }: { role: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    "aria-hidden": true,
  } as const;
  if (role === "mission_director") {
    return (
      <svg {...common}>
        <circle cx="24" cy="24" r="15" fill="none" stroke="var(--somaiya)" strokeWidth="4" />
        <circle cx="24" cy="24" r="5" fill="var(--somaiya)" />
      </svg>
    );
  }
  if (role === "station_operator_bom" || role === "station_operator_hel") {
    return (
      <svg {...common}>
        <path d="M10 34 A18 18 0 0 1 38 34" fill="none" stroke="var(--ice)" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="24" cy="36" r="3.5" fill="var(--ice)" />
        <line x1="24" y1="36" x2="24" y2="42" stroke="var(--ice)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="30" cy="14" r="2.4" fill="var(--text)" />
      </svg>
    );
  }
  if (role === "student_analyst") {
    return (
      <svg {...common}>
        <ellipse cx="24" cy="24" rx="15" ry="9.5" fill="none" stroke="var(--text-2)" strokeWidth="3" />
        <circle cx="24" cy="24" r="5" fill="none" stroke="var(--text-2)" strokeWidth="3" />
        <circle cx="24" cy="24" r="1.8" fill="var(--text)" />
      </svg>
    );
  }
  // ai_router: packet dot inside a hex.
  return (
    <svg {...common}>
      <polygon
        points="24,6 39,15 39,33 24,42 9,33 9,15"
        fill="none"
        stroke="var(--ok)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="5" fill="var(--ok)" />
    </svg>
  );
}
