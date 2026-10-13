// Self-check for the merge rules: node scripts/taxa/merge.check.mjs
import assert from "node:assert/strict"

import {
  buildBreeds,
  buildCards,
  buildCol,
  commonsFile,
  indexWikidata,
  isUnfitImage,
  matchWikidata,
  mergePbdb,
  wikipediaUrl,
} from "./merge.mjs"
import { lastMonths } from "./sources.mjs"
import { resolveArticles } from "./wikimedia.mjs"

const row = (id, rank, name, extra = {}) => ({
  id,
  parentId: "",
  status: "accepted",
  rank,
  scientificName: name,
  kingdom: "Animalia",
  family: "Canidae",
  ...extra,
})

const { taxa, synonyms } = buildCol([
  row("WOLF", "species", "Canis lupus"),
  row("ARAB", "subspecies", "Canis lupus arabs", { parentId: "WOLF" }),
  row("DOG", "species", "Canis familiaris"),
  row("DIRE", "species", "Aenocyon dirus", { extinct: "true" }),
  row("OLD", "species", "Canis dirus", { status: "synonym", parentId: "DIRE" }),
  row("PLANT", "species", "Rosa canina", { kingdom: "Plantae" }),
])
const leaf = (name) => taxa.find((t) => t.scientificName === name)?.isLeaf

assert.equal(taxa.length, 4, "plants and synonyms are dropped")
assert.equal(
  leaf("Canis lupus"),
  false,
  "species with subspecies is not a leaf"
)
assert.equal(leaf("Canis lupus arabs"), true)
assert.equal(leaf("Canis familiaris"), true)
assert.equal(taxa.find((t) => t.colId === "DIRE").extinct, true)
assert.equal(taxa.find((t) => t.colId === "ARAB").parentName, "Canis lupus")

const pbdb = mergePbdb(taxa, synonyms, [
  { id: "1", name: "Aenocyon dirus", rank: "species" },
  { id: "2", name: "Canis dirus", rank: "species" },
  { id: "3", name: "Coelodonta antiquitatis", rank: "species" },
  {
    id: "4",
    name: "Coelodonta antiquitatis praecursor",
    rank: "subspecies",
    parentName: "Coelodonta antiquitatis",
  },
])
assert.deepEqual(pbdb, { added: 2, matched: 2 })
assert.equal(
  taxa.find((t) => t.colId === "DIRE").pbdbId,
  "1",
  "first match wins"
)
assert.equal(
  leaf("Coelodonta antiquitatis"),
  false,
  "fossil species with fossil subspecies"
)
assert.equal(leaf("Coelodonta antiquitatis praecursor"), true)
mergePbdb(taxa, synonyms, [
  {
    id: "5",
    name: "Canis familiaris fossilis",
    rank: "subspecies",
    parentName: "Canis familiaris",
  },
])
assert.equal(
  leaf("Canis familiaris"),
  false,
  "a living species with a fossil subspecies is not a card (Homo sapiens)"
)
taxa.find((t) => t.scientificName === "Canis familiaris").isLeaf = true

const breeds = buildBreeds(taxa, [
  {
    id: "Q38383",
    typeId: "Q39367",
    label: "Labrador Retriever",
    image: "http://commons/lab.jpg",
  },
  {
    id: "Q38383",
    typeId: "Q39367",
    label: "Labrador Retriever",
    image: "http://commons/lab.jpg",
  },
  { id: "Q1", typeId: "Q-unknown", label: "Mystery" },
])
assert.equal(breeds.length, 1, "duplicates and unmapped types are skipped")
assert.equal(breeds[0].parentName, "Canis familiaris")
assert.equal(breeds[0].photo.url, "https://commons/lab.jpg?width=960")
assert.equal(
  leaf("Canis familiaris"),
  false,
  "a species with breeds is not a card (Dog)"
)

const items = indexWikidata([
  { item: "Q20717272", name: "Canis familiaris", inat: "47144" },
  { item: "Q5032447", name: "Canis lupus dingo", image: "dingo.jpg" },
  {
    item: "Q1068694",
    name: "lobo de punta de nabo",
    inat: "337848",
    image: "wolf.jpg",
  },
  { item: "Q2", name: "Old name only", image: "old.jpg" },
  { item: "Q55111926", name: "Buteo refectus", image: "buzzard.jpg" },
  {
    item: "Q2928701",
    name: "Buteo burmanicus",
    article: "en/Himalayan_buzzard",
  },
])
const dog = { colId: "QLXF", scientificName: "Canis familiaris", inatId: 47144 }
assert.equal(
  matchWikidata(items, dog, ["Canis lupus dingo"]).item.item,
  "Q20717272",
  "a direct match beats an old name, even without a photo"
)
assert.equal(
  matchWikidata(items, dog, ["Canis lupus dingo"]).article.item,
  "Q20717272",
  "an old-name article is not borrowed from another animal's photo item"
)
assert.equal(
  matchWikidata(items, { scientificName: "New name" }, ["Old name only"]).item
    .item,
  "Q2",
  "old names are used when nothing matches directly"
)
assert.equal(
  matchWikidata(items, {
    scientificName: "Canis lupus signatus",
    inatId: 337848,
  }).item.item,
  "Q1068694",
  "iNaturalist id rescues a wrong Wikidata name"
)
assert.equal(matchWikidata(items, { scientificName: "Nobody" }), undefined)

const buzzard = matchWikidata(items, { scientificName: "Buteo refectus" }, [
  "Buteo burmanicus",
])
assert.equal(buzzard.item.item, "Q55111926", "photo stays on the current item")
assert.equal(
  buzzard.article.item,
  "Q2928701",
  "articles come from the old name's item"
)

const resolved = resolveArticles(
  ["Canis familiaris", "Plains_coyote", "Northern coyote", "Nope", "Orca"],
  {
    normalized: [{ from: "Plains_coyote", to: "Plains coyote" }],
    redirects: [
      { from: "Canis familiaris", to: "Dog" },
      { from: "Plains coyote", to: "Coyote", tofragment: "Subspecies" },
      { from: "Northern coyote", to: "Coyote" },
    ],
    pages: [
      { title: "Dog", pageimage: "Huskiesatrest.jpg" },
      {
        title: "Coyote",
        pageimage: "Coyote.jpg",
        categories: [{ title: "Category:Extinct animals of Mars" }],
      },
      { title: "Nope", missing: true },
      {
        title: "Orca",
        categories: [{ title: "Category:Extinction in fiction" }],
      },
    ],
  }
)
assert.deepEqual(
  resolved.map((r) => [r.title, r.article, r.section, r.image, r.extinct]),
  [
    ["Canis familiaris", "Dog", undefined, "Huskiesatrest.jpg", false],
    ["Plains_coyote", "Coyote", "Subspecies", "Coyote.jpg", true],
    ["Northern coyote", "Coyote", undefined, "Coyote.jpg", true],
    ["Nope", undefined, undefined, undefined, false],
    ["Orca", "Orca", undefined, undefined, false],
  ],
  "redirects are followed, sections, missing pages and Extinct categories are flagged"
)

const articles = new Map(resolved.map((r) => [r.title, r]))
const coyotes = [
  { scientificName: "Canis latrans mearnsi", title: "Plains_coyote" },
  { scientificName: "Canis latrans", title: "Northern coyote", isLeaf: true },
  { scientificName: "Canis latrans x", title: "Northern coyote", isLeaf: true },
  {
    scientificName: "Canis familiaris",
    title: "Canis familiaris",
    isLeaf: true,
  },
  {
    scientificName: "Orcinus orca",
    title: "Orca",
    isLeaf: true,
    photo: { url: "wd.jpg" },
  },
  {
    scientificName: "Orcinus x",
    title: "Orca",
    isLeaf: true,
    photo: { url: "x.jpg" },
  },
  {
    scientificName: "Nobody",
    title: "Nope",
    isLeaf: true,
    photo: { url: "n.jpg" },
  },
]
const views = new Map([
  ["Coyote", 900],
  ["Northern coyote", 5],
  ["Dog", 4000],
])
const byTitle = (t) => t.title
const cards = buildCards(coyotes, {
  titleOf: byTitle,
  articles,
  views,
  categories: new Map(),
})
assert.deepEqual(
  cards.map((c) => [c.article, c.taxon.scientificName, c.views]),
  [
    ["Coyote", "Canis latrans", 900],
    ["Dog", "Canis familiaris", 4000],
    ["Orca", "Orcinus orca", 0],
  ],
  "one card per article; section redirects and missing pages are dropped"
)

const moose = (subspecies) =>
  buildCards(
    [
      { scientificName: "Alces alces", title: "Moose", isLeaf: false },
      ...subspecies.map(([name, title]) => ({
        scientificName: name,
        title,
        parentName: "Alces alces",
        isLeaf: true,
      })),
    ],
    {
      titleOf: byTitle,
      articles: new Map([
        ["Moose", { article: "Moose" }],
        ["European elk", { article: "Moose" }],
        ["Alaska moose", { article: "Alaska moose" }],
      ]),
      views: new Map(),
      categories: new Map(),
    }
  ).map((c) => c.article)
assert.deepEqual(
  moose([
    ["Alces alces alces", "European elk"],
    ["Alces alces gigas", "Alaska moose"],
  ]),
  ["Alaska moose"],
  "a redirecting subspecies and its covered species get no card"
)
assert.deepEqual(
  moose([["Alces alces alces", "European elk"]]),
  ["Moose"],
  "a species whose subspecies all lack articles keeps its own card"
)
assert.equal(
  cards[1].photoUrl,
  "https://en.wikipedia.org/wiki/Special:FilePath/Huskiesatrest.jpg?width=960",
  "the article image comes first"
)
assert.equal(cards[2].photoUrl, "wd.jpg", "then the taxon's own photo")
assert.equal(
  wikipediaUrl("Verreaux's eagle-owl"),
  "https://en.wikipedia.org/wiki/Verreaux's_eagle-owl"
)
assert.equal(
  buildCards([{ title: "Dorgi" }], {
    titleOf: byTitle,
    articles: new Map([["Dorgi", { article: "List of dog crossbreeds" }]]),
    views: new Map(),
    categories: new Map(),
  }).length,
  0,
  "list pages are not cards"
)
assert.deepEqual(
  [
    "Kouprey distribution.svg",
    "Babyrousa_babyrussa_map.svg",
    "Makira_range_map.png",
    "Mazama_chunyi_distribution.png",
    "Diceros_bicornis_hist_distrib.svg",
    "Guadalcanal_Locator_Map.png",
    "Nyala_male_Maputo.jpg",
    "Pryor_Mountain_Wild_Horse_Range_-_Montana.jpg",
    "Sitting_sun_bear.jpg",
  ].map((file) => isUnfitImage(file, [], false)),
  [true, true, true, true, true, true, false, false, false],
  "range maps are skipped by file name, photos with similar words are kept"
)
assert.equal(
  isUnfitImage(
    "Muntiacus_putaoensis.png",
    ["Cervidae distribution maps"],
    true
  ),
  true,
  "a map is caught by its Commons category, even for extinct animals"
)
assert.deepEqual(
  [true, false].map((extinct) =>
    isUnfitImage("T.jpg", ["Crocodylidae skulls"], extinct)
  ),
  [false, true],
  "skulls are kept for extinct animals, skipped for living ones"
)
assert.equal(
  isUnfitImage("Rosecomb.png", ["Phasianidae illustrations"], false),
  false,
  "paintings and drawings still show the animal"
)
assert.equal(
  isUnfitImage("Dolly.jpg", ["Taxidermied Caprinae"], false),
  false,
  "museum specimens still show the animal"
)

const sunBear = {
  title: "Malayan sun bear",
  extinct: false,
  photo: {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Bear_skull.jpg?width=960",
  },
  inatPhotoUrl: "inat.jpg",
}
const [sunBearCard] = buildCards([sunBear], {
  titleOf: byTitle,
  articles: new Map([
    [
      "Malayan sun bear",
      { article: "Malayan sun bear", image: "Range_map.png" },
    ],
  ]),
  views: new Map(),
  categories: new Map([["Bear_skull.jpg", ["Ursidae skulls"]]]),
})
assert.equal(
  sunBearCard.photoUrl,
  "inat.jpg",
  "an unfit article image and an unfit Wikidata image fall back to iNaturalist"
)
const [spaniel] = buildCards(
  [{ title: "English Water Spaniel", extinct: false }],
  {
    titleOf: byTitle,
    articles: new Map([
      [
        "English Water Spaniel",
        { article: "English Water Spaniel", image: "Skull.jpg", extinct: true },
      ],
    ]),
    views: new Map(),
    categories: new Map([["Skull.jpg", ["Canis skulls"]]]),
  }
)
assert.equal(spaniel.extinct, true, "an Extinct article category wins")
assert.ok(spaniel.photoUrl, "so its skull image is kept")
assert.equal(
  commonsFile(
    "https://commons.wikimedia.org/wiki/Special:FilePath/Northern%20White%20Rhinoceros.jpg?width=960"
  ),
  "Northern_White_Rhinoceros.jpg"
)

const months = lastMonths(12, new Date(Date.UTC(2026, 9, 11)))
assert.equal(months[0], "202609", "the current month is not finished yet")
assert.equal(months[11], "202510", "12 months back, across the year change")

console.log("CHECK_OK")
