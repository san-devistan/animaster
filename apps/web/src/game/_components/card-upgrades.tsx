import { withPhoto } from "@/game/_lib/photos"
import { convexQuery } from "@convex-dev/react-query"
import { useQuery } from "@tanstack/react-query"
import { api } from "@workspace/backend/api"
import { Button } from "@workspace/ui/components/button"
import { Celebration } from "@workspace/ui/components/celebration"
import {
  UpgradingCard,
  type UpgradingCardHandle,
} from "@workspace/ui/components/game-card"
import { GameMotes } from "@workspace/ui/components/game-motes"
import { GameStage } from "@workspace/ui/components/game-stage"
import { RarityBadge } from "@workspace/ui/components/rarity-badge"
import { UPGRADE } from "@workspace/ui/lib/game/reveal-motion"
import { play, REVEAL, sfx } from "@workspace/ui/lib/game/sfx"
import { RARITY_ORDER, type Rarity } from "@workspace/ui/lib/game/theme"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { ArrowRightIcon } from "lucide-react"
import { useRef, useState } from "react"

type Upgrade = FunctionReturnType<typeof api.packs.upgrades>[number]

// Every rarity from `from` up to `to`, so a card climbs one at a time.
const climb = (from: Rarity, to: Rarity) =>
  RARITY_ORDER.slice(RARITY_ORDER.indexOf(from), RARITY_ORDER.indexOf(to) + 1)

// Cards whose rarity went up since the player last saw them, after an import:
// shown on their own screen as the app opens, one after the other, each
// climbing a rarity per tap. A card is marked seen once it reaches its new
// rarity, so leaving midway shows the rest next time.
export function CardUpgrades() {
  const { data: rows } = useQuery(convexQuery(api.packs.upgrades, {}))
  // Taken once, as the app opens: an upgrade found mid-session waits for the
  // next visit, so it never cuts into a pack being opened.
  const [queue, setQueue] = useState<ReadonlyArray<Upgrade> | null>(null)
  if (!queue && rows) setQueue(rows.map(withPhoto))
  if (!queue?.length) return null
  return <UpgradeQueue queue={queue} onDone={() => setQueue([])} />
}

function UpgradeQueue({
  queue,
  onDone,
}: {
  queue: ReadonlyArray<Upgrade>
  onDone: () => void
}) {
  const seeUpgrade = useMutation(api.packs.seeUpgrade)
  const [index, setIndex] = useState(0)
  const card = queue[index]
  if (!card) return null

  function next() {
    if (index + 1 < queue.length) setIndex(index + 1)
    else onDone()
  }

  // Skipping marks every card left as seen.
  function skip() {
    for (const left of queue.slice(index)) {
      void seeUpgrade({ speciesId: left.id })
    }
    onDone()
  }

  return (
    <UpgradeShow
      key={card.id}
      card={card}
      count={{ at: index + 1, of: queue.length }}
      onSeen={() => void seeUpgrade({ speciesId: card.id })}
      onNext={next}
      onSkip={skip}
    />
  )
}

function UpgradeShow({
  card,
  count,
  onSeen,
  onNext,
  onSkip,
}: {
  card: Upgrade
  count: { at: number; of: number }
  onSeen: () => void
  onNext: () => void
  onSkip: () => void
}) {
  const cardRef = useRef<UpgradingCardHandle>(null)
  const [rarities] = useState(() => climb(card.from, card.rarity))
  const [step, setStep] = useState(0)
  const [ready, setReady] = useState(false)
  const [turning, setTurning] = useState(false)
  const rarity = rarities[step] ?? card.rarity
  const top = step === rarities.length - 1

  async function climbOnce() {
    if (!ready || turning) return
    void sfx.unlock()
    if (top) {
      play("swipe")
      onNext()
      return
    }
    const to = rarities[step + 1] ?? card.rarity
    setTurning(true)
    play("swipe")
    // The cue lands as the new rarity shows, halfway round.
    setTimeout(() => play(REVEAL[to]), (UPGRADE / 2) * 1000)
    await cardRef.current?.step()
    setStep(step + 1)
    setTurning(false)
    if (step + 1 === rarities.length - 1) onSeen()
  }

  return (
    <dialog
      open
      aria-label={`${card.name} upgraded`}
      className="inset-0 p-0 m-0 fixed z-50 size-full max-h-none max-w-none game-backdrop text-ink"
    >
      <div className="inset-0 md:p-8 pointer-events-none absolute">
        <GameStage
          shape="screen"
          className="md:max-w-md md:max-h-216 md:aspect-393/852 md:w-auto mx-auto size-full"
        >
          <GameMotes />
          {step > 0 &&
          !turning &&
          (rarity === "epic" || rarity === "legendary") ? (
            <Celebration key={rarity} rarity={rarity} />
          ) : null}
        </GameStage>
      </div>
      <UpgradingCard
        ref={cardRef}
        card={card}
        rarities={rarities}
        onReady={() => setReady(true)}
      />
      {/* The whole screen climbs the card: tap for its next rarity. */}
      <button
        type="button"
        aria-label={top ? "Next" : `Upgrade to ${rarities[step + 1]}`}
        className="inset-0 absolute cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={() => void climbOnce()}
      />
      <header className="inset-x-0 top-0 px-5 pt-6 md:pt-12 pointer-events-none absolute flex flex-col items-center game-safe-top text-center">
        <p className="text-sm font-bold tracking-wide text-ink/60 uppercase">
          {count.of > 1 ? `Upgrade ${count.at} of ${count.of}` : "Upgrade"}
        </p>
        <h2 className="mt-1 text-3xl font-black tracking-tighter font-heading">
          {top && step > 0 ? "Rarity up!" : "Your card is evolving"}
        </h2>
        <div className="mt-3 gap-2 flex items-center" aria-live="polite">
          {rarities.slice(0, step + 1).map((reached, at) => (
            <span key={reached} className="gap-2 flex items-center">
              {at > 0 ? (
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              ) : null}
              <RarityBadge rarity={reached} />
            </span>
          ))}
        </div>
      </header>
      <footer className="inset-x-0 bottom-0 pb-8 md:pb-12 gap-4 pointer-events-none absolute flex flex-col items-center">
        <p
          data-shown={(ready && !turning) || undefined}
          className="text-sm font-semibold text-ink/70 opacity-0 transition-opacity duration-300 data-shown:opacity-100"
        >
          {top ? "Tap to continue" : "Tap to upgrade"}
        </p>
        {count.of > count.at ? (
          <Button
            variant="game"
            className="pointer-events-auto"
            onClick={onSkip}
          >
            Skip all
          </Button>
        ) : null}
      </footer>
    </dialog>
  )
}
