import { PLAYER } from "@/game/_lib/demo-data"
import { GamePill } from "@workspace/ui/components/game-shell"
import { LayersIcon } from "lucide-react"

export function CollectionCount() {
  return (
    <GamePill>
      <span
        className="size-6 [&_svg]:size-3 grid place-items-center rounded-full border-2 border-ink text-brand-foreground game-brand-fill"
        aria-hidden="true"
      >
        <LayersIcon strokeWidth={3} />
      </span>
      {PLAYER.owned} / {PLAYER.total.toLocaleString("en")}
    </GamePill>
  )
}
