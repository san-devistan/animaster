"use client"

import type { Tilt } from "@workspace/ui/hooks/use-tilt"
import {
  shaderPreset,
  type ShaderName,
} from "@workspace/ui/lib/game/shader-presets"
import { useEffect, useRef, useState } from "react"
import type { ShaderInstance } from "shaders/js"

async function mountShader(canvas: HTMLCanvasElement, name: ShaderName) {
  const { createShader } = await import("shaders/js")
  return createShader(
    canvas,
    { components: shaderPreset(name) },
    { disableTelemetry: true, onError: () => canvas.remove() }
  )
}

// WebGPU shader layer. CSS gradients on the parent remain the fallback.
function GameFx({ name, tilt }: { name: ShaderName; tilt?: Tilt }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [instance, setInstance] = useState<ShaderInstance | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    let mounted: ShaderInstance | null = null
    let disposed = false

    async function start(target: HTMLCanvasElement) {
      try {
        const created = await mountShader(target, name)
        if (disposed) {
          created.destroy()
          return
        }
        mounted = created
        setInstance(created)
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setTimeout(() => created.pause(), 600)
        }
      } catch {
        target.remove()
      }
    }
    void start(canvas)

    return () => {
      disposed = true
      mounted?.destroy()
      setInstance(null)
    }
  }, [name])

  const x = tilt?.x ?? 0
  const y = tilt?.y ?? 0
  useEffect(() => {
    if (!instance || name === "studio") return
    instance.update("holo", { hueShift: ((x - y) * 240 + 360) % 360 })
    if (name !== "back") {
      const shift = { x: -x * 0.4, y: -y * 0.4 }
      instance.update("sheen", {
        start: shift,
        end: { x: 1 + shift.x, y: 1 + shift.y },
      })
    }
  }, [instance, name, x, y])

  return <canvas ref={canvasRef} className="game-fx" aria-hidden="true" />
}

export { GameFx }
