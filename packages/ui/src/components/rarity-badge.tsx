import type { Rarity } from "@workspace/ui/lib/game/theme"
import { cn } from "@workspace/ui/lib/utils"
import type * as React from "react"

function RarityBadge({
  rarity,
  className,
  ...props
}: React.ComponentProps<"span"> & { rarity: Rarity }) {
  return (
    <span
      data-slot="rarity-badge"
      data-rarity={rarity}
      className={cn(
        "px-3 py-1.5 text-xs font-bold inline-flex items-center rounded-full border-2 border-ink text-ink capitalize game-fill",
        className
      )}
      {...props}
    >
      {rarity}
    </span>
  )
}

export { RarityBadge }
