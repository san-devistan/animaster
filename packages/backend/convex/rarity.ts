import { v } from "convex/values"

import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"
import { rarityForStreams } from "./songs/_lib/rarity"

const rerateBatchSize = 200

// Re-applies rarityForStreams to stored songs after tier changes.
// shortcut: songs below minSpotifyStreams keep their tier; delete them by hand if the minimum is raised.
// Run: pnpm exec convex run rarity:rerateSongs
export const rerateSongs = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("songs")
      .withIndex("by_spotifyStreams")
      .paginate({ cursor: cursor ?? null, numItems: rerateBatchSize })

    for (const song of page.page) {
      const rarity = rarityForStreams(song.spotifyStreams)
      if (rarity && rarity !== song.rarity) {
        await ctx.db.patch("songs", song._id, { rarity })
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.rarity.rerateSongs, {
        cursor: page.continueCursor,
      })
    }
    return null
  },
})
