"use client"

import { CountBadge } from "@workspace/ui/components/count-badge"
import {
  mountCardScene,
  mountUpgradeScene,
  type CardScene,
  type CardSceneOptions,
  type CardSlot,
  type UpgradeScene,
} from "@workspace/ui/lib/game/card-scene"
import {
  cardThumbSlot,
  mountCardThumb,
} from "@workspace/ui/lib/game/card-thumbs"
import type { GameCardData, Rarity } from "@workspace/ui/lib/game/theme"
import { cn } from "@workspace/ui/lib/utils"
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react"

// Sends a flown-in card back to a slot (re-measured each frame); resolves
// once it lands.
type GameCardHandle = Pick<CardScene, "flyBack">

type GameCardProps = {
  card: GameCardData
  mirror?: boolean
  reveal?: boolean
  // Fly in from this on-screen slot (see gameCardThumbSlot) instead.
  from?: CardSlot
  // Where a flown-in card lands, relative to the canvas middle.
  land?: CardSceneOptions["land"]
  // Called once the card is drawn where it starts.
  onReady?: () => void
  ref?: Ref<GameCardHandle>
  className?: string
}

// A three.js game card: printed film on rarity foil.
function GameCard({
  card,
  mirror = true,
  reveal = false,
  from,
  land,
  onReady,
  ref,
  className,
}: GameCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<CardScene | null>(null)
  // The slots only matter when the card mounts.
  const startRef = useRef({ from, land })
  const ready = useEffectEvent(() => onReady?.())

  useImperativeHandle(ref, () => ({
    flyBack: (to) => sceneRef.current?.flyBack(to) ?? Promise.resolve(),
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const scene = mountCardScene(canvas, card, {
      mirror,
      reveal,
      ...startRef.current,
    })
    sceneRef.current = scene
    let current = true
    void scene.ready.then(() => current && ready())
    return () => {
      current = false
      sceneRef.current = null
      scene.dispose()
    }
  }, [card, mirror, reveal])

  return (
    <canvas
      ref={canvasRef}
      data-slot="game-card"
      className={cn("game-canvas touch-none select-none", className)}
      aria-label={`${card.name}, ${card.subtitle}, ${card.rarity} card`}
    />
  )
}

// Grid card rendered by the same 3D card pipeline, from one shared context;
// its light follows the page scroll. Keyed so a new card starts unpainted.
function GameCardThumb(props: GameCardThumbProps) {
  return <LiveThumb key={props.card.id} {...props} />
}

type GameCardThumbProps = {
  card: GameCardData
  // Copies held; two or more show a count badge on the corner.
  copies?: number
  // While a big GameCard stands in for it, e.g. mid-flight.
  away?: boolean
}

function LiveThumb({ card, copies = 1, away = false }: GameCardThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    return mountCardThumb(canvas, card, () => setDrawn(true))
  }, [card])

  return (
    <span
      data-slot="game-card-thumb"
      data-away={away || undefined}
      className="group-hover/card:-translate-y-1 @container/thumb relative block aspect-5/7 w-full transition-transform group-active/card:scale-95 data-away:invisible"
    >
      {drawn ? null : (
        <span className="animate-pulse inset-0 absolute rounded-2xl bg-muted" />
      )}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="game-card-snapshot absolute max-w-none"
      />
      <CountBadge count={copies} size="card" />
    </span>
  )
}

// Where a thumb inside `element` shows its card, for a GameCard to fly from.
function gameCardThumbSlot(element: Element | null) {
  const canvas = element?.querySelector("[data-slot=game-card-thumb] canvas")
  return canvas instanceof HTMLCanvasElement ? cardThumbSlot(canvas) : null
}

// Turns the card up to its next rarity; resolves once it faces front again.
type UpgradingCardHandle = Pick<UpgradeScene, "step">

// A three.js card going up through `rarities`, the first shown on mount and
// one more per `step`.
function UpgradingCard({
  card,
  rarities,
  onReady,
  ref,
  className,
}: {
  card: GameCardData
  rarities: ReadonlyArray<Rarity>
  onReady?: () => void
  ref?: Ref<UpgradingCardHandle>
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<UpgradeScene | null>(null)
  const ready = useEffectEvent(() => onReady?.())

  useImperativeHandle(ref, () => ({
    step: () => sceneRef.current?.step() ?? Promise.resolve(),
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const scene = mountUpgradeScene(canvas, card, rarities)
    sceneRef.current = scene
    let current = true
    void scene.ready.then(() => current && ready())
    return () => {
      current = false
      sceneRef.current = null
      scene.dispose()
    }
  }, [card, rarities])

  return (
    <canvas
      ref={canvasRef}
      data-slot="upgrading-card"
      className={cn("game-canvas touch-none select-none", className)}
      aria-hidden="true"
    />
  )
}

export {
  GameCard,
  GameCardThumb,
  gameCardThumbSlot,
  UpgradingCard,
  type GameCardHandle,
  type GameCardProps,
  type UpgradingCardHandle,
}
