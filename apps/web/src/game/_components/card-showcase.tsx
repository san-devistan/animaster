import type { CollectedCard } from "@/game/_lib/demo-data"
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
  // The facts and close button show once the reveal has played out.
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
    timers.push(
      setTimeout(
        () => setSettled(true),
        (FLY + REVEAL_PLAYED[card.rarity]) * 1000
      )
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
          className="inset-x-0 top-0 px-5 md:px-8 md:pt-8 -translate-y-4 data-shown:translate-y-0 pointer-events-none absolute flex justify-end game-safe-top opacity-0 transition duration-300 data-shown:opacity-100"
        >
          <CountBadge count={card.copies} />
        </div>
      ) : null}
      <div
        data-shown={flying || undefined}
        data-settled={settled || undefined}
        className="group/panel inset-x-0 bottom-0 pb-6 md:pb-8 pointer-events-none absolute data-shown:pointer-events-auto"
      >
        {/* Each row rises and fades in once the reveal is done, one after
            the other; they leave together when the card heads home. */}
        <div className="max-w-md px-5 gap-4 *:translate-y-3 *:ease-out group-data-settled/panel:*:translate-y-0 mx-auto flex flex-col items-center *:opacity-0 *:transition *:duration-500 group-data-settled/panel:*:opacity-100 group-data-settled/panel:*:nth-2:delay-100 group-data-settled/panel:*:nth-3:delay-200">
          {/* One centred group, each fact as wide as its value, so a long
              date doesn't pull the weight to one side. */}
          <dl
            ref={factsRef}
            className="gap-5 *:pr-5 *:last:pr-0 flex items-center justify-center divide-x-2 divide-ink/15"
          >
            <CardFact label="Type" value={card.stat} />
            <CardFact label="Rarity" value={card.rarity} />
          </dl>
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
