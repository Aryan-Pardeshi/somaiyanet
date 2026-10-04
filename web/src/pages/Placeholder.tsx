import { Link, useParams } from "react-router-dom"
import { Brand } from "@/components/story/Brand"

/** Standby stub for console modules owned by later briefs. */
export function Placeholder({ name }: { name: string }) {
  const { lab } = useParams()
  const label = lab ? `${name} / ${lab}` : name
  return (
    <div className="grid-paper min-h-screen bg-[var(--ink)] text-[var(--cream)]">
      <header className="border-b border-[var(--rule)]">
        <div className="shell flex h-14 items-center justify-between">
          <Link to="/" aria-label="SomaiyaNet home">
            <Brand className="text-lg" />
          </Link>
          <Link
            to="/"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--mute)] hover:text-[var(--cream)]"
          >
            ← back to the packet
          </Link>
        </div>
      </header>
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
