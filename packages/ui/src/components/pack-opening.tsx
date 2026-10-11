"use client"

import { Celebration } from "@workspace/ui/components/celebration"
import {
  CutGuide,
  CutSlash,
  useCutSlash,
} from "@workspace/ui/components/cut-slash"
import { GameMotes } from "@workspace/ui/components/game-motes"
import { useReveal } from "@workspace/ui/hooks/use-reveal"
import {
  mountOpeningScene,
  OPENED,
  type OpeningPhase,
  type OpeningScene,
} from "@workspace/ui/lib/game/opening-scene"
import { REVEAL_PLAYED } from "@workspace/ui/lib/game/reveal-motion"
import { play, sfx } from "@workspace/ui/lib/game/sfx"
import type { GameSong } from "@workspace/ui/lib/game/theme"
import { cn } from "@workspace/ui/lib/utils"
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react"

const CUT_DONE = 0.7
// A card is swiped only by a flick: still moving sideways at FLICK px/ms or
// more over the last FLICK_WINDOW ms when let go, at least FLICK_MIN px from
// where it started. A slow or held drag just turns the pile, then lets it
// turn back.
const FLICK = 0.3
const FLICK_MIN = 40
const FLICK_WINDOW = 100
// Seconds after a swipe before the new card's reveal cue.
const REVEAL_AFTER = 0.2

type Phase = OpeningPhase | "cards"
export type PackPull = GameSong & { isNew?: boolean }

type Point = { x: number; y: number; at: number }
// Where a drag started, and its moves over the last FLICK_WINDOW ms.
type Drag = Point & { left: number; width: number; trail: Array<Point> }

// Notes a move, forgetting those older than FLICK_WINDOW.
function follow(drag: Drag, point: Point) {
  drag.trail.push(point)
  while ((drag.trail[0]?.at ?? point.at) < point.at - FLICK_WINDOW)
    drag.trail.shift()
}

// Which way a drag let go at `end` swipes the card: -1 or 1, or 0 when it
// doesn't, as it was slow, held still at the end, or mostly vertical.
function swipeSide(drag: Drag, end: Point) {
  follow(drag, end)
  const from = drag.trail[0] ?? end
  const dx = end.x - from.x
  const sideways = Math.abs(dx) > Math.abs(end.y - from.y)
  const speed = Math.abs(dx) / Math.max(end.at - from.at, 1)
  const travelled = (end.x - drag.x) * Math.sign(dx)
  const flicked = sideways && speed >= FLICK && travelled >= FLICK_MIN
  return flicked ? Math.sign(dx) : 0
}

// Seconds until `pull` is out, `delay` from now, and its reveal has played.
const revealedIn = (pull: PackPull | undefined, delay: number) =>
  pull && delay + REVEAL_PLAYED[pull.rarity]

type PackOpeningProps = {
  pulls: ReadonlyArray<PackPull>
  covers: ReadonlyArray<string>
  onDone: () => void
  // True once the pack is tapped open.
  onOpenChange?: (open: boolean) => void
  // The card coming on show, with the seconds until it's out and its reveal
  // has played; null when none is (pack left or reset). Called on the cut for
  // the first card, on its swipe in for the others.
  onCard?: (pull: PackPull | null, revealed?: number) => void
  // Fly the waiting pack in; false shows it straight away.
  entrance?: boolean
  className?: string
}

// The waiting pack, its cut, and the reveal of its cards, on one canvas.
function PackOpening({
  pulls,
  covers,
  onDone,
  onOpenChange,
  onCard,
  entrance = true,
  className,
}: PackOpeningProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<OpeningScene | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const cut = useCutSlash()
  // Where a press on the waiting pack started, so dragging it round to turn
  // it doesn't also open it.
  const pressRef = useRef<{ x: number; y: number } | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [index, setIndex] = useState(0)
  const { party, reveal, reset } = useReveal(pulls, sceneRef)
  const pullKey = pulls.map((pull) => pull.id).join("|")
  const coverKey = covers.join("|")
  // Latest callback, without remounting the scene when it changes.
  const announce = useEffectEvent((pull: PackPull | null) => onCard?.(pull))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    reset()
    setPhase("idle")
    setIndex(0)
    const scene = mountOpeningScene(
      canvas,
      pulls,
      coverKey.split("|"),
      () => {
        setPhase("cards")
        setIndex(0)
        reveal(0)
      },
      { entrance }
    )
    sceneRef.current = scene
    return () => {
      sceneRef.current = null
      announce(null)
      scene.dispose()
    }
    // pullKey is the stable identity of pulls.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [coverKey, pullKey, reset, reveal, entrance])

  function enter(next: Phase) {
    setPhase(next)
    if (next !== "cards") sceneRef.current?.setPhase(next)
  }

  function openPack(event: MouseEvent<HTMLButtonElement>) {
    const press = pressRef.current
    pressRef.current = null
    if (
      press &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8
    )
      return
    void sfx.unlock()
    play("press")
    enter("cut")
    onOpenChange?.(true)
  }

  function cutOpen() {
    dragRef.current = null
    cut.finish()
    sceneRef.current?.setCut(1)
    play("swipe")
    setTimeout(() => play("open"), 350)
    enter("open")
    onCard?.(pulls[0] ?? null, revealedIn(pulls[0], OPENED))
  }

  function cancelCut() {
    dragRef.current = null
    cut.clear()
    sceneRef.current?.setCut(0)
  }

  // A new stroke starts with each grab; only the cut keeps it.
  function grab(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    cut.trace(event, true)
    const { left, width } = event.currentTarget.getBoundingClientRect()
    const { clientX: x, clientY: y, timeStamp: at } = event
    dragRef.current = { x, y, at, left, width, trail: [{ x, y, at }] }
  }

  function cutAlong(event: PointerEvent<HTMLDivElement>) {
    const start = dragRef.current
    if (!start) return
    cut.trace(event)
    const done = Math.max(0, (event.clientX - start.x) / start.width)
    // The cut follows the finger itself along the seam.
    const under = (event.clientX - start.left) / start.width
    sceneRef.current?.setCut(Math.min(Math.max(under, 0), 0.99))
    if (done >= CUT_DONE) cutOpen()
  }

  function show(next: number, side = -1) {
    if (!pulls[next]) return
    setIndex(next)
    sceneRef.current?.show(next, side)
    play("swipe")
    onCard?.(pulls[next] ?? null, revealedIn(pulls[next], REVEAL_AFTER))
    setTimeout(() => reveal(next), REVEAL_AFTER * 1000)
  }

  // The last card flies off like the others, then the pack is done. Moving
  // past the last index also ignores any further swipes meanwhile.
  function leave(side = -1) {
    setIndex(pulls.length)
    sceneRef.current?.show(pulls.length, side)
    play("swipe")
    onCard?.(null)
    setTimeout(onDone, 450)
  }

  function swipeMove(event: PointerEvent<HTMLDivElement>) {
    const start = dragRef.current
    if (!start) return
    const { clientX: x, clientY: y, timeStamp: at } = event
    follow(start, { x, y, at })
    sceneRef.current?.drag((x - start.x) / start.width)
  }

  function swipeEnd(event: PointerEvent<HTMLDivElement>) {
    const start = dragRef.current
    if (!start) return
    dragRef.current = null
    const { clientX: x, clientY: y, timeStamp: at } = event
    const side = swipeSide(start, { x, y, at })
    sceneRef.current?.drag(0)
    if (!side) return
    if (isLast) leave(side)
    else show(index + 1, side)
  }

  const song = pulls[index]
  const isLast = index === pulls.length - 1

  return (
    <div
      ref={cut.stage}
      data-slot="pack-opening"
      data-phase={phase}
      className={cn(
        // Full screen on phones (their shape varies); a phone-shaped frame on
        // bigger screens. The scene fits itself to either.
        "game-studio md:aspect-393/852 md:game-opening-size size-full touch-none select-none",
        className
      )}
    >
      {phase === "idle" || phase === "cut" ? <GameMotes /> : null}
      <canvas ref={canvasRef} className="game-canvas z-10" aria-hidden="true" />
      {phase === "open" && cut.slash ? <CutSlash slash={cut.slash} /> : null}
      {phase === "cards" && party?.index === index ? (
        <Celebration key={party.key} rarity={party.rarity} />
      ) : null}

      {phase === "idle" ? (
        <button
          type="button"
          aria-label="Open pack"
          className="inset-0 absolute z-20 rounded-4xl outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-inset"
          onPointerDown={(event) => {
            pressRef.current = { x: event.clientX, y: event.clientY }
          }}
          onClick={openPack}
        />
      ) : null}

      {phase === "cut" ? (
        <CutGuide
          ref={cut.guide}
          onPointerDown={grab}
          onPointerMove={cutAlong}
          onPointerUp={cancelCut}
          onPointerCancel={cancelCut}
          onCut={cutOpen}
        />
      ) : null}

      {phase === "cards" ? (
        <>
          <div
            className="inset-0 absolute z-20 cursor-grab"
            aria-hidden="true"
            onPointerDown={grab}
            onPointerMove={swipeMove}
            onPointerUp={swipeEnd}
            onPointerCancel={swipeEnd}
          />
          {/* Swiping drives the reveal; these stay for screen readers and keyboards. */}
          {song ? (
            <p className="sr-only" aria-live="polite">
              {song.rarity}, card {index + 1} of {pulls.length}
            </p>
          ) : null}
          <div className="sr-only">
            <button
              type="button"
              onClick={() => show(index - 1)}
              disabled={index === 0}
            >
              Previous card
            </button>
            <button
              type="button"
              onClick={isLast ? () => leave() : () => show(index + 1)}
            >
              {isLast ? "Add to collection" : "Next card"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

export { PackOpening }
