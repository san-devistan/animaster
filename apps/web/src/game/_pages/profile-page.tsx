import { useCollectedCards } from "@/game/_lib/collection"
import { convexQuery } from "@convex-dev/react-query"
import { useQuery } from "@tanstack/react-query"
import { api } from "@workspace/backend/api"
import { CardBack } from "@workspace/ui/components/card-back"
import {
  GameMain,
  GameProgress,
  GameStat,
} from "@workspace/ui/components/game-shell"
import { RarityBadge } from "@workspace/ui/components/rarity-badge"

export function ProfilePage() {
  const collection = useCollectedCards() ?? []
  const { data: catalog } = useQuery(convexQuery(api.packs.catalog, {}))
  const recent = collection
    .toSorted((a, b) => b.pulledAt - a.pulledAt)
    .slice(0, 5)
  const copies = collection.reduce((sum, card) => sum + card.copies, 0)

  return (
    <GameMain layout="scroll">
      <div className="gap-6 lg:grid lg:grid-cols-3 flex flex-col">
        <section className="gap-6 lg:col-span-2 flex flex-col">
          <header className="gap-4 flex items-center">
            <span className="size-18 text-3xl font-black grid place-items-center rounded-full border-3 border-ink font-heading text-brand-foreground game-brand-fill">
              G
            </span>
            <div>
              <h1 className="text-4xl font-black md:text-6xl tracking-tighter font-heading">
                Guest
              </h1>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                Collector
              </p>
            </div>
          </header>

          <dl className="gap-2 grid grid-cols-3">
            <GameStat label="Species" value={collection.length} />
            <GameStat label="Copies" value={copies} />
            <GameStat
              label="Legendary"
              value={
                collection.filter((card) => card.rarity === "legendary").length
              }
            />
          </dl>

          <GameProgress
            label="Wild Pack"
            value={collection.length}
            max={catalog?.total ?? 0}
          />

          <section aria-labelledby="recent-pulls">
            <h2 id="recent-pulls" className="text-xl font-black font-heading">
              Recent pulls
            </h2>
            <ul className="mt-3 gap-2 grid">
              {recent.map((card) => (
                <li
                  key={card.id}
                  className="gap-3 p-2 pr-3 flex items-center rounded-3xl bg-card"
                >
                  <img
                    src={card.imageUrl}
                    alt=""
                    className="size-12 rounded-xl object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <b className="text-sm block truncate">{card.name}</b>
                    <span className="text-xs block truncate text-muted-foreground">
                      {card.subtitle}
                    </span>
                  </span>
                  <RarityBadge rarity={card.rarity} />
                </li>
              ))}
            </ul>
          </section>
        </section>

        <aside className="lg:block hidden" aria-label="Card back">
          <CardBack />
        </aside>
      </div>
    </GameMain>
  )
}
