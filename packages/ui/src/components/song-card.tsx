"use client"

import { CountBadge } from "@workspace/ui/components/count-badge"
import {
  mountCardScene,
  type CardScene,
  type CardSceneOptions,
  type CardSlot,
} from "@workspace/ui/lib/game/card-scene"
import {
  cardThumbSlot,
  mountCardThumb,
} from "@workspace/ui/lib/game/card-thumbs"
import type { GameSong } from "@workspace/ui/lib/game/theme"
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
type SongCardHandle = Pick<CardScene, "flyBack">

type SongCardProps = {
  song: GameSong
  mirror?: boolean
  reveal?: boolean
  // Fly in from this on-screen slot (see songCardThumbSlot) instead.
  from?: CardSlot
  // Where a flown-in card lands, relative to the canvas middle.
  land?: CardSceneOptions["land"]
  // Called once the card is drawn where it starts.
  onReady?: () => void
  ref?: Ref<SongCardHandle>
  className?: string
}

// A three.js song card: printed film on rarity foil.
function SongCard({
  song,
  mirror = true,
  reveal = false,
  from,
  land,
  onReady,
  ref,
  className,
}: SongCardProps) {
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
    const scene = mountCardScene(canvas, song, {
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
  }, [song, mirror, reveal])

  return (
    <canvas
      ref={canvasRef}
      data-slot="song-card"
      className={cn("game-canvas touch-none select-none", className)}
      aria-label={`${song.title} by ${song.artist}, ${song.rarity} card`}
    />
  )
}

// Grid card rendered by the same 3D card pipeline, from one shared context;
// its light follows the page scroll. Keyed so a new card starts unpainted.
function SongCardThumb(props: SongCardThumbProps) {
  return <LiveThumb key={props.song.id} {...props} />
}

type SongCardThumbProps = {
  song: GameSong
  // Copies held; two or more show a count badge on the corner.
  copies?: number
  // While a big SongCard stands in for it, e.g. mid-flight.
  away?: boolean
}

function LiveThumb({ song, copies = 1, away = false }: SongCardThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    return mountCardThumb(canvas, song, () => setDrawn(true))
  }, [song])

  return (
    <span
      data-slot="song-card-thumb"
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

// Where a thumb inside `element` shows its card, for a SongCard to fly from.
function songCardThumbSlot(element: Element | null) {
  const canvas = element?.querySelector("[data-slot=song-card-thumb] canvas")
  return canvas instanceof HTMLCanvasElement ? cardThumbSlot(canvas) : null
}

export {
  SongCard,
  SongCardThumb,
  songCardThumbSlot,
  type SongCardHandle,
  type SongCardProps,
}
