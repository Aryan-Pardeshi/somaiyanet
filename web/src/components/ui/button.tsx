// adapted from lakshyamody/dbmsproj (landing)
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-display text-[13px] capitalize font-semibold whitespace-nowrap transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-35 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "border border-white bg-white text-black hover:bg-white/80 active:bg-white/70",
        destructive:
          "border border-white/60 bg-transparent text-white hover:border-white hover:bg-white hover:text-black",
        outline:
          "border border-white bg-transparent text-white hover:bg-white hover:text-black",
        secondary:
          "border border-white/70 bg-transparent text-white hover:border-white hover:bg-white hover:text-black",
        ghost:
          "border-transparent bg-transparent text-[var(--sx-text-2)] hover:text-white hover:bg-transparent",
        link: "border-0 bg-transparent text-white underline underline-offset-4 decoration-white/35 hover:decoration-white p-0 h-auto normal-case tracking-normal",
      },
      size: {
        default: "min-h-[44px] h-11 px-6 text-[13px] has-[>svg]:px-5",
        xs: "min-h-[36px] h-9 px-3.5 text-[11px] has-[>svg]:px-3 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "min-h-[36px] h-9 px-4.5 text-[12px] has-[>svg]:px-3.5",
        lg: "min-h-[48px] h-12 px-7 text-[13px] has-[>svg]:px-6",
        icon: "size-11 min-h-[44px] min-w-[44px] p-0",
        "icon-xs": "size-9 min-h-[36px] min-w-[36px] p-0 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9 min-h-[36px] min-w-[36px] p-0",
        "icon-lg": "size-12 min-h-[48px] min-w-[48px] p-0",
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
