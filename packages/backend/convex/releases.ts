import { v } from "convex/values"

import { internalMutation, internalQuery } from "./_generated/server"

// Songs whose release date was not checked against the web yet, most streamed first.
// Run: pnpm exec convex run releases:unreviewed '{"limit":50}'
export const unreviewed = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const songs = await ctx.db
      .query("songs")
      .withIndex("by_reviewed_and_spotifyStreams", (q) =>
        q.eq("reviewed", false)
      )
      .order("desc")
      .take(limit)
    return songs.map((song) => ({
      songId: song._id,
      title: song.title,
      artist: song.artistNames[0],
      releaseDate: song.releaseDate,
    }))
  },
})

// Saves the web check: reviewed true (date confirmed or taken from the web) or null (to check by hand).
export const saveReviewed = internalMutation({
  args: {
    results: v.array(
      v.object({
        songId: v.id("songs"),
        reviewed: v.union(v.literal(true), v.null()),
        webDate: v.optional(v.string()),
        releaseDate: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { results }) => {
    for (const { songId, reviewed, webDate, releaseDate } of results) {
      if (await ctx.db.get("songs", songId)) {
        await ctx.db.patch("songs", songId, {
          reviewed,
          webDate,
          ...(releaseDate ? { releaseDate } : {}),
        })
      }
    }
    return results.length
  },
})

// Songs left for a manual check, with both dates side by side.
// Run: pnpm exec convex run releases:toReview
export const toReview = internalQuery({
  args: {},
  handler: async (ctx) => {
    const songs = await ctx.db
      .query("songs")
      .withIndex("by_reviewed_and_spotifyStreams", (q) =>
        q.eq("reviewed", null)
      )
      .order("desc")
      .take(1000)
    return songs.map((song) => ({
      songId: song._id,
      title: song.title,
      artist: song.artistNames[0],
      releaseDate: song.releaseDate,
      webDate: song.webDate,
    }))
  },
})

// Manual review: sets the right date and marks the song reviewed.
// Run: pnpm exec convex run releases:setDates '{"dates":[{"songId":"…","releaseDate":"2019-11-29"}]}'
export const setDates = internalMutation({
  args: {
    dates: v.array(
      v.object({ songId: v.id("songs"), releaseDate: v.string() })
    ),
  },
  handler: async (ctx, { dates }) => {
    let saved = 0
    for (const { songId, releaseDate } of dates) {
      if (
        /^\d{4}-\d{2}-\d{2}$/.test(releaseDate) &&
        (await ctx.db.get("songs", songId))
      ) {
        await ctx.db.patch("songs", songId, { releaseDate, reviewed: true })
        saved += 1
      }
    }
    return saved
  },
})
