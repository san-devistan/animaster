import { withPhoto } from "@/game/_lib/photos"
import { convexQuery } from "@convex-dev/react-query"
import { useQuery } from "@tanstack/react-query"
import { api } from "@workspace/backend/api"
import type { FunctionReturnType } from "convex/server"
import { useMemo } from "react"

export type CollectedCard = FunctionReturnType<
  typeof api.packs.collection
>[number]

// The signed-in player's cards; null while loading.
export function useCollectedCards() {
  const { data } = useQuery(convexQuery(api.packs.collection, {}))
  return useMemo(() => data?.map(withPhoto) ?? null, [data])
}
