// Downloads each source and parses it into plain rows. Downloads are cached
// in scripts/taxa/cache (gitignored): sources/ holds Catalogue of Life,
// Wikidata, Wikipedia, Commons, iNaturalist and Paleobiology Database files,
// pageviews/ holds one file per month. import.mjs decides what is refreshed.
import { execFile, execFileSync } from "node:child_process"
import {
  appendFileSync,
  closeSync,
  createReadStream,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { promisify } from "node:util"

const CACHE_ROOT = new URL("cache/", import.meta.url).pathname
export const CACHE = join(CACHE_ROOT, "sources")
const PAGEVIEWS = join(CACHE_ROOT, "pageviews")
// Wikimedia throttles clients whose User-Agent has no way to contact them.
export const USER_AGENT = "animaster-import/0.1 (lcombaret@protonmail.com)"
const QLEVER = "https://qlever.dev/api/wikidata"
const COL_EXPORTS =
  "https://api.checklistbank.org/export?datasetKey=3LR&format=ColDP&extended=true&status=finished&limit=1"
// The basic export is the only one with synonyms (old names → accepted id).
const COL_BASIC =
  "https://api.checklistbank.org/dataset/3LR/export.zip?format=ColDP"
const PREFIXES = `
  PREFIX wdt: <http://www.wikidata.org/prop/direct/>
  PREFIX wd: <http://www.wikidata.org/entity/>
  PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
  PREFIX schema: <http://schema.org/>
  PREFIX wikibase: <http://wikiba.se/ontology#>`

mkdirSync(PAGEVIEWS, { recursive: true })

// Moves the source cache aside so every source is downloaded again; page
// view months are kept. The old copy is only removed once the new run has
// finished (see dropOldSources), so a failed run can be resumed with --cache.
export function startFreshSources() {
  const old = `${CACHE}.old`
  if (existsSync(old)) {
    throw new Error(
      `${old} is left over from an unfinished run: rerun with --cache, or delete it`
    )
  }
  if (existsSync(CACHE)) renameSync(CACHE, old)
  mkdirSync(CACHE, { recursive: true })
}

export function dropOldSources() {
  rmSync(`${CACHE}.old`, { recursive: true, force: true })
}

// Retries dropped connections and rate limits: a full run makes thousands of
// iNaturalist calls and one failure would lose the whole run.
async function fetchJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      })
      if (response.ok) return await response.json()
      if (response.status < 429 || attempt === 6) {
        throw new Error(`${response.status} on ${url}`)
      }
    } catch (error) {
      if (attempt === 6 || error.message.includes(" on http")) throw error
    }
    await sleep(5000 * attempt)
  }
}

async function* tsvRows(path) {
  const lines = createInterface({ input: createReadStream(path) })
  let header
  for await (const line of lines) {
    const cells = line.split("\t")
    if (!header) {
      header = cells.map((name) => name.replace(/^(col:|\?)/, ""))
      continue
    }
    yield Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""]))
  }
}

function download(url, name, files) {
  const dir = join(CACHE, name)
  if (files.every((file) => existsSync(join(dir, file)))) return dir
  mkdirSync(dir, { recursive: true })
  const zip = join(dir, "export.zip")
  execFileSync("curl", ["-sSfL", "-o", zip, url])
  execFileSync("unzip", ["-o", "-q", zip, ...files, "-d", dir])
  return dir
}

function tail(path) {
  const fd = openSync(path)
  const size = fstatSync(fd).size
  const buffer = Buffer.alloc(Math.min(2000, size))
  readSync(fd, buffer, 0, buffer.length, size - buffer.length)
  closeSync(fd)
  return buffer.toString()
}

// QLever streams TSV and appends an error to a 200 answer when it times out,
// so the tail is checked before the file is cached.
async function* qleverRows(name, query) {
  const path = join(CACHE, `${name}.tsv`)
  if (!existsSync(path)) {
    const part = `${path}.part`
    execFileSync("curl", [
      "-sSf",
      "--retry",
      "3",
      "--retry-delay",
      "30",
      "-A",
      USER_AGENT,
      "-H",
      "Accept: text/tab-separated-values",
      "--data-urlencode",
      `query=${PREFIXES}${query}`,
      "-o",
      part,
      QLEVER,
    ])
    if (tail(part).includes("!!!!>>")) {
      throw new Error(`QLever failed for ${name}: ${tail(part)}`)
    }
    renameSync(part, path)
  }
  for await (const row of tsvRows(path)) {
    yield Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, wikidataValue(value)])
    )
  }
}

// QLever TSV writes IRIs as <...> and strings as "..."@lang or "..."^^type.
function wikidataValue(value) {
  if (!value) return undefined
  if (value.startsWith("<")) {
    return value.slice(1, -1).replace("http://www.wikidata.org/entity/", "")
  }
  if (value.startsWith('"')) return value.slice(1, value.lastIndexOf('"'))
  return value
}

const isAnimalLeafRank = (row) =>
  row.kingdom === "Animalia" &&
  (row.rank === "species" || row.rank === "subspecies")

// Catalogue of Life: accepted species/subspecies rows and their synonyms.
export async function loadColRows(inFamilies) {
  const { result } = await fetchJson(COL_EXPORTS)
  if (!result?.[0]) throw new Error("No finished Catalogue of Life export")
  const dir = download(result[0].download, "col-extended", ["NameUsage.tsv"])
  const rows = []
  for await (const row of tsvRows(join(dir, "NameUsage.tsv"))) {
    if (!isAnimalLeafRank(row) || !inFamilies(row.family)) continue
    rows.push({
      id: row.ID,
      parentId: row.parentID,
      status: row.status,
      rank: row.rank,
      scientificName: row.scientificName,
      extinct: row.extinct,
      kingdom: row.kingdom,
      phylum: row.phylum,
      class: row.class,
      order: row.order,
      family: row.family,
      genus: row.genus,
    })
  }
  const accepted = new Set(rows.map((row) => row.id))
  // A loop, not push(...): about a million synonyms overflow the call stack.
  for (const synonym of await loadColSynonyms(accepted)) rows.push(synonym)
  return rows
}

async function loadColSynonyms(accepted) {
  const synonyms = []
  const basic = download(COL_BASIC, "col-basic", ["NameUsage.tsv"])
  for await (const row of tsvRows(join(basic, "NameUsage.tsv"))) {
    if (!row.status.includes("synonym") || !accepted.has(row.parentID)) continue
    synonyms.push({
      id: row.ID,
      parentId: row.parentID,
      status: row.status,
      rank: row.rank,
      scientificName: row.scientificName,
      kingdom: "Animalia",
    })
  }
  return synonyms
}

// PBDB leaves taxon_rank empty in this output, so each rank is fetched apart.
export async function loadPbdb(base) {
  const rows = []
  for (const rank of ["species", "subspecies"]) {
    const path = join(CACHE, `pbdb-${base.replaceAll(",", "-")}-${rank}.tsv`)
    if (!existsSync(path)) {
      const url = `https://paleobiodb.org/data1.2/taxa/list.tsv?base_name=${base}&rank=${rank}&taxon_status=accepted&extant=no&vocab=pbdb&show=class,parent&limit=all`
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      })
      if (!response.ok) throw new Error(`${response.status} on ${url}`)
      writeFileSync(path, await response.text())
    }
    for await (const row of tsvRows(path)) rows.push(pbdbRow(row, rank))
  }
  return rows
}

function pbdbRow(row, rank) {
  return {
    id: row.taxon_no,
    name: row.taxon_name,
    rank,
    parentName: row.parent_name,
    phylum: row.phylum,
    class: row.class,
    order: row.order,
    family: row.family,
    genus: row.genus,
  }
}

export async function loadBreeds() {
  const rows = []
  for await (const row of qleverRows(
    "wikidata-breeds",
    `SELECT ?breed ?type ?label ?image WHERE {
      ?type wdt:P279* wd:Q38829 .
      ?breed wdt:P31 ?type ; wdt:P18 ?image ; rdfs:label ?label .
      FILTER(LANG(?label) = "en")
    }`
  )) {
    rows.push({
      id: row.breed,
      typeId: row.type,
      label: row.label,
      image: row.image,
    })
  }
  return rows
}

// iNaturalist taxa under the given roots, paged by id: name → taxon. The
// default photo comes with each taxon, so no extra photo request is needed.
// Pages are appended to a cache file, so an interrupted download resumes.
export async function loadInat(rootIds) {
  const path = join(CACHE, `inat-${rootIds.replaceAll(",", "-")}.jsonl`)
  const byName = new Map()
  let idAbove = 0
  if (existsSync(path)) {
    for await (const line of createInterface({
      input: createReadStream(path),
    })) {
      const taxon = JSON.parse(line)
      byName.set(taxon.name, taxon)
      idAbove = taxon.id
    }
  }
  for (let page = 1; ; page++) {
    const url = `https://api.inaturalist.org/v1/taxa?taxon_id=${rootIds}&rank=species,subspecies&is_active=true&per_page=500&order_by=id&order=asc&id_above=${idAbove}`
    const { results } = await fetchJson(url)
    if (results.length === 0) return byName
    const taxa = results.map(({ id, name, default_photo }) => ({
      id,
      name,
      default_photo: default_photo && { medium_url: default_photo.medium_url },
    }))
    appendFileSync(path, taxa.map((t) => `${JSON.stringify(t)}\n`).join(""))
    for (const taxon of taxa) byName.set(taxon.name, taxon)
    idAbove = taxa.at(-1).id
    if (page % 100 === 0) console.log(`iNaturalist: ${byName.size} taxa`)
    await sleep(1000)
  }
}

export async function inatRootIds(families) {
  if (!families) return "1"
  const ids = []
  for (const family of families) {
    const { results } = await fetchJson(
      `https://api.inaturalist.org/v1/taxa?q=${family}&rank=family`
    )
    const match = results.find((taxon) => taxon.name === family)
    if (match) ids.push(match.id)
  }
  return ids.join(",")
}

// Every Wikidata animal item with a scientific name or an id we can match on.
// Only rows that `keep` accepts are held in memory.
export async function loadWikidata(keep) {
  const rows = []
  for await (const row of qleverRows(
    "wikidata",
    `SELECT ?item ?name ?col ?pbdb ?inat ?image ?label ?article WHERE {
      ?item wdt:P171+ wd:Q729 .
      { ?item wdt:P225 ?name } UNION { ?item wdt:P10585 ?col } UNION { ?item wdt:P3151 ?inat }
      OPTIONAL { ?item wdt:P225 ?name }
      OPTIONAL { ?item wdt:P10585 ?col }
      OPTIONAL { ?item wdt:P10907 ?pbdb }
      OPTIONAL { ?item wdt:P3151 ?inat }
      OPTIONAL { ?item wdt:P18 ?image }
      OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = "en") }
      OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
    }`
  )) {
    if (keep(row)) rows.push(row)
  }
  return rows
}

// Languages for card names and Wikipedia links. Adding one (e.g. "fr") needs
// no other change: names and wikipedia are keyed by language code.
export const LANGUAGES = ["en"]

// Wikipedia article titles per item and language, for items in `items`:
// animals under Animalia plus breeds (which sit outside the taxon tree).
export async function loadTitles(items) {
  const titles = new Map()
  const languages = LANGUAGES.map((lang) => `"${lang}"`).join(" ")
  for await (const row of qleverRows(
    `wikidata-titles-${LANGUAGES.join("-")}`,
    `SELECT ?item ?lang ?title WHERE {
      VALUES ?lang { ${languages} }
      ?article schema:about ?item ; schema:inLanguage ?lang ; schema:isPartOf ?site ; schema:name ?title .
      FILTER(STR(?site) = CONCAT("https://", ?lang, ".wikipedia.org/"))
      { ?item wdt:P171+ wd:Q729 } UNION { ?item wdt:P31/wdt:P279* wd:Q38829 }
    }`
  )) {
    if (!items.has(row.item)) continue
    titles.set(row.item, { ...titles.get(row.item), [row.lang]: row.title })
  }
  return titles
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// English Wikipedia page views per title (with spaces) over the last 12
// finished months, from Wikimedia's monthly dumps of user traffic. Only
// `titles` are kept. Views reaching a page through a redirect count under the
// redirect's title.
export async function loadPageviews(titles) {
  const wanted = new Set([...titles].map((title) => title.replaceAll(" ", "_")))
  const views = new Map()
  for (const path of await englishPageviews(lastMonths(12))) {
    const lines = createInterface({ input: createReadStream(path) })
    for await (const line of lines) {
      const [title, count] = line.split("\t")
      if (!wanted.has(title)) continue
      const key = title.replaceAll("_", " ")
      views.set(key, (views.get(key) ?? 0) + Number(count))
    }
  }
  return views
}

// The `count` finished months before the current one, as "YYYYMM", newest
// first.
export function lastMonths(count, now = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const month = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1 - i)
    )
    return `${month.getUTCFullYear()}${String(month.getUTCMonth() + 1).padStart(2, "0")}`
  })
}

// One cached file per month (each dump is ~6 GB), kept across runs: only the
// months missing from the last 12 are downloaded. dumps.wikimedia.org caps
// downloads at 3 connections per IP, so 2 run at a time.
async function englishPageviews(months) {
  const paths = []
  const queue = [...months]
  const worker = async () => {
    for (let month = queue.shift(); month; month = queue.shift()) {
      paths.push(await englishPageviewsMonth(month))
    }
  }
  await Promise.all(Array.from({ length: 2 }, worker))
  return paths
}

// A dump is sorted by wiki then title, with one row per device type. Reading
// stops after the en.wikipedia block; rows of a title are summed into one.
// "END" proves the block was read whole.
async function englishPageviewsMonth(month) {
  const path = join(PAGEVIEWS, `${month}-en-sum.tsv`)
  if (existsSync(path)) return path
  const yyyy = month.slice(0, 4)
  const url = `https://dumps.wikimedia.org/other/pageview_complete/monthly/${yyyy}/${yyyy}-${month.slice(4)}/pageviews-${month}-user.bz2`
  const part = `${path}.part`
  console.log(`Pageviews: downloading ${month}`)
  await promisify(execFile)(
    "sh",
    [
      "-c",
      `curl -sf --retry 3 -A "$1" "$2" | bzcat 2>/dev/null | awk '
        $1 == "en.wikipedia" { if ($2 != title) { if (title != "") print title "\\t" views; title = $2; views = 0 } views += $5; seen = 1; next }
        seen { done = 1; exit }
        END { if (title != "") print title "\\t" views; if (done) print "END" }' > "$3"`,
      "sh",
      USER_AGENT,
      url,
      part,
    ],
    { maxBuffer: 1024 * 1024 }
  )
  if (!tail(part).endsWith("END\n")) {
    throw new Error(`Pageviews dump missing or cut short: ${url}`)
  }
  renameSync(part, path)
  return path
}
