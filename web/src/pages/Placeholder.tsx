import { Link, useParams } from "react-router-dom"

/** Standby stub for console modules owned by later briefs.
 *  Rendered inside AppShell, so it owns content only (no header). */
export function Placeholder({ name }: { name: string }) {
  const { lab } = useParams()
  const label = lab ? `${name} / ${lab}` : name
  return (
    <div className="min-h-[70vh]">
      <main className="shell flex min-h-[70vh] flex-col items-start justify-center py-32">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em]">
          <span className="text-[var(--somaiya)]">···</span>
          <span className="mx-2 text-[var(--mute)]">/</span>
          <span className="text-[var(--cream-dim)]">Standby</span>
        </p>
        <h1 className="font-display mt-6 font-bold tracking-tight" style={{ fontSize: "clamp(36px, 5vw, 72px)" }}>
          {label}
        </h1>
        <p className="mt-4 max-w-[60ch] text-sm leading-[1.8] text-[var(--cream-dim)]">
          This console module is stubbed for a later task. The story at{" "}
          <Link to="/" className="text-[var(--cream)] underline">
            /
          </Link>{" "}
          is live.
        </p>
      </main>
    </div>
  )
}
