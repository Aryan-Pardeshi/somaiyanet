// adapted from lakshyamody/dbmsproj (landing)
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-none font-mono text-[11px] uppercase tracking-[0.1em] font-medium whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#3d5bff] focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "border border-[#3d5bff] bg-[#3d5bff] text-white hover:bg-[#4d6aff] hover:border-[#4d6aff] active:bg-[#324ecc] shadow-[0_0_8px_rgba(61,91,255,0.4)]",
        destructive:
          "border border-[#ff3b4f]/60 bg-transparent text-[#ff3b4f] hover:bg-[#ff3b4f]/10 hover:border-[#ff3b4f]",
        outline:
          "border border-white/15 bg-transparent text-[#dfe6f5] hover:border-white/30 hover:bg-white/[0.04]",
        secondary:
          "border border-white/15 bg-transparent text-[#dfe6f5] hover:border-white/30 hover:bg-white/[0.04] active:bg-white/[0.08]",
        ghost:
          "border border-transparent bg-transparent text-[#8b96b0] hover:text-[#dfe6f5] hover:bg-white/[0.05]",
        link: "border-0 bg-transparent text-[#3d5bff] underline-offset-4 hover:underline p-0 h-auto normal-case tracking-normal",
      },
      size: {
        default: "h-8 px-3.5 py-1.5 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-[10px] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 px-2.5 text-[10px] has-[>svg]:px-2",
        lg: "h-10 px-6 text-[12px] has-[>svg]:px-5",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
