import { COLLECTION, PLAYER } from "@/game/_lib/demo-data"
import { CardBack } from "@workspace/ui/components/card-back"
import {
  GameMain,
  GameProgress,
  GameStat,
} from "@workspace/ui/components/game-shell"
import { RarityBadge } from "@workspace/ui/components/rarity-badge"

const RECENT = COLLECTION.toSorted((a, b) =>
  b.pulledOn.localeCompare(a.pulledOn)
).slice(0, 5)

export function ProfilePage() {
  return (
    <GameMain layout="scroll">
      <div className="gap-6 lg:grid lg:grid-cols-3 flex flex-col">
        <section className="gap-6 lg:col-span-2 flex flex-col">
          <header className="gap-4 flex items-center">
            <span className="size-18 text-3xl font-black grid place-items-center rounded-full border-3 border-ink font-heading text-brand-foreground game-brand-fill">
              {PLAYER.name.slice(0, 1)}
            </span>
            <div>
              <h1 className="text-4xl font-black md:text-6xl tracking-tighter font-heading">
                {PLAYER.name}
              </h1>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                Collector · LV {PLAYER.level}
              </p>
            </div>
          </header>

          <dl className="gap-2 grid grid-cols-3">
            <GameStat label="Cards" value={PLAYER.owned} />
            <GameStat label="Packs" value={PLAYER.packs} />
            <GameStat label="Streak" value={PLAYER.streak} />
          </dl>

          <GameProgress
            label="Billion Club"
            value={PLAYER.owned}
            max={PLAYER.total}
          />

          <section aria-labelledby="recent-pulls">
            <h2 id="recent-pulls" className="text-xl font-black font-heading">
              Recent pulls
            </h2>
            <ul className="mt-3 gap-2 grid">
              {RECENT.map((song) => (
                <li
                  key={song.id}
                  className="gap-3 p-2 pr-3 flex items-center rounded-3xl bg-card"
                >
                  <img
                    src={song.imageUrl}
                    alt=""
                    className="size-12 rounded-xl object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <b className="text-sm block truncate">{song.title}</b>
                    <span className="text-xs block truncate text-muted-foreground">
                      {song.artist}
                    </span>
                  </span>
                  <RarityBadge rarity={song.rarity} />
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
