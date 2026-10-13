import type { CollectedCard } from "@/game/_lib/collection"
import { Button } from "@workspace/ui/components/button"
import { Celebration } from "@workspace/ui/components/celebration"
import { CountBadge } from "@workspace/ui/components/count-badge"
import {
  GameCard,
  type GameCardHandle,
} from "@workspace/ui/components/game-card"
import { GameMotes } from "@workspace/ui/components/game-motes"
import { GameStage } from "@workspace/ui/components/game-stage"
import type { CardSlot } from "@workspace/ui/lib/game/card-scene"
import { FLY, REVEAL_PLAYED } from "@workspace/ui/lib/game/reveal-motion"
import { play, REVEAL } from "@workspace/ui/lib/game/sfx"
import { XIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useEventListener } from "usehooks-ts"

// The showcase: the card lands above a bottom panel of card facts and the
// close button. Sizes in CSS px.
const CARD_RATIO = 336 / 240
// How far below the card the facts sit, as a share of its height: inside the
// mirror, so it fades out just behind them. Space is kept clear above the
// card for its bob and lift.
const MIRROR = 0.13
const TOP_GAP = 48
// The facts sit this much lower than the card's mirror alone would put them.
const FACTS_DROP = 16
// Seconds the panel's rows take to come in, one after the other (each row's
// fade plus the stagger before the last, as in the panel's classes): timed to
// be fully in as the card's reveal ends.
const PANEL_IN = 0.5 + 0.2

// Where the showcased card lands: as big as the pile allows, sitting low so
// its mirror fades out behind the facts text (`factsAt`, its middle, in px).
function landing(width: number, height: number, factsAt: number) {
  const room = factsAt - FACTS_DROP - TOP_GAP
  const cardWidth = Math.min(
    312,
    width - 48,
    room / (CARD_RATIO * (1 + MIRROR))
  )
  const cardHeight = cardWidth * CARD_RATIO
  const bottom = factsAt - FACTS_DROP - cardHeight * MIRROR
  return { width: cardWidth, y: bottom - cardHeight / 2 - height / 2 }
}

// The picked card, the grid slot it flies from, and where it is in its trip:
// still sitting on its thumb, out on show, or flying home.
export type Showcase = {
  card: CollectedCard
  from: CardSlot | undefined
  phase: "lifting" | "shown" | "returning"
}

export function CardDetail({
  showcase: { card, from, phase },
  home,
  onShown,
  onReturn,
  onClose,
}: {
  showcase: Showcase
  home: () => CardSlot | null
  onShown: () => void
  onReturn: () => void
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<GameCardHandle>(null)
  const factsRef = useRef<HTMLDListElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [landed, setLanded] = useState(false)
  // The facts and close button come in over the end of the reveal, so they
  // are all in as the card's animation ends.
  const [settled, setSettled] = useState(false)
  // Measured once the panel is laid out, before the card mounts.
  const [land, setLand] = useState<ReturnType<typeof landing> | null>(null)
  // Out on show, between take-off and heading home.
  const flying = phase === "shown"

  useLayoutEffect(() => {
    const box = factsRef.current?.getBoundingClientRect()
    // Less the 1rem the panel rises by as it shows.
    const at = box ? box.top + box.height / 2 - 16 : innerHeight
    const next = landing(innerWidth, innerHeight, at)
    setLand(next)
    // The card sits off the stage's middle; centre its celebration on it.
    const stage = stageRef.current
    const screen = stage?.parentElement?.getBoundingClientRect()
    if (stage && screen) {
      const frame = stage.getBoundingClientRect()
      const cardY = screen.top + screen.height / 2 + next.y
      stage.style.setProperty(
        "--celebration-y",
        `${cardY - frame.top - frame.height / 2}px`
      )
    }
  }, [])

  // Starts once the big card is drawn over its thumb.
  function takeOff() {
    onShown()
    closeRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!flying) return undefined
    const timers: Array<ReturnType<typeof setTimeout>> = []
    timers.push(setTimeout(() => setLanded(true), FLY * 1000))
    const played = FLY + REVEAL_PLAYED[card.rarity]
    timers.push(
      setTimeout(() => setSettled(true), Math.max(0, played - PANEL_IN) * 1000)
    )
    if (card.rarity === "legendary") {
      timers.push(setTimeout(() => play(REVEAL.legendary), FLY * 1000 + 850))
    }
    play(card.rarity === "legendary" ? "swipe" : REVEAL[card.rarity])
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [card, flying])

  async function close() {
    if (phase === "returning") return
    onReturn()
    setLanded(false)
    setSettled(false)
    play("swipe")
    await cardRef.current?.flyBack(home)
    onClose()
  }

  useEventListener("keydown", (event) => {
    if (event.key === "Escape") void close()
  })

  return (
    <dialog
      open
      aria-label={card.name}
      className="inset-0 p-0 m-0 fixed z-30 size-full max-h-none max-w-none bg-transparent text-ink"
    >
      {/* Under the card: the packs page's glowing motes and its celebration,
          framed like an opened pack. */}
      <div className="inset-0 md:p-8 pointer-events-none absolute">
        <GameStage
          ref={stageRef}
          shape="screen"
          className="md:max-w-md md:max-h-216 md:aspect-393/852 md:w-auto mx-auto size-full"
        >
          <GameMotes shown={flying} />
          {landed && (card.rarity === "epic" || card.rarity === "legendary") ? (
            <Celebration rarity={card.rarity} />
          ) : null}
        </GameStage>
      </div>
      {/* The whole viewport, so the card can fly from anywhere in the grid. */}
      {land ? (
        <GameCard
          ref={cardRef}
          card={card}
          from={from}
          land={land}
          reveal={!from}
          onReady={takeOff}
        />
      ) : null}
      {card.copies > 1 ? (
        <div
          data-shown={flying || undefined}
          className="inset-x-0 top-0 px-5 md:px-8 md:pt-8 -translate-y-4 data-shown:translate-y-0 pointer-events-none absolute flex justify-end game-safe-top opacity-0 transition duration-150 data-shown:opacity-100 data-shown:duration-300"
        >
          <CountBadge count={card.copies} />
        </div>
      ) : null}
      <div
        data-shown={flying || undefined}
        data-settled={settled || undefined}
        className="group/panel inset-x-0 bottom-0 pb-6 md:pb-8 pointer-events-none absolute data-shown:pointer-events-auto"
      >
        {/* Each row rises and fades in over the end of the reveal, one after
            the other; they leave together, quickly, as the card heads home. */}
        <div className="max-w-md px-5 gap-4 *:translate-y-3 *:ease-out group-data-settled/panel:*:translate-y-0 mx-auto flex flex-col items-center *:opacity-0 *:transition *:duration-150 group-data-settled/panel:*:opacity-100 group-data-settled/panel:*:duration-500 group-data-settled/panel:*:nth-2:delay-100 group-data-settled/panel:*:nth-3:delay-200">
          {/* One centred group, each fact as wide as its value, so a long
              date doesn't pull the weight to one side. */}
          <dl
            ref={factsRef}
            className="gap-5 *:pr-5 *:last:pr-0 flex items-center justify-center divide-x-2 divide-ink/15"
          >
            <CardFact label="Type" value={card.stat} />
          </dl>
          {card.wikipediaUrl ? (
            <div className="gap-3 flex items-center justify-center">
              <WikipediaLink url={card.wikipediaUrl} />
            </div>
          ) : null}
          {/* Wrapped: the button's own transition would override the row's. */}
          <div className="mt-6">
            <Button
              ref={closeRef}
              variant="game"
              size="icon-game"
              onClick={() => void close()}
              aria-label="Close"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  )
}

function CardFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <dt className="text-xs font-semibold tracking-wide text-ink/60 uppercase">
        {label}
      </dt>
      <dd className="text-xl font-black font-heading whitespace-nowrap">
        {value}
      </dd>
    </div>
  )
}

// The species' Wikipedia article, opened in a new tab. Mark from Simple
// Icons (CC0), 24px grid.
function WikipediaLink({ url }: { url: string }) {
  return (
    <Button
      variant="game"
      size="icon-game"
      nativeButton={false}
      aria-label="Open on Wikipedia"
      render={(props) => (
        <a {...props} href={url} target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12.09 13.119c-.936 1.932-2.217 4.548-2.853 5.728-.616 1.074-1.127.931-1.532.029-1.406-3.321-4.293-9.144-5.651-12.409-.251-.601-.441-.987-.619-1.139-.181-.15-.554-.24-1.122-.271C.103 5.033 0 4.982 0 4.898v-.455l.052-.045c.924-.005 5.401 0 5.401 0l.051.045v.434c0 .119-.075.176-.225.176l-.564.031c-.485.029-.727.164-.727.436 0 .135.053.33.166.601 1.082 2.646 4.818 10.521 4.818 10.521l.136.046 2.411-4.81-.482-1.067-1.658-3.264s-.318-.654-.428-.872c-.728-1.443-.712-1.518-1.447-1.617-.207-.023-.313-.05-.313-.149v-.468l.06-.045h4.292l.113.037v.451c0 .105-.076.15-.227.15l-.308.047c-.792.061-.661.381-.136 1.422l1.582 3.252 1.758-3.504c.293-.64.233-.801.111-.947-.07-.084-.305-.22-.812-.24l-.201-.021c-.052 0-.098-.015-.145-.051-.045-.031-.067-.076-.067-.129v-.427l.061-.045c1.247-.008 4.043 0 4.043 0l.059.045v.436c0 .121-.059.178-.193.178-.646.03-.782.095-1.023.439-.12.186-.375.589-.646 1.039l-2.301 4.273-.065.135 2.792 5.712.17.048 4.396-10.438c.154-.422.129-.722-.064-.895-.197-.172-.346-.273-.857-.295l-.42-.016c-.061 0-.105-.014-.152-.045-.043-.029-.072-.075-.072-.119v-.436l.059-.045h4.961l.041.045v.437c0 .119-.074.18-.209.18-.648.03-1.127.18-1.443.421-.314.255-.557.616-.736 1.067 0 0-4.043 9.258-5.426 12.339-.525 1.007-1.053.917-1.503-.031-.571-1.171-1.773-3.786-2.646-5.71l.053-.036z"
              fill="currentColor"
              stroke="none"
            />
          </svg>
        </a>
      )}
    />
  )
}
