// Builds the species table from Catalogue of Life, the Paleobiology Database,
// Wikidata (breeds, links to English Wikipedia, Commons photos), English
// Wikipedia (names, URLs, main images, page views) and iNaturalist (fallback
// photos), then updates the dev Convex deployment in place: rows are matched
// by Wikidata id, so existing species keep their _id; new ones are added.
// One row per English Wikipedia article; animals without an article or a
// photo are left out.
//
// Usage: node --max-old-space-size=24000 scripts/taxa/import.mjs [--cache]
//   (no flag)  download every source again (5-6 hours)
//   --cache    reuse the downloaded sources (about 30 minutes)
// Both modes download any page-view month missing from the last 12.
// --family Canidae,Felidae limits the run to some families (for testing).
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  buildBreeds,
  buildCards,
  buildCol,
  commonsUrl,
  commonsFile,
  indexWikidata,
  matchWikidata,
  mergePbdb,
  wikipediaUrl,
} from "./merge.mjs"
import {
  CACHE,
  dropOldSources,
  inatRootIds,
  loadBreeds,
  loadColRows,
  loadInat,
  loadPageviews,
  loadPbdb,
  loadTitles,
  loadWikidata,
  startFreshSources,
} from "./sources.mjs"
import { loadArticles, loadImageCategories } from "./wikimedia.mjs"

const familyArg = process.argv.indexOf("--family")
const families =
  familyArg === -1 ? null : new Set(process.argv[familyArg + 1].split(","))
const inFamilies = (family) => !families || families.has(family)
const useCache = process.argv.includes("--cache")
if (!useCache) startFreshSources()

function attachInat(taxa, inatByName) {
  for (const taxon of taxa) {
    const match = inatByName.get(taxon.scientificName)
    if (!match || taxon.kind === "breed") continue
    taxon.inatId = match.id
    taxon.inatPhotoUrl = match.default_photo?.medium_url?.replace(
      "/medium.",
      "/large."
    )
  }
}

function attachWikidata(taxa, rows, synonyms) {
  const items = indexWikidata(rows)
  const oldNames = new Map()
  for (const [name, colId] of synonyms) {
    oldNames.set(colId, [...(oldNames.get(colId) ?? []), name])
  }
  for (const taxon of taxa) {
    if (taxon.kind === "breed") continue
    const match = matchWikidata(items, taxon, oldNames.get(taxon.colId))
    if (!match) continue
    const { item, article } = match
    taxon.wikidataId = item.item
    taxon.articleItem = article.item
    if (item.image) taxon.photo = { url: commonsUrl(item.image) }
  }
}

function toRow({ taxon, article, extinct, views, photoUrl }) {
  const row = {
    photoUrl,
    ids: {
      col: taxon.colId,
      pbdb: taxon.pbdbId,
      wikidata: taxon.wikidataId,
      inat: taxon.inatId,
    },
    names: { en: article, scientific: taxon.scientificName },
    wikipedia: { en: wikipediaUrl(article) },
    views,
    lineage: taxon.lineage,
    extinct,
  }
  return JSON.parse(JSON.stringify(row))
}

const convex = (...args) =>
  execFileSync(
    "pnpm",
    [
      "exec",
      "convex",
      ...args,
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
    ],
    {
      cwd: new URL("../../packages/backend", import.meta.url),
      maxBuffer: 64 * 1024 * 1024,
    }
  ).toString()

// Inserts new species and updates existing ones, 500 rows per call: each row
// costs about two reads, and a mutation may read 4,096 documents.
function syncSpecies(rows) {
  writeFileSync(
    join(CACHE, "species.jsonl"),
    rows.map((r) => JSON.stringify(r)).join("\n")
  )
  let inserted = 0
  let updated = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = JSON.stringify({ rows: rows.slice(i, i + 500) })
    const result = JSON.parse(convex("run", "species:upsert", batch))
    inserted += result.inserted
    updated += result.updated
    if ((i / 500) % 40 === 0) console.log(`Convex: ${i + 500}/${rows.length}`)
  }
  console.log(`Convex: ${inserted} new species, ${updated} updated`)
  return new Set(rows.map((row) => row.ids.wikidata))
}

// Species stored by an earlier run that this run did not produce (their
// article or photo is gone, or the rules changed). Listed, not deleted:
// game data may point at them.
function reportStale(kept) {
  const stale = []
  let cursor = null
  for (;;) {
    const page = JSON.parse(
      convex(
        "run",
        "species:wikidataIds",
        JSON.stringify({ paginationOpts: { numItems: 8000, cursor } })
      )
    )
    for (const id of page.page) if (!kept.has(id)) stale.push(id)
    if (page.isDone) break
    cursor = page.continueCursor
  }
  writeFileSync(join(CACHE, "stale-species.txt"), stale.join("\n"))
  console.log(
    `Convex: ${stale.length} stored species not produced by this run (listed in ${join(CACHE, "stale-species.txt")})`
  )
}

const colRows = await loadColRows(inFamilies)
const { taxa, synonyms } = buildCol(colRows)
console.log(`Catalogue of Life: ${taxa.length} taxa`)

const pbdbBase = families ? [...families].join(",") : "Animalia"
const pbdb = mergePbdb(taxa, synonyms, await loadPbdb(pbdbBase))
console.log(`PBDB: ${pbdb.added} new, ${pbdb.matched} already in COL`)

const breeds = buildBreeds(taxa, await loadBreeds()).filter((breed) =>
  inFamilies(breed.lineage.family)
)
taxa.push(...breeds)
console.log(`Breeds: ${breeds.length}`)

attachInat(taxa, await loadInat(await inatRootIds(families)))
const names = new Set(taxa.map((taxon) => taxon.scientificName))
const colIds = new Set(taxa.map((taxon) => taxon.colId))
const inatIds = new Set(taxa.map((taxon) => String(taxon.inatId)))
const pbdbIds = new Set(taxa.map((taxon) => taxon.pbdbId))
for (const [name, colId] of synonyms) if (colIds.has(colId)) names.add(name)
const wikidata = await loadWikidata(
  (row) =>
    names.has(row.name) ||
    colIds.has(row.col) ||
    inatIds.has(row.inat) ||
    pbdbIds.has(row.pbdb)
)
attachWikidata(taxa, wikidata, synonyms)

// Species with subspecies stay in: buildCards keeps them only as a fallback.
const cards = taxa
const titles = await loadTitles(
  new Set(cards.map((taxon) => taxon.articleItem))
)
const englishTitle = (taxon) => titles.get(taxon.articleItem)?.en
const inEnglish = cards.filter(englishTitle)
console.log(
  `Leaves: ${inEnglish.length} with an English Wikipedia title, ${cards.length - inEnglish.length} dropped without one`
)

const articles = await loadArticles(new Set(inEnglish.map(englishTitle)))
const pageTitles = new Set(inEnglish.map(englishTitle))
for (const page of articles.values())
  if (page.article) pageTitles.add(page.article)
const pageviews = await loadPageviews(pageTitles)
const imageFiles = new Set()
for (const taxon of inEnglish) {
  const page = articles.get(englishTitle(taxon))
  if (page?.image) imageFiles.add(page.image)
  const file = commonsFile(taxon.photo?.url)
  if (file) imageFiles.add(file)
}
const categories = await loadImageCategories(imageFiles)
const onArticle = buildCards(inEnglish, {
  titleOf: englishTitle,
  articles,
  views: pageviews,
  categories,
})
console.log(
  `Articles: ${onArticle.length} cards, one per English Wikipedia article (section redirects and duplicates dropped)`
)
const withPhoto = onArticle.filter((card) => card.photoUrl)
console.log(
  `Cards: ${withPhoto.length} with a photo, ${onArticle.length - withPhoto.length} dropped without one`
)
const kept = syncSpecies(withPhoto.map(toRow))
if (!families) reportStale(kept)
if (!useCache) dropOldSources()
