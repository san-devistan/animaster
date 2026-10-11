import { v } from "convex/values"
import { Effect } from "effect"

import { internal } from "./_generated/api"
import { internalAction, internalMutation } from "./_generated/server"
import { fetchSubspecies } from "./species/_lib/flow"
import { rarityForSitelinks } from "./species/_lib/rarity"

const nullableString = v.union(v.string(), v.null())
const importedSpecies = v.object({
  colId: v.string(),
  wikidataId: v.string(),
  scientificName: v.string(),
  authorship: nullableString,
  rank: v.string(),
  taxonomy: v.object({
    class: nullableString,
    order: nullableString,
    family: nullableString,
    species: nullableString,
  }),
  name: v.string(),
  summary: nullableString,
  imageUrl: v.string(),
  imageFile: v.string(),
  wikipediaUrl: v.string(),
  sitelinks: v.number(),
})

// Imports the best-known animal subspecies: Wikidata candidates, validated
// by Catalogue of Life, described by Wikipedia.
// shortcut: one action capped at 100 cards (one COL call per candidate);
// add a resumable run table before importing more.
// Run: pnpm exec convex run animals:importTop '{"limit": 10}'
export const importTop = internalAction({
  args: { limit: v.number() },
  handler: async (
    ctx,
    { limit }
  ): Promise<{ saved: number; inserted: number }> => {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("limit must be an integer from 1 to 100")
    }
    const species = await Effect.runPromise(fetchSubspecies(limit))
    return await ctx.runMutation(internal.animals.save, { species })
  },
})

export const save = internalMutation({
  args: { species: v.array(importedSpecies) },
  handler: async (ctx, { species }) => {
    const syncedAt = Date.now()
    let inserted = 0

    for (const animal of species) {
      const fields = {
        ...animal,
        rarity: rarityForSitelinks(animal.sitelinks),
        syncedAt,
      }
      const existing = await ctx.db
        .query("species")
        .withIndex("by_colId", (q) => q.eq("colId", animal.colId))
        .unique()

      if (existing) {
        await ctx.db.patch("species", existing._id, fields)
      } else {
        await ctx.db.insert("species", { ...fields, randomKey: Math.random() })
        inserted += 1
      }
    }
    return { saved: species.length, inserted }
  },
})

const clearBatchSize = 500

// Deletes every species row, in batches to stay under mutation limits.
// Run: pnpm exec convex run animals:clear
export const clear = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("species").take(clearBatchSize)
    for (const row of rows) {
      await ctx.db.delete("species", row._id)
    }
    if (rows.length === clearBatchSize) {
      await ctx.scheduler.runAfter(0, internal.animals.clear, {})
    }
    return null
  },
})
