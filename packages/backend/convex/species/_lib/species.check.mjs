// Run: node packages/backend/convex/species/_lib/species.check.mjs
import assert from "node:assert/strict"

import { acceptedLivingAnimal, englishName, taxonomy } from "./col.ts"
import { rarityForSitelinks } from "./rarity.ts"
import { articleTitle, commonsFile, toSpecies } from "./wikimedia.ts"

assert.equal(
  commonsFile(
    "http://commons.wikimedia.org/wiki/Special:FilePath/Rothschild%27s%20giraffe%20%28Giraffa%2C%29.jpg"
  ),
  "Rothschild's giraffe (Giraffa,).jpg"
)
assert.equal(
  articleTitle("https://en.wikipedia.org/wiki/Eurasian_eagle-owl"),
  "Eurasian eagle-owl"
)

assert.deepEqual(
  toSpecies({
    item: { value: "http://www.wikidata.org/entity/Q15069" },
    col: { value: "BNSBB" },
    scientificName: { value: "Panthera tigris tigris" },
    image: {
      value:
        "http://commons.wikimedia.org/wiki/Special:FilePath/Bengal%20tiger.jpg",
    },
    article: { value: "https://en.wikipedia.org/wiki/Bengal_tiger" },
    sitelinkCount: { value: "93" },
  }),
  {
    colId: "BNSBB",
    wikidataId: "Q15069",
    scientificName: "Panthera tigris tigris",
    name: "Bengal tiger",
    imageFile: "Bengal tiger.jpg",
    imageUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Bengal%20tiger.jpg?width=960",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Bengal_tiger",
    sitelinks: 93,
  }
)

// Trimmed from Catalogue of Life's /taxon/5K5M9/info.
const bengalTiger = {
  usage: {
    id: "5K5M9",
    status: "accepted",
    extinct: false,
    name: { scientificName: "Panthera tigris tigris", rank: "subspecies" },
  },
  classification: [
    { rank: "species", name: "Panthera tigris" },
    { rank: "family", name: "Felidae" },
    { rank: "order", name: "Carnivora" },
    { rank: "class", name: "Mammalia" },
    { rank: "kingdom", name: "Animalia" },
  ],
  vernacularNames: [{ name: "Bengal tiger", language: "eng" }],
}
assert.equal(acceptedLivingAnimal(bengalTiger), true)
assert.deepEqual(taxonomy(bengalTiger), {
  class: "Mammalia",
  order: "Carnivora",
  family: "Felidae",
  species: "Panthera tigris",
})
assert.equal(englishName(bengalTiger), "Bengal tiger")
// Siberian tiger is a synonym of the Bengal tiger in COL; Javan tiger is extinct.
assert.equal(
  acceptedLivingAnimal({
    ...bengalTiger,
    usage: { ...bengalTiger.usage, status: "synonym" },
  }),
  false
)
assert.equal(
  acceptedLivingAnimal({
    ...bengalTiger,
    usage: { ...bengalTiger.usage, extinct: true },
  }),
  false
)
assert.equal(
  acceptedLivingAnimal({
    ...bengalTiger,
    classification: [{ rank: "kingdom", name: "Plantae" }],
  }),
  false
)

assert.equal(rarityForSitelinks(93), "legendary")
assert.equal(rarityForSitelinks(80), "legendary")
assert.equal(rarityForSitelinks(79), "epic")
assert.equal(rarityForSitelinks(50), "epic")
assert.equal(rarityForSitelinks(30), "rare")
assert.equal(rarityForSitelinks(29), "common")
