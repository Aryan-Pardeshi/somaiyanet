import { useRef } from "react"
import { Link } from "react-router-dom"
import { ChapterShell } from "@/landing/ChapterShell"
import { useReveal } from "@/landing/usePinnedScrub"

const PROFILES: Array<{
  name: string
  role: string
  rule: string
  accent: string
}> = [
  {
    name: "Mission Director",
    role: "mission_director",
    rule: "Sees everything, grants everything — PostgreSQL trusts no one else this much.",
    accent: "#d7263d",
  },
  {
    name: "Mumbai Station",
    role: "station_operator_bom",
    rule: "Reads the mission, writes telecommands — but only for GS-BOM. RLS checks the badge.",
    accent: "#6ea8ff",
  },
  {
    name: "Espoo Station",
    role: "station_operator_hel",
    rule: "Same console, different station: GS-HEL windows only. Try reading Mumbai's and be refused.",
    accent: "#6ea8ff",
  },
  {
    name: "Student Analyst",
    role: "student_analyst",
    rule: "May read, may never write — PostgreSQL enforces it, not the app.",
    accent: "#7d7a73",
  },
  {
    name: "AI Router",
    role: "ai_router",
    rule: "The spacecraft itself: INSERTs telemetry, can never SELECT it back. Write-only sensor.",
    accent: "#4cc38a",
  },
]

/**
 * 07 / WHO MAY SEE IT. Five profile cards preview the console: hovering a
 * card slides the packet through a lock, and the CTA hands off to /console
 * where every query runs as the real Postgres role.
 */
export function WhoMaySeeChapter() {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useReveal(rootRef)

  return (
    <div ref={rootRef}>
      <ChapterShell
        index="07"
        title="Who may see it"
        sectionId="who-may-see"
        status="DELIVERED"
        headline="Five consoles. One database saying no."
        copy={[
          "There is no login form — you pick a console profile, and the backend opens a pooled connection as that real Postgres role. Permission denials and row filters come from PostgreSQL, not from app code.",
          "Hover a card: the packet passes through the lock exactly as far as that role may take it.",
        ]}
        visual={
          <div className="flex flex-col gap-3">
            {PROFILES.map((p) => (
              <div
                key={p.role}
                className="group relative overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4 transition-colors hover:border-[var(--cream-dim)]"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="font-display inline-flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
                    style={{ backgroundColor: p.accent }}
                  >
                    {p.name.charAt(0)}
                  </span>
                  <div>
                    <p className="font-display text-[15px] font-bold text-[var(--cream)]">
                      {p.name}
                    </p>
                    <p className="font-mono text-[11px] tracking-[0.1em] text-[var(--mute)]">
                      {p.role}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="ml-auto font-mono text-[13px] text-[var(--mute)] transition-colors group-hover:text-[var(--amber)]"
                  >
                    ◈ lock
                  </span>
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--cream-dim)]">
                  {p.rule}
                </p>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-1/2 size-2 -translate-y-1/2 rounded-full bg-[var(--somaiya)] opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100"
                  style={{ boxShadow: "0 0 10px var(--somaiya)" }}
                />
              </div>
            ))}
            <Link
              to="/console"
              className="font-display mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--somaiya)] px-8 py-4 text-lg font-bold text-white transition-transform hover:scale-[1.02]"
            >
              Take the console →
            </Link>
          </div>
        }
      />
    </div>
  )
}
