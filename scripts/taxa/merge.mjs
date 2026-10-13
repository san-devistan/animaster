// Pure merge rules shared by the import script and its self-check.

export const ANIMALIA = "Animalia"

// Wikidata breed types → the Catalogue of Life species they belong to.
// shortcut: hand-written for types with 5+ breeds, extend when new types appear.
export const BREED_TYPE_SPECIES = {
  Q39367: "Canis familiaris",
  Q38547: "Canis familiaris",
  Q7228510: "Canis familiaris",
  Q38945: "Canis familiaris",
  Q1160573: "Equus caballus",
  Q12045585: "Bos taurus",
  Q21521438: "Bos taurus",
  Q15623573: "Columba livia",
  Q15622363: "Ovis aries",
  Q15304943: "Gallus gallus",
  Q50318633: "Gallus gallus",
  Q43577: "Felis catus",
  Q15446690: "Felis catus",
  Q15622387: "Capra hircus",
  Q12045584: "Oryctolagus cuniculus",
  Q244190: "Oryctolagus cuniculus",
  Q18786396: "Sus domesticus",
  Q59453852: "Anser anser",
  Q61901018: "Equus asinus",
  Q110536225: "Anas platyrhynchos",
  Q110529992: "Meleagris gallopavo",
  Q20011823: "Serinus canaria",
  Q110529959: "Cavia porcellus",
  Q110532675: "Bubalus bubalis",
}

const isAccepted = (status) =>
  status === "accepted" || status === "provisionally accepted"

const lineageOf = (row) => ({
  phylum: row.phylum || undefined,
  class: row.class || undefined,
  order: row.order || undefined,
  family: row.family || undefined,
  genus: row.genus || undefined,
})

// Turns Catalogue of Life rows into taxa: accepted animal species and
// subspecies, with species marked non-leaf when they have subspecies.
// `synonyms` maps an old name to the accepted colId, for later matching.
export function buildCol(rows) {
  const byId = new Map()
  const synonyms = new Map()
  for (const row of rows) {
    if (row.kingdom !== ANIMALIA) continue
    if (row.rank !== "species" && row.rank !== "subspecies") continue
    if (isAccepted(row.status)) byId.set(row.id, row)
    else synonyms.set(row.scientificName, row.parentId)
  }
  const withSubspecies = new Set()
  for (const row of byId.values()) {
    if (row.rank === "subspecies") withSubspecies.add(row.parentId)
  }
  const taxa = [...byId.values()].map((row) => ({
    kind: row.rank,
    source: "col",
    colId: row.id,
    scientificName: row.scientificName,
    parentName:
      row.rank === "subspecies"
        ? byId.get(row.parentId)?.scientificName
        : undefined,
    isLeaf: row.rank === "subspecies" || !withSubspecies.has(row.id),
    extinct: row.extinct === "true",
    lineage: lineageOf(row),
  }))
  return { taxa, synonyms }
}

// Merges Paleobiology Database rows into the taxa list. A row matching an
// accepted name or synonym enriches that taxon; otherwise it becomes a new
// extinct taxon.
export function mergePbdb(taxa, synonyms, pbdbRows) {
  const byName = new Map(taxa.map((taxon) => [taxon.scientificName, taxon]))
  const byColId = new Map(taxa.map((taxon) => [taxon.colId, taxon]))
  let matched = 0
  for (const row of pbdbRows) {
    const colId = synonyms.get(row.name)
    const existing = byName.get(row.name) ?? (colId && byColId.get(colId))
    if (existing) {
      existing.pbdbId ??= row.id
      matched++
      continue
    }
    const taxon = {
      kind: row.rank,
      source: "pbdb",
      pbdbId: row.id,
      scientificName: row.name,
      parentName: row.rank === "subspecies" ? row.parentName : undefined,
      isLeaf: true,
      extinct: true,
      lineage: lineageOf(row),
    }
    taxa.push(taxon)
    byName.set(row.name, taxon)
  }
  // A fossil subspecies makes its species a non-leaf, living or fossil
  // (Homo sapiens idaltu: Homo sapiens is not a card on its own).
  for (const taxon of taxa) {
    if (taxon.source !== "pbdb" || taxon.kind !== "subspecies") continue
    const parent = byName.get(taxon.parentName)
    if (parent) parent.isLeaf = false
  }
  return { added: pbdbRows.length - matched, matched }
}

// Breeds become leaf taxa under their species, which then stops being a card
// on its own (Cat, Dog); unmapped types are skipped.
export function buildBreeds(taxa, breedRows) {
  const byName = new Map(taxa.map((taxon) => [taxon.scientificName, taxon]))
  const seen = new Set()
  const breeds = []
  for (const row of breedRows) {
    const species = byName.get(BREED_TYPE_SPECIES[row.typeId])
    if (!species || seen.has(row.id)) continue
    seen.add(row.id)
    species.isLeaf = false
    breeds.push({
      kind: "breed",
      source: "wikidata",
      wikidataId: row.id,
      articleItem: row.id,
      wikidataLabel: row.label,
      scientificName: species.scientificName,
      photo: { url: commonsUrl(row.image) },
      parentName: species.scientificName,
      isLeaf: true,
      extinct: false,
      lineage: species.lineage,
    })
  }
  return breeds
}

export const commonsUrl = (image) =>
  `${image.replace("http://", "https://")}?width=960`

// Finds the Wikidata item of a taxon by id or current name, preferring an item
// with a photo. Old names are only a fallback: an old name can belong to a
// different animal (Canis lupus dingo is an old name of Canis familiaris).
//
// `article` is the item holding the Wikipedia articles. After a rename,
// Wikidata often keeps the articles on the old name's item (Buteo burmanicus
// for Buteo refectus), so old-name items are searched when the match has none.
export function matchWikidata(items, taxon, oldNames = []) {
  const direct = [
    items.byCol.get(taxon.colId),
    items.byPbdb.get(taxon.pbdbId),
    items.byInat.get(String(taxon.inatId)),
    items.byName.get(taxon.scientificName),
  ].filter(Boolean)
  const old = oldNames.map((name) => items.byName.get(name)).filter(Boolean)
  const candidates = direct.length ? direct : old
  const item = candidates.find((row) => row.image) ?? candidates[0]
  if (!item) return undefined
  const article =
    [item, ...candidates, ...old].find((row) => row.article) ?? item
  return { item, article }
}

export const wikipediaUrl = (title) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`

// One card per English Wikipedia article. `titleOf` gives the taxon's English
// title from Wikidata, `articles` maps it to the page it lands on, `views` and
// `categories` are keyed by article title and image file.
// A title redirecting to a section has no article of its own, and a list page
// ("List of dog crossbreeds") is not an animal: both dropped.
// A subspecies or breed must have its own article: one that only redirects
// to another page (European elk → Moose) gets no card. A species with
// subspecies or breeds is a card only when none of them kept one, so it
// stands for all of them (Moose is dropped next to Alaska moose; a species
// whose subspecies all lack articles keeps its own card).
// When several species land on one article, the one whose own title is the
// article wins; otherwise the one whose own (redirect) title is most viewed.
// A card's views are its article's views.
// The card's name and URL come from the article; its photo is the article's
// main image, then the Wikidata image, then the iNaturalist photo, skipping
// images that do not show the living animal (see isUnfitImage).
export function buildCards(taxa, { titleOf, articles, views, categories }) {
  const byArticle = new Map()
  const place = (taxon) => {
    const title = titleOf(taxon)
    const page = articles.get(title)
    if (!page?.article || page.section || page.article.startsWith("List of "))
      return false
    const own = title === page.article
    if (taxon.parentName && !own) return false
    const candidate = {
      taxon,
      article: page.article,
      image: page.image,
      extinct: taxon.extinct || page.extinct,
      own,
      titleViews: views.get(title) ?? 0,
    }
    const current = byArticle.get(page.article)
    if (!current || wins(candidate, current))
      byArticle.set(page.article, candidate)
    return true
  }
  const covered = new Set()
  for (const taxon of taxa) {
    if (taxon.isLeaf && taxon.parentName && place(taxon))
      covered.add(taxon.parentName)
  }
  for (const taxon of taxa) {
    if (taxon.parentName) continue
    if (taxon.isLeaf || !covered.has(taxon.scientificName)) place(taxon)
  }
  const photoUrl = (taxon, image, extinct) => {
    const fit = (file) =>
      !isUnfitImage(file, categories.get(file) ?? [], extinct)
    if (image && fit(image)) {
      return `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=960`
    }
    const wikidataUrl = taxon.photo?.url
    const wikidataFile = commonsFile(wikidataUrl)
    if (wikidataUrl && (!wikidataFile || fit(wikidataFile))) {
      return wikidataUrl
    }
    return taxon.inatPhotoUrl
  }
  return [...byArticle.values()].map(({ taxon, article, image, extinct }) => ({
    taxon,
    article,
    extinct,
    views: views.get(article) ?? 0,
    photoUrl: photoUrl(taxon, image, extinct),
  }))
}

const wins = (candidate, current) =>
  candidate.own !== current.own
    ? candidate.own
    : candidate.titleViews > current.titleViews

// The Commons file name of a Wikidata image URL, underscored like page images.
export const commonsFile = (url) =>
  url?.includes("commons.wikimedia.org/wiki/Special:FilePath/")
    ? decodeURIComponent(url.split("FilePath/")[1].split("?")[0]).replaceAll(
        " ",
        "_"
      )
    : undefined

// Maps are never the animal. Skulls and skeletons are kept for extinct
// animals (often the best image there is) and skipped for living ones.
// Paintings, drawings and museum specimens still show the animal: kept.
// Commons categories catch maps with plain file names
// (Muntiacus_putaoensis.png); the file name catches uncategorized ones.
export function isUnfitImage(file, categories, extinct) {
  const map =
    /\.svg$|(^|[_ (-])(map|distribution|distrib|locator)([_ ).-]|$)/i.test(
      file
    ) ||
    categories.some((c) =>
      /(distribution|range|locator|world) maps?\b|^maps of/i.test(c)
    )
  const bones = categories.some((c) => /skulls?\b|crani|skeletons?\b/i.test(c))
  return map || (!extinct && bones)
}

// Indexes Wikidata items by every id and name they carry.
export function indexWikidata(rows) {
  const items = {
    byCol: new Map(),
    byPbdb: new Map(),
    byInat: new Map(),
    byName: new Map(),
  }
  for (const row of rows) {
    if (row.col) items.byCol.set(row.col, row)
    if (row.pbdb) items.byPbdb.set(row.pbdb, row)
    if (row.inat) items.byInat.set(row.inat, row)
    if (row.name && !items.byName.get(row.name)?.image)
      items.byName.set(row.name, row)
  }
  return items
}
