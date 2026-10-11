import { Effect, Schedule, Schema } from "effect"

// Wikimedia asks every client for a User-Agent with contact info.
const userAgent = "musi-master/0.1 (lcombaret@protonmail.com)"
// QLever mirrors Wikidata and answers animal-tree queries in seconds;
// query.wikidata.org times out on the same queries.
const sparqlUrl = "https://qlever.dev/api/wikidata"
const wikipediaApi = "https://en.wikipedia.org/w/api.php"
// The extracts API returns at most 20 intros per call.
const extractBatch = 20

export class WikimediaError extends Schema.TaggedError<WikimediaError>()(
  "WikimediaError",
  { message: Schema.String }
) {}

const Cell = Schema.Struct({ value: Schema.String })
const SparqlResults = Schema.Struct({
  results: Schema.Struct({
    bindings: Schema.Array(
      Schema.Struct({
        item: Cell,
        col: Cell,
        scientificName: Cell,
        image: Cell,
        article: Cell,
        sitelinkCount: Cell,
      })
    ),
  }),
})
export type Candidate =
  (typeof SparqlResults.Type)["results"]["bindings"][number]

const Extracts = Schema.Struct({
  query: Schema.Struct({
    pages: Schema.Array(
      Schema.Struct({
        title: Schema.String,
        extract: Schema.optional(Schema.String),
      })
    ),
    normalized: Schema.optional(
      Schema.Array(Schema.Struct({ from: Schema.String, to: Schema.String }))
    ),
  }),
})

// Animal subspecies (Bengal tiger, not tiger) with a Catalogue of Life ID, a
// Commons image and an English article, most Wikipedia editions first.
// Catalogue of Life then decides which ones are valid, living taxa.
function candidatesQuery(limit: number) {
  return `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>
SELECT ?item (SAMPLE(?colId) AS ?col) (SAMPLE(?taxonName) AS ?scientificName) (SAMPLE(?img) AS ?image) (SAMPLE(?enArticle) AS ?article) (MAX(?links) AS ?sitelinkCount) WHERE {
  ?item wdt:P105 wd:Q68947 ; wdt:P171+ wd:Q729 ; wdt:P10585 ?colId ; wdt:P18 ?img ; wdt:P225 ?taxonName ; wikibase:sitelinks ?links .
  ?enArticle schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
}
GROUP BY ?item
ORDER BY DESC(?sitelinkCount) ?item
LIMIT ${limit}`
}

const getJson = Effect.fn("wikimediaGet")(function* <S extends Schema.Top>(
  url: string,
  schema: S
) {
  const body = yield* Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, {
        signal,
        headers: { Accept: "application/json", "User-Agent": userAgent },
      })
      if (!response.ok) {
        throw new Error(`${response.status} on ${new URL(url).host}`)
      }
      return (await response.json()) as unknown
    },
    catch: (error) =>
      new WikimediaError({
        message: error instanceof Error ? error.message : String(error),
      }),
  }).pipe(
    Effect.timeout("90 seconds"),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail(new WikimediaError({ message: "Wikimedia timed out" }))
    ),
    Effect.retry({ times: 3, schedule: Schedule.exponential("2 seconds") })
  )

  return yield* Schema.decodeUnknownEffect(schema)(body).pipe(
    Effect.mapError((error) => new WikimediaError({ message: error.message }))
  )
})

// "http://commons.wikimedia.org/wiki/Special:FilePath/Lion%20pride.jpg" -> "Lion pride.jpg"
export function commonsFile(filePathUrl: string) {
  return decodeURIComponent(filePathUrl.split("/Special:FilePath/")[1] ?? "")
}

// "https://en.wikipedia.org/wiki/Red_fox" -> "Red fox"
export function articleTitle(articleUrl: string) {
  return decodeURIComponent(articleUrl.split("/wiki/")[1] ?? "").replaceAll(
    "_",
    " "
  )
}

export function toSpecies(row: Candidate) {
  const imageFile = commonsFile(row.image.value)
  return {
    colId: row.col.value,
    wikidataId: row.item.value.split("/").pop() ?? row.item.value,
    scientificName: row.scientificName.value,
    name: articleTitle(row.article.value),
    imageFile,
    // Commons serves a resized PNG/JPEG thumbnail (SVGs included).
    imageUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageFile)}?width=960`,
    wikipediaUrl: row.article.value,
    sitelinks: Number(row.sitelinkCount.value),
  }
}

const fetchSummaries = Effect.fn("fetchSummaries")(function* (
  titles: ReadonlyArray<string>
) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    exsentences: "2",
    exlimit: String(extractBatch),
    titles: titles.join("|"),
  })
  const { query } = yield* getJson(`${wikipediaApi}?${params}`, Extracts)
  const byTitle = new Map(
    query.pages.map((page) => [page.title, page.extract || null])
  )
  for (const { from, to } of query.normalized ?? []) {
    byTitle.set(from, byTitle.get(to) ?? null)
  }
  return byTitle
})

export const fetchCandidates = Effect.fn("fetchCandidates")(function* (
  limit: number
) {
  const params = new URLSearchParams({ query: candidatesQuery(limit) })
  const { results } = yield* getJson(`${sparqlUrl}?${params}`, SparqlResults)
  return results.bindings
})

export const addSummaries = Effect.fn("addSummaries")(function* <
  T extends { name: string },
>(species: ReadonlyArray<T>) {
  const summaries = new Map<string, string | null>()
  for (let start = 0; start < species.length; start += extractBatch) {
    const batch = yield* fetchSummaries(
      species.slice(start, start + extractBatch).map((animal) => animal.name)
    )
    batch.forEach((summary, title) => summaries.set(title, summary))
  }

  return species.map((animal) => ({
    ...animal,
    summary: summaries.get(animal.name) ?? null,
  }))
})
