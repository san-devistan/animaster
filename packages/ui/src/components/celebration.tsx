import {
  CELEBRATION,
  type Celebrated,
} from "@workspace/ui/lib/game/reveal-motion"
import type { CssVars } from "@workspace/ui/lib/game/theme"

const SPARKS = Array.from({ length: 14 }, (_, spark) => {
  const angle = (spark / 14) * Math.PI * 2 + 0.3
  const reach = 150 + (spark % 4) * 28
  const vars: CssVars = {
    "--spark-x": `${Math.cos(angle) * reach}px`,
    "--spark-y": `${Math.sin(angle) * reach}px`,
    "--spark-delay": `${(spark % 5) * 0.035}s`,
  }
  return { id: `spark-${String(spark)}`, vars }
})

// First-pull light show. Remount it with a new key to replay.
function Celebration({ rarity }: { rarity: Celebrated }) {
  const vars: CssVars = { "--celebration": `${CELEBRATION[rarity]}s` }
  return (
    <div
      className="game-celebration"
      data-rarity={rarity}
      aria-hidden="true"
      style={vars}
    >
      <i className="game-celebration-light" />
      <i className="game-celebration-ring" />
      <i className="game-celebration-ring" />
      {SPARKS.map((spark) => (
        <i
          key={spark.id}
          className="game-celebration-spark"
          style={spark.vars}
        />
      ))}
    </div>
  )
}

export { Celebration }
