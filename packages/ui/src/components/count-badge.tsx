import { cn } from "@workspace/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

const countBadgeVariants = cva("game-count-badge", {
  variants: {
    size: {
      // On a card's corner, scaled with the card (an @container/thumb).
      card: "absolute top-[3cqw] right-[3cqw] z-1 text-[5cqw]",
      // On its own, e.g. a screen's corner.
      screen: "text-base",
    },
  },
  defaultVariants: { size: "screen" },
})

// How many copies of a card the player holds, as "×2"; nothing for one.
function CountBadge({
  count,
  size,
  className,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof countBadgeVariants> & { count: number }) {
  if (count < 2) return null
  return (
    <span
      data-slot="count-badge"
      className={cn(countBadgeVariants({ size }), className)}
      aria-label={`${count} copies`}
      {...props}
    >
      ×{count}
    </span>
  )
}

export { CountBadge }
