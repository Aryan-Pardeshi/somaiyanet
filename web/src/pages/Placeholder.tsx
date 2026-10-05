import { Link, useParams } from "react-router-dom"
import { Panel } from "@/components/cc/Panel"

/** Standby stub for console modules owned by later briefs.
 *  Rendered inside AppShell, so it owns content only (no header). */
export function Placeholder({ name }: { name: string }) {
  const { lab } = useParams()
  const label = lab ? `${name} / ${lab}` : name

  return (
    <div className="flex flex-col gap-6 py-4 max-w-4xl">
      <div className="flex flex-col gap-2">
        <h1 className="sx-h1">
          {label}
        </h1>
        <p className="sx-lead">
          Console module telemetry and operations channel.
        </p>
      </div>

      <Panel className="w-full">
        <div className="p-6 flex flex-col items-start gap-4">
          <div className="sx-status" data-tone="warn">
            Standby
          </div>

          <p className="sx-body max-w-[65ch]">
            This console module is stubbed for a later task. The story at{" "}
            <Link to="/" className="sx-link">
              home
            </Link>{" "}
            is live.
          </p>

          <div className="sx-caption pt-4 border-t border-[var(--sx-hairline)] w-full flex items-center justify-between">
            <span>{label}</span>
            <span>Coming soon</span>
          </div>
        </div>
      </Panel>
    </div>
  )
}
