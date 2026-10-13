import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { internalMutation, internalQuery } from "./_generated/server"
import { nextRarity } from "./rarity"
import { speciesRow } from "./schema"

// Called by scripts/taxa/import.mjs in batches. Rows are matched by Wikidata
// id, so an existing species keeps its _id (and anything pointing at it) and
// its rarity never goes down.
export const upsert = internalMutation({
  args: { rows: v.array(speciesRow) },
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx, { rows }) => {
    let inserted = 0
    for (const row of rows) {
      const wikidata = row.ids.wikidata
      if (!wikidata) throw new Error(`No Wikidata id: ${row.names.en}`)
      const existing = await ctx.db
        .query("species")
        .withIndex("by_ids_wikidata", (q) => q.eq("ids.wikidata", wikidata))
        .unique()
      if (existing) {
        await ctx.db.replace("species", existing._id, {
          ...row,
          rarity: nextRarity(row.views, existing.rarity),
          drawKey: existing.drawKey,
        })
      } else {
        await ctx.db.insert("species", {
          ...row,
          rarity: nextRarity(row.views),
          drawKey: Math.random(),
        })
        inserted++
      }
    }
    if (inserted) {
      const stats = await ctx.db.query("catalogStats").unique()
      if (stats) {
        await ctx.db.patch("catalogStats", stats._id, {
          species: stats.species + inserted,
        })
      } else {
        await ctx.db.insert("catalogStats", { species: inserted })
      }
    }
    return { inserted, updated: rows.length - inserted }
  },
})

// Wikidata ids of every stored species, a page at a time, to find the ones a
// run no longer produced.
export const wikidataIds = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db.query("species").paginate(paginationOpts)
    return { ...result, page: result.page.map((row) => row.ids.wikidata) }
  },
})
