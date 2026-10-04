import { cn } from "@/lib/utils"

/** SomaiyaNet wordmark. The logo mark is a Somaiya-red packet dot. */
export function Brand({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display inline-flex select-none items-center gap-2 font-bold tracking-tight",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="inline-block size-[0.55em] rounded-[30%] bg-[var(--somaiya)]"
        style={{ boxShadow: "0 0 14px 2px var(--somaiya-soft), 0 0 4px var(--somaiya)" }}
      />
      <span className="text-[var(--cream)]">
        Somaiya<span className="text-[var(--somaiya)]">Net</span>
      </span>
      <span className="sr-only">SomaiyaNet</span>
    </span>
  )
}
