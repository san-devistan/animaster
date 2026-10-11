"use client"

import { mountPackScene } from "@workspace/ui/lib/game/pack-scene"
import { cn } from "@workspace/ui/lib/utils"
import { useEffect, useRef } from "react"

// A three.js booster pack. Hover, or touch and drag, to turn it.
function BoosterPack({
  covers,
  className,
}: {
  covers: ReadonlyArray<string>
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const coverKey = covers.join("|")

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const unmount = mountPackScene(canvas, coverKey.split("|"))
    const drag = { x: 0, y: 0, moved: false }
    const onDown = (event: PointerEvent) => {
      Object.assign(drag, { x: event.clientX, y: event.clientY, moved: false })
    }
    const onMove = (event: PointerEvent) => {
      const distance = Math.hypot(
        event.clientX - drag.x,
        event.clientY - drag.y
      )
      if (event.buttons && distance > 8) drag.moved = true
    }
    // Turning the pack is not a tap: keep a wrapping link from firing.
    const onClick = (event: MouseEvent) => {
      if (drag.moved) event.preventDefault()
    }
    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("click", onClick)
    return () => {
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("click", onClick)
      unmount()
    }
  }, [coverKey])

  return (
    <canvas
      ref={canvasRef}
      data-slot="booster-pack"
      className={cn("game-canvas touch-none select-none", className)}
      aria-label="Billion Club booster pack, 5 song cards"
    />
  )
}

export { BoosterPack }
