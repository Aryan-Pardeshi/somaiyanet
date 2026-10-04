import { cn } from "@/lib/utils"

export type PacketStatus = "QUEUED" | "CLAIMED" | "ROUTED" | "DELIVERED"

/**
 * The signature motif: a small pill tracking our one packet through the story.
 * `PKT#0412 · SSTV · 41.2 KB`, plus its current lifecycle status.
 */
export function PacketTag({
  id = "PKT#0412",
  mode = "SSTV",
  size = "41.2 KB",
  status,
  className,
}: {
  id?: string
  mode?: string
  size?: string
  status: PacketStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "font-mono inline-flex items-center gap-2 rounded-full border border-[var(--somaiya)]/40 bg-[var(--somaiya-soft)] px-3 py-1 text-[11px] tracking-[0.08em] text-[var(--cream)]",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="inline-block size-1.5 rounded-full bg-[var(--somaiya)]"
        style={{ boxShadow: "0 0 8px var(--somaiya)" }}
      />
      {id} · {mode} · {size}
      <span className="rounded-full bg-[var(--somaiya)] px-2 py-px text-[10px] font-medium text-white">
        {status}
      </span>
    </span>
  )
}
