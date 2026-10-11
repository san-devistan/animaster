import { ProfilePage } from "@/game/_pages/profile-page"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_game/profile")({
  component: ProfilePage,
})
