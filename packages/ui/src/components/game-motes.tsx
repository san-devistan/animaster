import type { CssVars } from "@workspace/ui/lib/game/theme"
import { cn } from "@workspace/ui/lib/utils"

const MOTES = Array.from({ length: 10 }, (_, mote) => {
  const vars: CssVars = {
    "--mote-x": `${8 + ((mote * 37) % 84)}%`,
    "--mote-y": `${6 + ((mote * 23) % 36)}%`,
    "--mote-delay": `${-(mote * 0.73) % 4}s`,
    "--mote-size": `${3 + (mote % 3)}px`,
  }
  return { id: `mote-${String(mote)}`, vars }
})

// Glowing motes drifting in the stage's upper sky, behind a pack or a card.
// With `shown`, they fade in and out with it.
function GameMotes({ shown }: { shown?: boolean }) {
  return (
    <div
      className={cn(
        "game-pack-motes",
        shown !== undefined && "transition-opacity duration-500",
        shown === false && "opacity-0"
      )}
      aria-hidden="true"
    >
      {MOTES.map((mote) => (
        <i key={mote.id} style={mote.vars} />
      ))}
    </div>
  )
}

export { GameMotes }
