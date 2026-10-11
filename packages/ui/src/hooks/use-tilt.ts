import type { CssVars } from "@workspace/ui/lib/game/theme"
import { useState, type PointerEvent } from "react"

export type Tilt = { x: number; y: number }

const REST: Tilt = { x: 0, y: 0 }

function tiltStyle(tilt: Tilt | null): CssVars {
  if (!tilt) return {}
  return {
    "--rx": `${-tilt.y * 22}deg`,
    "--ry": `${tilt.x * 26}deg`,
    "--gx": `${(tilt.x + 0.5) * 100}%`,
    "--gy": `${(tilt.y + 0.5) * 100}%`,
  }
}

export function useTilt() {
  const [tilt, setTilt] = useState<Tilt | null>(null)

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (event.buttons) return
    const box = event.currentTarget.getBoundingClientRect()
    setTilt({
      x: (event.clientX - box.left) / box.width - 0.5,
      y: (event.clientY - box.top) / box.height - 0.5,
    })
  }

  return {
    tilt: tilt ?? REST,
    isTilting: tilt !== null,
    tiltProps: {
      onPointerMove,
      onPointerLeave: () => setTilt(null),
      style: tiltStyle(tilt),
    },
  }
}
