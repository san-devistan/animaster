import { GameLayout } from "@/game/_components/game-layout"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_game")({
  // WebGL, WebGPU and Web Audio are browser-only.
  ssr: false,
  component: GameLayout,
})
