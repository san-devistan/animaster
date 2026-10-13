import { CardDetail, type Showcase } from "@/game/_components/card-showcase"
import { CollectionCount } from "@/game/_components/collection-count"
import { useCollectedCards, type CollectedCard } from "@/game/_lib/collection"
import { getRouteApi, Link } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import {
  GameCardThumb,
  gameCardThumbSlot,
} from "@workspace/ui/components/game-card"
import { GameMain, GameScroll } from "@workspace/ui/components/game-shell"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  RARITY_ORDER,
  type CssVars,
  type Rarity,
} from "@workspace/ui/lib/game/theme"
import {
  ArrowDownAZIcon,
  ArrowDownUpIcon,
  ClockIcon,
  GemIcon,
  ListFilterIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"

const FILTERS = {
  all: "All rarities",
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
} as const satisfies Record<"all" | Rarity, string>
type Filter = keyof typeof FILTERS

const rarityRank = (card: CollectedCard) => RARITY_ORDER.indexOf(card.rarity)

const SORTS = {
  recent: {
    label: "Recent",
    Icon: ClockIcon,
    compare: (a: CollectedCard, b: CollectedCard) => b.pulledAt - a.pulledAt,
  },
  rarest: {
    label: "Rarest",
    Icon: GemIcon,
    compare: (a: CollectedCard, b: CollectedCard) =>
      rarityRank(b) - rarityRank(a) || a.name.localeCompare(b.name),
  },
  name: {
    label: "A–Z",
    Icon: ArrowDownAZIcon,
    compare: (a: CollectedCard, b: CollectedCard) =>
      a.name.localeCompare(b.name),
  },
} as const
type SortKey = keyof typeof SORTS
const SORT_LABELS = Object.fromEntries(
  Object.entries(SORTS).map(([key, { label }]) => [key, label])
)

// Each card's place in the grid. Under "recent", just-pulled `added` cards
// come first, newest first; a pack's cards share a pull time and come oldest
// saved first (least rare), so reversed, ties go newest first, as they dropped in.
function gridOrder(
  collection: ReadonlyArray<CollectedCard>,
  sort: SortKey,
  added: ReadonlyArray<string>
) {
  const freshness = (card: CollectedCard) => {
    const at = added.indexOf(card.id)
    return at < 0 ? added.length : at
  }
  return new Map(
    collection
      .toReversed()
      .toSorted((a, b) =>
        sort === "recent"
          ? freshness(a) - freshness(b) || SORTS.recent.compare(a, b)
          : SORTS[sort].compare(a, b)
      )
      .map((card, at) => [card.id, at])
  )
}

const TRIGGER_CLASS = "flex-1 sm:flex-none sm:min-w-48"
// Seconds before the first just-pulled card drops into the collection, then
// between each next one, and the drop itself (see game-drop).
const FIRST_DROP = 0.35
const DROP_STAGGER = 0.45
const DROP = 0.6
const route = getRouteApi("/_game/collection")

export function CollectionPage() {
  const cards = useCollectedCards()
  const collection = cards ?? []
  // New cards just pulled, newest first: first in the grid, dropped in one
  // by one, and badged NEW until the page drops `added` from the URL.
  const { added = [] } = route.useSearch()
  const fresh = new Set(added)
  // How many of the new cards are in the grid so far, oldest pull first.
  const [landed, setLanded] = useState(0)
  const arriving = landed < added.length
  // The tab bar stays away until the last one is in, so none falls over it.
  const [settled, setSettled] = useState(!arriving)
  const isLanded = (card: CollectedCard) => {
    const at = added.indexOf(card.id)
    return at < 0 || added.length - 1 - at < landed
  }
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<SortKey>("recent")
  const [showcase, setShowcase] = useState<Showcase | null>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const selected = showcase?.card ?? null
  // By id: a live collection update brings new card objects.
  const isAway = (card: CollectedCard) =>
    selected?.id === card.id && showcase?.phase !== "lifting"
  // The page steps aside once the big card covers its thumb, and comes back
  // as it heads home.
  const immersive = showcase?.phase === "shown"
  const order = gridOrder(collection, sort, added)
  const isShown = (card: CollectedCard) =>
    filter === "all" || card.rarity === filter

  useEffect(() => {
    if (!showcase) openerRef.current?.focus({ preventScroll: true })
  }, [showcase])

  useEffect(() => {
    if (!arriving) return undefined
    // The first lands as the page settles; each next once the last is in.
    const timer = setTimeout(
      () => {
        // Slides the cards below down to make room, where supported.
        if (!document.startViewTransition) {
          return setLanded((count) => count + 1)
        }
        document.startViewTransition(() =>
          flushSync(() => setLanded((count) => count + 1))
        )
      },
      (landed === 0 ? FIRST_DROP : DROP_STAGGER) * 1000
    )
    return () => clearTimeout(timer)
  }, [arriving, landed])

  useEffect(() => {
    if (arriving || settled) return undefined
    const timer = setTimeout(() => setSettled(true), DROP * 1000)
    return () => clearTimeout(timer)
  }, [arriving, settled])

  return (
    // Like an opened pack: the page and tab bar step aside for the card,
    // which flies out of the grid and back into it.
    <div
      data-immersive={immersive || undefined}
      className="min-h-0 relative flex flex-1 flex-col"
    >
      {/* Sends only the tab bar away; the page itself stays. */}
      {settled ? null : <span data-immersive hidden />}
      <GameMain inert={showcase !== null}>
        <header className="gap-x-3 gap-y-3 flex flex-wrap items-center justify-between">
          <h1 className="text-4xl font-black md:text-6xl tracking-tighter font-heading">
            Collection
          </h1>
          <CollectionCount />
        </header>

        <div className="mt-5 gap-3 flex">
          <Select
            items={FILTERS}
            value={filter}
            onValueChange={(value) => {
              if (value) setFilter(value)
            }}
          >
            <SelectTrigger
              variant="game"
              aria-label="Filter by rarity"
              className={TRIGGER_CLASS}
            >
              <ListFilterIcon aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent variant="game">
              {Object.entries(FILTERS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  <span
                    data-rarity={key === "all" ? undefined : key}
                    className="size-3 self-center rounded-full border-2 border-ink not-data-rarity:game-rarity-grid data-rarity:game-fill"
                    aria-hidden="true"
                  />
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            items={SORT_LABELS}
            value={sort}
            onValueChange={(value) => {
              if (value) setSort(value)
            }}
          >
            <SelectTrigger
              variant="game"
              aria-label="Sort cards"
              className={TRIGGER_CLASS}
            >
              <ArrowDownUpIcon aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent variant="game">
              {Object.entries(SORTS).map(([key, { label, Icon }]) => (
                <SelectItem key={key} value={key}>
                  <Icon aria-hidden="true" strokeWidth={2.5} />
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <GameScroll>
          <EmptyCollection shown={cards?.length === 0} />
          <ul className="gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 grid grid-cols-2">
            {/* Keep WebGL cards mounted while filtering; hide and reorder instead. */}
            {collection.map((card) => {
              const isNew = fresh.has(card.id)
              const orderStyle: CssVars = {
                "--game-order": String(order.get(card.id)),
                "--game-card": `card-${card.id}`,
              }
              return (
                <li
                  key={card.id}
                  hidden={!isShown(card) || !isLanded(card)}
                  className={
                    isNew
                      ? "game-drop game-order game-slides"
                      : "game-order game-slides"
                  }
                  style={orderStyle}
                >
                  <button
                    type="button"
                    className="group/card @container relative block w-full rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-ring"
                    aria-label={`${card.name}, ${card.subtitle}, ${card.rarity}${isNew ? ", new" : ""}`}
                    onClick={(event) => {
                      openerRef.current = event.currentTarget
                      setShowcase({
                        card,
                        from:
                          gameCardThumbSlot(event.currentTarget) ?? undefined,
                        phase: "lifting",
                      })
                    }}
                  >
                    <GameCardThumb
                      card={card}
                      copies={card.copies}
                      away={isAway(card)}
                    />
                    {isNew ? (
                      <span
                        className="group-hover/card:-translate-y-1 game-new-badge transition-transform"
                        aria-hidden="true"
                      >
                        NEW
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </GameScroll>
      </GameMain>

      {showcase ? (
        <CardDetail
          showcase={showcase}
          home={() => gameCardThumbSlot(openerRef.current)}
          onShown={() =>
            setShowcase((current) =>
              current ? { ...current, phase: "shown" } : null
            )
          }
          onReturn={() =>
            setShowcase((current) =>
              current ? { ...current, phase: "returning" } : null
            )
          }
          onClose={() => setShowcase(null)}
        />
      ) : null}
    </div>
  )
}

function EmptyCollection({ shown }: { shown: boolean }) {
  if (!shown) return null
  return (
    <div className="gap-4 pt-16 flex flex-col items-center text-center">
      <p className="text-lg font-bold">No cards yet</p>
      <Button
        variant="game"
        nativeButton={false}
        render={<Link to="/">Open a pack</Link>}
      />
    </div>
  )
}
