"use client"

import {
  slashPath,
  type Slash,
  type StrokePoint,
} from "@workspace/ui/lib/game/cut-slash"
import type { CssVars } from "@workspace/ui/lib/game/theme"
import {
  useId,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent,
} from "react"

// Records the finger's stroke across the cut and turns it into the slash it
// leaves once the cut goes through. `stage` goes on the element the slash is
// drawn over; `guide` on the cut guide, for a slash straight along it when
// there's no stroke.
function useCutSlash() {
  const strokeRef = useRef<Array<StrokePoint>>([])
  const stage = useRef<HTMLDivElement>(null)
  const guide = useRef<HTMLDivElement>(null)
  const [slash, setSlash] = useState<Slash | null>(null)

  // Notes the finger on the stage, as it may wander off the cut line; `fresh`
  // starts a new stroke.
  function trace(event: PointerEvent, fresh = false) {
    if (fresh) strokeRef.current = []
    const box = stage.current?.getBoundingClientRect()
    if (!box) return
    // Coalesced events keep a quick flick's curve, not just its ends.
    const moves = event.nativeEvent.getCoalescedEvents?.() ?? []
    for (const move of moves.length ? moves : [event]) {
      strokeRef.current.push([move.clientX - box.left, move.clientY - box.top])
    }
  }

  // Slashes along the stroke; with none (cut from the keyboard), straight
  // along the guide.
  function finish() {
    const box = stage.current?.getBoundingClientRect()
    const line = guide.current?.getBoundingClientRect()
    const stroke: Array<StrokePoint> =
      strokeRef.current.length || !box || !line
        ? strokeRef.current
        : [line.left, line.right].map((x) => [
            x - box.left,
            line.top + line.height / 2 - box.top,
          ])
    setSlash(box ? slashPath(stroke, box.width, box.height) : null)
    strokeRef.current = []
  }

  function clear() {
    strokeRef.current = []
  }

  return { slash, stage, guide, trace, finish, clear }
}

// The strip a finger drags along to cut the pack, and a button that cuts it
// for screen readers and keyboards.
function CutGuide({
  onCut,
  ...props
}: ComponentProps<"div"> & { onCut: () => void }) {
  return (
    <>
      <div
        className="game-cut-guide h-14 absolute z-20 cursor-grab active:cursor-grabbing"
        aria-hidden="true"
        {...props}
      />
      <button type="button" className="sr-only" onClick={onCut}>
        Cut pack open
      </button>
    </>
  )
}

// The katana slice along the finger's stroke: a blade of light whipping along
// it past both edges, leaving a hairline that flares and fades, with a glint
// where the finger let go (game.css).
function CutSlash({ slash }: { slash: Slash }) {
  const holo = useId()
  const [x, y] = slash.release
  const glint: CssVars = {
    "--glint-x": `${x}px`,
    "--glint-y": `${y}px`,
    "--glint-angle": `${slash.angle}deg`,
  }
  return (
    <div className="game-cut-flash" aria-hidden="true">
      <svg>
        <defs>
          {/* The holo band shades from where the slash came in to where it left. */}
          <linearGradient
            id={holo}
            gradientUnits="userSpaceOnUse"
            x1={slash.start[0]}
            y1={slash.start[1]}
            x2={slash.end[0]}
            y2={slash.end[1]}
          >
            <stop offset="0" />
            <stop offset="0.25" />
            <stop offset="0.5" />
            <stop offset="0.75" />
            <stop offset="1" />
          </linearGradient>
        </defs>
        <path
          className="game-cut-glow"
          d={slash.d}
          pathLength={1}
          stroke={`url(#${holo})`}
        />
        <path className="game-cut-line" d={slash.d} pathLength={1} />
        <path className="game-cut-blade" d={slash.d} pathLength={1} />
      </svg>
      <i style={glint} />
    </div>
  )
}

export { CutGuide, CutSlash, useCutSlash }
