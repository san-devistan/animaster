import { defineSchema, defineTable } from "convex/server"
import { type Infer, v } from "convex/values"

// One row per card-eligible animal (subspecies, species without subspecies,
// or breed) that has a photo. Merged from Catalogue of Life, the Paleobiology
// Database, Wikidata, Commons and iNaturalist by scripts/taxa/import.mjs.
export const speciesFields = {
  // Card core: always filled.
  photoUrl: v.string(),

  // The animal's id in each source that knows it.
  ids: v.object({
    col: v.optional(v.string()),
    pbdb: v.optional(v.string()),
    wikidata: v.optional(v.string()),
    inat: v.optional(v.number()),
  }),

  // Keyed by language code (only "en" for now), plus "scientific". Show
  // names[language], else names.scientific. The English name is the English
  // Wikipedia article title, so it can be a scientific name when the article
  // is titled that way. One row per English article.
  names: v.record(v.string(), v.string()),
  // Page URL keyed by language code like names. Every row has "en".
  wikipedia: v.record(v.string(), v.string()),
  // English Wikipedia page views over the last 12 finished months (user
  // traffic only, redirects not included).
  views: v.number(),

  lineage: v.object({
    phylum: v.optional(v.string()),
    class: v.optional(v.string()),
    order: v.optional(v.string()),
    family: v.optional(v.string()),
    genus: v.optional(v.string()),
  }),

  extinct: v.boolean(),
}

// Derived from views by species:upsert and never lowered (see rarity.ts); the
// import sends rows without it.
export const rarity = v.union(
  v.literal("common"),
  v.literal("rare"),
  v.literal("epic"),
  v.literal("legendary")
)

export const speciesRow = v.object(speciesFields)
export type SpeciesRow = Infer<typeof speciesRow>

export default defineSchema({
  species: defineTable({
    ...speciesFields,
    rarity,
    // Random in [0, 1), so a pack draws a species of a rarity with one index
    // read (see packs.ts).
    drawKey: v.number(),
  })
    .index("by_ids_col", ["ids.col"])
    .index("by_ids_pbdb", ["ids.pbdb"])
    .index("by_ids_wikidata", ["ids.wikidata"])
    .index("by_ids_inat", ["ids.inat"])
    .index("by_rarity_and_drawKey", ["rarity", "drawKey"]),
  // One row: the number of species, kept by species:upsert.
  catalogStats: defineTable({ species: v.number() }),
  // One row per player and species they own. `playerId` is the Convex
  // identity token of the Better Auth user.
  collection: defineTable({
    playerId: v.string(),
    speciesId: v.id("species"),
    copies: v.number(),
    // When it was first pulled, in ms.
    pulledAt: v.number(),
    // The rarity the player last saw the card at. Below the species' current
    // rarity, it went up in an import and the app plays its upgrade
    // (packs:upgrades); unset counts as seen.
    seenRarity: v.optional(rarity),
  })
    .index("by_playerId", ["playerId"])
    .index("by_playerId_and_speciesId", ["playerId", "speciesId"]),
  // Each player's waiting pack: drawn once, then kept until packs:claim.
  pendingPacks: defineTable({
    playerId: v.string(),
    speciesIds: v.array(v.id("species")),
  }).index("by_playerId", ["playerId"]),
})
