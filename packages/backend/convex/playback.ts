import { v } from "convex/values"
import { Effect } from "effect"

import { internal } from "./_generated/api"
import { action, internalQuery } from "./_generated/server"
import { fetchDeezerPreview, searchDeezerPreview } from "./songs/_lib/deezer"

export const songSource = internalQuery({
  args: { songId: v.string() },
  handler: async (ctx, { songId }) => {
    const id = ctx.db.normalizeId("songs", songId)
    const song = id ? await ctx.db.get("songs", id) : null
    if (!song) {
      return null
    }

    const versions = song.isrc
      ? []
      : await ctx.db
          .query("songVersions")
          .withIndex("by_songId", (q) => q.eq("songId", song._id))
          .take(10)

    return {
      previewUrl: song.previewUrl,
      isrc: song.isrc ?? versions.find((version) => version.isrc)?.isrc,
      title: song.title,
      leadArtist: song.artistNames[0],
    }
  },
})

// The stored Spotify preview, else Deezer's: by ISRC, then by exact title and
// lead artist when that ISRC's release has no preview. Deezer URLs expire,
// so they're resolved at play time and never stored.
// shortcut: no ownership check while the web game runs on demo data; add one
// once authenticated players have real collections.
export const preview = action({
  args: { songId: v.string() },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    const source = await ctx.runQuery(internal.playback.songSource, args)
    if (!source) {
      return { url: null }
    }

    if (source.previewUrl) {
      return { url: source.previewUrl }
    }

    const byIsrc = source.isrc
      ? fetchDeezerPreview(source.isrc)
      : Effect.succeed(null)
    const url = await Effect.runPromise(
      byIsrc.pipe(
        Effect.flatMap((found) =>
          found || !source.leadArtist
            ? Effect.succeed(found)
            : searchDeezerPreview(source.title, source.leadArtist)
        ),
        Effect.catch(() => Effect.succeed(null))
      )
    )
    return { url }
  },
})
