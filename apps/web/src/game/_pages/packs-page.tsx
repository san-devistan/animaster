import { useRevealMusic } from "@/game/_hooks/use-reveal-music"
import { DEMO_PACK, PACK_COVERS } from "@/game/_lib/demo-data"
import { useNavigate } from "@tanstack/react-router"
import { PackOpening } from "@workspace/ui/components/pack-opening"
import { useState } from "react"

// Rarest last, so the reveal builds up like a real pack.
const PULLS = DEMO_PACK.toSorted((a, b) => b.rank - a.rank)
// The pack flies in only the first time the page loads; coming back to the
// tab later, it's already waiting. Module state, so a full reload replays it.
let arrived = false

export function PacksPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const music = useRevealMusic()
  // Read once, then marked, so this visit keeps its entrance.
  const [entrance] = useState(() => {
    const first = !arrived
    arrived = true
    return first
  })

  return (
    <div
      data-immersive={open || undefined}
      className="min-h-0 relative flex flex-1 justify-center"
    >
      <PackOpening
        pulls={PULLS}
        covers={PACK_COVERS}
        entrance={entrance}
        onOpenChange={(next) => {
          // The tap that opens the pack lets the previews play later.
          if (next) music.unlock()
          setOpen(next)
        }}
        onCard={(pull, revealed) => {
          if (pull) void music.play(pull.id, revealed)
          else music.stop()
        }}
        onDone={() =>
          void navigate({
            to: "/collection",
            // Only cards the player didn't have, newest (last revealed) first.
            search: {
              added: PULLS.filter((pull) => pull.isNew)
                .map((pull) => pull.id)
                .toReversed(),
            },
          })
        }
      />
      <header className="inset-x-0 top-0 max-w-6xl px-4 sm:px-6 md:px-8 md:pt-8 in-data-immersive:-translate-y-4 pointer-events-none absolute z-30 mx-auto game-safe-top transition duration-300 in-data-immersive:opacity-0">
        <h1 className="text-4xl font-black md:text-6xl tracking-tighter font-heading">
          Packs
        </h1>
      </header>
    </div>
  )
}
