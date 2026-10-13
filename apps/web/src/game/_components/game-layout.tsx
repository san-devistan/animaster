import { CardUpgrades } from "@/game/_components/card-upgrades"
import { authClient } from "@/lib/auth-client"
import { Link, Outlet } from "@tanstack/react-router"
import {
  GameShell,
  GameTab,
  GameTabBar,
} from "@workspace/ui/components/game-shell"
import { BoxIcon, LayersIcon, UserIcon } from "lucide-react"
import { useEffect, useRef } from "react"

const TABS = [
  { to: "/", label: "Packs", Icon: BoxIcon },
  { to: "/collection", label: "Collection", Icon: LayersIcon },
  { to: "/profile", label: "Profile", Icon: UserIcon },
] as const

export function GameLayout() {
  const ready = useGuestSession()
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
