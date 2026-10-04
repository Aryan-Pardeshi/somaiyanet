// adapted from lakshyamody/dbmsproj (landing)
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-none border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#3d5bff] [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-[#3d5bff]/40 bg-[#3d5bff]/10 text-[#7fb2ff] [a&]:hover:bg-[#3d5bff]/20",
        secondary:
          "border-white/15 bg-white/[0.04] text-[#dfe6f5] [a&]:hover:bg-white/[0.08]",
        destructive:
          "border-[#ff3b4f]/40 bg-[#ff3b4f]/10 text-[#ff3b4f] [a&]:hover:bg-[#ff3b4f]/20",
        outline:
          "border-white/15 bg-transparent text-[#8b96b0] [a&]:hover:text-white [a&]:hover:border-white/30",
        ghost:
          "border-transparent bg-transparent text-[#8b96b0] [a&]:hover:text-white [a&]:hover:bg-white/[0.05]",
        link: "border-transparent text-[#3d5bff] underline-offset-4 [a&]:hover:underline",
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
