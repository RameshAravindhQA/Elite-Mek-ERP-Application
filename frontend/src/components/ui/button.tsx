import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "soft-click inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-700 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:transform-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow-sm",
  {
    variants: {
      variant: {
        default:
          "bg-[hsl(var(--button-color))] text-[hsl(var(--button-foreground))] border border-[hsl(var(--button-color))] hover:bg-[hsl(var(--button-color))]/95 hover:shadow-md",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive-border hover:bg-destructive/95 shadow-sm hover:shadow-md",
        outline:
          "border border-[color:var(--button-outline)] bg-transparent text-[hsl(var(--button-color))] hover:bg-[hsl(var(--theme-light-shade))] hover:text-[hsl(var(--button-color))]",
        secondary:
          "border border-[hsl(var(--secondary-border))] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--secondary))]/90 shadow-sm hover:shadow-md",
        ghost: "bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--theme-light-shade))] border border-transparent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
