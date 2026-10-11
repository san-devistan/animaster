import { CollectionPage } from "@/game/_pages/collection-page"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_game/collection")({
  // `added`: ids of cards just pulled that the player didn't have, newest
  // first. They wear a NEW badge until the player leaves the page.
  validateSearch: (
    search: Record<string, unknown>
  ): { added?: Array<string> } =>
    Array.isArray(search.added)
      ? {
          added: search.added.filter(
            (id): id is string => typeof id === "string"
          ),
        }
      : {},
  component: CollectionPage,
})
