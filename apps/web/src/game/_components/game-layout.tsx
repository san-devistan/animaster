import { CardUpgrades } from "@/game/_components/card-upgrades"
import { withPhoto } from "@/game/_lib/photos"
import { authClient } from "@/lib/auth-client"
import { convexQuery } from "@convex-dev/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { Link, Outlet } from "@tanstack/react-router"
import { api } from "@workspace/backend/api"
import {
  GameShell,
  GameTab,
  GameTabBar,
} from "@workspace/ui/components/game-shell"
import { warmCardThumbs } from "@workspace/ui/lib/game/card-thumbs"
import { BoxIcon, LayersIcon, UserIcon } from "lucide-react"
import { useEffect, useRef } from "react"

const TABS = [
  { to: "/", label: "Packs", Icon: BoxIcon },
  { to: "/collection", label: "Collection", Icon: LayersIcon },
  { to: "/profile", label: "Profile", Icon: UserIcon },
] as const
// About a phone screen of the collection: its newest cards, which it opens on.
const WARM_CARDS = 8

export function GameLayout() {
  const ready = useGuestSession()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!ready) return
    // The collection subscribes up front and its first cards are built in idle
    // time, so its tab opens on drawn cards, not a wait.
    queryClient
      .query(convexQuery(api.packs.collection, {}))
      .then((cards) =>
        warmCardThumbs(
          // In the grid's "recent" order: newest pull first, a pack's last saved first.
          cards
            .toReversed()
            .toSorted((a, b) => b.pulledAt - a.pulledAt)
            .slice(0, WARM_CARDS)
            .map(withPhoto)
        )
      )
      .catch(() => undefined)
  }, [ready, queryClient])

  return (
    <GameShell>
      {ready ? <Outlet /> : <div className="min-h-0 flex-1" />}
      {ready ? <CardUpgrades /> : null}
      <GameTabBar aria-label="Main">
        {TABS.map(({ to, label, Icon }) => (
          <GameTab
            key={to}
            // Query params (like the collection's `added`) don't change the tab.
            render={
              <Link
                to={to}
                activeOptions={{ exact: true, includeSearch: false }}
              />
            }
            aria-label={label}
          >
            <Icon aria-hidden="true" />
          </GameTab>
        ))}
      </GameTabBar>
    </GameShell>
  )
}

// Everyone plays as an anonymous guest for now: a visitor without a session
// gets one on arrival. True once it exists.
function useGuestSession() {
  const { data: session, isPending } = authClient.useSession()
  const requested = useRef(false)

  useEffect(() => {
    if (isPending || session || requested.current) return
    requested.current = true
    async function signIn() {
      const { error } = await authClient.signIn.anonymous()
      // Let a later render retry, after a network error say.
      if (error) requested.current = false
    }
    void signIn()
  }, [isPending, session])

  return Boolean(session)
}
