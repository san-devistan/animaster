import { cn } from "@workspace/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

const gameStageVariants = cva("game-studio", {
  variants: {
    shape: {
      card: "",
      screen: "md:rounded-4xl rounded-none",
    },
    size: {
      auto: "",
      hero: "game-stage-height",
    },
  },
  defaultVariants: { shape: "card", size: "auto" },
})

function GameStage({
  className,
  children,
  shape,
  size,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof gameStageVariants>) {
  return (
    <div
      data-slot="game-stage"
      className={cn(gameStageVariants({ shape, size }), className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { GameStage }
