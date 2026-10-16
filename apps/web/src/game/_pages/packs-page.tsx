import { photoUrl, withPhoto } from "@/game/_lib/photos"
import { convexQuery } from "@convex-dev/react-query"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { api } from "@workspace/backend/api"
import { PackOpening } from "@workspace/ui/components/pack-opening"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useEffect, useState } from "react"

// The pack flies in only the first time the page loads; coming back to the
// tab later, it's already waiting. Module state, so a full reload replays it.
let arrived = false

type Pull = FunctionReturnType<typeof api.packs.next>[number]

// The waiting pack, kept between visits so coming back to the tab shows it at
// once; the backend keeps it the same until it's opened.
let waiting: ReadonlyArray<Pull> | null = null
const packKey = (pulls: ReadonlyArray<Pull>) =>
  pulls.map((pull) => pull.id).join("|")

export function PacksPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const nextPack = useMutation(api.packs.next)
  const claimPack = useMutation(api.packs.claim)
  const { data: catalog } = useQuery(convexQuery(api.packs.catalog, {}))
  // Drawn ahead so its cards are ready once it's cut open.
  const [pulls, setPulls] = useState(waiting)
  // Read once, then marked, so this visit keeps its entrance.
  const [entrance] = useState(() => {
    const first = !arrived
    arrived = true
    return first
  })

  useEffect(() => {
    let cancelled = false
    async function draw() {
      const cards = await nextPack()
      if (cancelled) return
      const next = cards.map(withPhoto)
      // The same pack keeps its objects, so its scene isn't rebuilt.
      if (!waiting || packKey(waiting) !== packKey(next)) waiting = next
      setPulls(waiting)
    }
    void draw()
    return () => {
      cancelled = true
    }
  }, [nextPack])

  return (
    <div
      data-immersive={open || undefined}
      className="min-h-0 relative flex flex-1 justify-center"
    >
      {pulls && catalog ? (
        <PackOpening
          pulls={pulls}
          images={catalog.covers.map(photoUrl)}
          entrance={entrance}
          onOpenChange={(next) => {
            if (next) {
              // Owned from the moment it's opened, so leaving mid-reveal keeps
              // the cards. No longer the waiting pack: the next visit draws a new one.
              waiting = null
              void claimPack()
            }
            setOpen(next)
          }}
          onDone={() =>
            void navigate({
              to: "/collection",
              // Only cards the player didn't have, newest (last revealed) first.
              search: {
                added: pulls
                  .filter((pull) => pull.isNew)
                  .map((pull) => pull.id)
                  .toReversed(),
              },
            })
          }
        />
      ) : null}
      <header className="inset-x-0 top-0 max-w-6xl px-4 sm:px-6 md:px-8 md:pt-8 in-data-immersive:-translate-y-4 pointer-events-none absolute z-30 mx-auto game-safe-top transition duration-300 in-data-immersive:opacity-0">
        <h1 className="text-4xl font-black md:text-6xl tracking-tighter font-heading">
          Packs
        </h1>
      </header>
    </div>
  )
}
