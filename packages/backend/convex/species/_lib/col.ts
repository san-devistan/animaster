// Catalogue of Life (COL) client.
import { Effect, Schedule, Schema } from "effect"

// Catalogue of Life's public API (ChecklistBank); 3LR is the latest release.
const baseUrl = "https://api.checklistbank.org/dataset/3LR"

export class CatalogueOfLifeError extends Schema.TaggedError<CatalogueOfLifeError>()(
  "CatalogueOfLifeError",
  { message: Schema.String }
) {}

const Rank = Schema.Struct({ rank: Schema.String, name: Schema.String })

const TaxonInfo = Schema.Struct({
  usage: Schema.Struct({
    id: Schema.String,
    status: Schema.String,
    extinct: Schema.optional(Schema.Boolean),
    name: Schema.Struct({
      scientificName: Schema.String,
      rank: Schema.String,
      authorship: Schema.optional(Schema.String),
    }),
  }),
  classification: Schema.optional(Schema.Array(Rank)),
  vernacularNames: Schema.optional(
    Schema.Array(
      Schema.Struct({
        name: Schema.String,
        language: Schema.optional(Schema.String),
      })
    )
  ),
})
export type TaxonInfo = typeof TaxonInfo.Type

// Valid only when Catalogue of Life accepts the name, it is not marked
// extinct, and it sits under Animalia. Synonyms (outdated names) are dropped.
export function acceptedLivingAnimal(info: TaxonInfo) {
  return (
    info.usage.status === "accepted" &&
    info.usage.extinct !== true &&
    (info.classification ?? []).some(
      (rank) => rank.rank === "kingdom" && rank.name === "Animalia"
    )
  )
}

export function taxonomy(info: TaxonInfo) {
  const byRank = new Map(
    (info.classification ?? []).map((rank) => [rank.rank, rank.name])
  )
  return {
    class: byRank.get("class") ?? null,
    order: byRank.get("order") ?? null,
    family: byRank.get("family") ?? null,
    species: byRank.get("species") ?? null,
  }
}

export function englishName(info: TaxonInfo) {
  return (
    info.vernacularNames?.find((name) => name.language === "eng")?.name ?? null
  )
}

const Search = Schema.Struct({
  result: Schema.optional(Schema.Array(Schema.Struct({ id: Schema.String }))),
})

// 404 resolves to null; other failures retry.
const getJson = Effect.fn("colGet")(function* <S extends Schema.Top>(
  path: string,
  schema: S
) {
  const body = yield* Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(`${baseUrl}${path}`, {
        signal,
        headers: { Accept: "application/json" },
      })
      if (response.status === 404) {
        return null
      }
      if (!response.ok) {
        throw new Error(`${response.status} on Catalogue of Life ${path}`)
      }
      return (await response.json()) as unknown
    },
    catch: (error) =>
      new CatalogueOfLifeError({
        message: error instanceof Error ? error.message : String(error),
      }),
  }).pipe(
    Effect.timeout("30 seconds"),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail(
        new CatalogueOfLifeError({ message: "Catalogue of Life timed out" })
      )
    ),
    Effect.retry({ times: 3, schedule: Schedule.exponential("1 second") })
  )
  if (body === null) {
    return null
  }
  return yield* Schema.decodeUnknownEffect(schema)(body).pipe(
    Effect.mapError(
      (error) => new CatalogueOfLifeError({ message: error.message })
    )
  )
})

// Wikidata can hold a stale ID from an older release; fall back to an exact
// accepted-name search in the current one.
export const fetchTaxonInfo = Effect.fn("fetchTaxonInfo")(function* (
  colId: string,
  scientificName: string
) {
  const byId = yield* getJson(
    `/taxon/${encodeURIComponent(colId)}/info`,
    TaxonInfo
  )
  if (byId) {
    return byId
  }

  const params = new URLSearchParams({
    q: scientificName,
    content: "SCIENTIFIC_NAME",
    type: "EXACT",
    status: "accepted",
    limit: "2",
  })
  const found = yield* getJson(`/nameusage/search?${params}`, Search)
  const match = found?.result?.length === 1 ? found.result[0] : undefined
  return match
    ? yield* getJson(`/taxon/${encodeURIComponent(match.id)}/info`, TaxonInfo)
    : null
})
