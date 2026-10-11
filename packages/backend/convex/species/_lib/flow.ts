import { Effect } from "effect"

import { acceptedLivingAnimal, fetchTaxonInfo, taxonomy } from "./col"
import { addSummaries, fetchCandidates, toSpecies } from "./wikimedia"

// Catalogue of Life drops many famous subspecies as synonyms or extinct
// (Siberian tiger, Asiatic lion, Bali tiger), so fetch extra candidates.
const candidatesPerCard = 5

// 1. Wikidata: best-known subspecies with a COL ID, image and article.
// 2. Catalogue of Life: keep accepted, living animals; use its name and taxonomy.
// 3. Wikipedia: two-sentence summary.
export const fetchSubspecies = Effect.fn("fetchSubspecies")(function* (
  limit: number
) {
  const candidates = yield* fetchCandidates(limit * candidatesPerCard)
  const kept = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    if (kept.length >= limit) {
      break
    }
    const base = toSpecies(candidate)
    const info = yield* fetchTaxonInfo(base.colId, base.scientificName)
    if (!info || !acceptedLivingAnimal(info) || seen.has(info.usage.id)) {
      continue
    }
    seen.add(info.usage.id)
    kept.push({
      ...base,
      colId: info.usage.id,
      scientificName: info.usage.name.scientificName,
      authorship: info.usage.name.authorship ?? null,
      rank: info.usage.name.rank,
      taxonomy: taxonomy(info),
    })
  }

  return yield* addSummaries(kept)
})
