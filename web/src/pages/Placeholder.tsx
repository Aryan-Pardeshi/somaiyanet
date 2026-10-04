import { Link, useParams } from "react-router-dom"
import { Panel } from "@/components/cc/Panel"

/** Standby stub for console modules owned by later briefs.
 *  Rendered inside AppShell, so it owns content only (no header). */
export function Placeholder({ name }: { name: string }) {
  const { lab } = useParams()
  const label = lab ? `${name} / ${lab}` : name

  return (
    <div className="flex flex-col gap-6 py-6 max-w-4xl">
      {/* Page title row: light 28-34px title + a one-line muted description; no icons in headings */}
      <div className="flex flex-col gap-1">
        <h1 className="font-sans text-[30px] font-light tracking-tight text-white">
          {label}
        </h1>
        <p className="font-sans text-[13px] text-[#8b96b0]">
          Console module telemetry and operations channel
        </p>
      </div>

      {/* Chamfered glass panel */}
      <Panel cut={8} className="w-full">
        <div className="p-6 flex flex-col items-start gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">
              System status
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 border border-[#f5a524]/40 bg-[#f5a524]/10 text-[#f5a524]">
              STANDBY
            </span>
          </div>

          <p className="font-sans text-[13px] leading-relaxed text-[#dfe6f5] max-w-[65ch]">
            This console module is stubbed for a later task. The story at{" "}
            <Link to="/" className="text-[#3d5bff] hover:underline font-mono">
              /
            </Link>{" "}
            is live.
          </p>

          <div className="font-mono text-[10px] text-[#5f6f93] pt-3 border-t border-white/[0.06] w-full flex items-center justify-between">
            <span>PAGE: {label.toUpperCase()}</span>
            <span>COMING SOON</span>
          </div>
        </div>
      </Panel>
    </div>
  )
}
