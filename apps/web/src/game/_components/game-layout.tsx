import { Link, Outlet } from "@tanstack/react-router"
import {
  GameShell,
  GameTab,
  GameTabBar,
} from "@workspace/ui/components/game-shell"
import { BoxIcon, LayersIcon, UserIcon } from "lucide-react"

const TABS = [
  { to: "/", label: "Packs", Icon: BoxIcon },
  { to: "/collection", label: "Collection", Icon: LayersIcon },
  { to: "/profile", label: "Profile", Icon: UserIcon },
] as const

export function GameLayout() {
  return (
    <GameShell>
      <Outlet />
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
