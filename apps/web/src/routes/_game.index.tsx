import { PacksPage } from "@/game/_pages/packs-page"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_game/")({ component: PacksPage })
