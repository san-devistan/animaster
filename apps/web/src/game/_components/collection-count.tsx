import { useCollectedCards } from "@/game/_lib/collection"
import { convexQuery } from "@convex-dev/react-query"
import { useQuery } from "@tanstack/react-query"
import { api } from "@workspace/backend/api"
import { GamePill } from "@workspace/ui/components/game-shell"
import { LayersIcon } from "lucide-react"

export function CollectionCount() {
  const owned = useCollectedCards()
  const { data: catalog } = useQuery(convexQuery(api.packs.catalog, {}))
  return (
    <GamePill>
      <span
        className="size-6 [&_svg]:size-3 grid place-items-center rounded-full border-2 border-ink text-brand-foreground game-brand-fill"
        aria-hidden="true"
      >
        <LayersIcon strokeWidth={3} />
      </span>
      {owned?.length ?? 0} / {(catalog?.total ?? 0).toLocaleString("en")}
    </GamePill>
  )
}
