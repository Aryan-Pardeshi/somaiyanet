import { cn } from "@/lib/utils"

export type PacketStatus = "QUEUED" | "CLAIMED" | "ROUTED" | "DELIVERED"

const STATUS_STYLE: Record<PacketStatus, string> = {
  QUEUED: "bg-[var(--navy-600)] text-[var(--text-2)]",
  CLAIMED: "bg-[var(--navy-600)] text-[var(--ice-strong)]",
  ROUTED: "bg-[var(--navy-600)] text-[var(--ice-strong)]",
  DELIVERED: "bg-[var(--navy-600)] text-[var(--ok)]",
}

/**
 * The signature motif: a small navy pill tracking our one packet through
 * the story. The red travelling dot is the only Somaiya-red element here.
 */
export function PacketTag({
  id = "PKT 0412",
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
        "inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--navy-800)] px-3 py-1 text-[11px] text-[var(--text)]",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="inline-block size-1.5 rounded-full bg-[var(--somaiya)]"
        style={{ boxShadow: "0 0 8px var(--somaiya)" }}
      />
      <span className="font-mono">
        {id} {mode} {size}
      </span>
      <span
        className={cn(
          "rounded-full px-2 py-px text-[10px] font-medium",
          STATUS_STYLE[status]
        )}
      >
        {status}
      </span>
    </span>
  )
}
