// adapted from lakshyamody/dbmsproj (landing)
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 py-0.5 font-display text-[11px] font-medium capitalize whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--sx-surface-2)] text-white/70",
        secondary:
          "bg-[var(--sx-surface-2)] text-white/70",
        destructive:
          "border border-[var(--sx-red)]/30 bg-[var(--sx-red)]/15 text-[var(--sx-red)]",
        outline:
          "border border-[var(--sx-hairline)] bg-transparent text-white/70",
        ghost:
          "bg-transparent text-[var(--sx-text-3)]",
        link: "bg-transparent text-white underline underline-offset-2",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
