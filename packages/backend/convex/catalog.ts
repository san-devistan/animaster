import { v } from "convex/values"
import { Effect } from "effect"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server"
import { saveTracks } from "./ingest"
import {
  apiKeyCount,
  fetchArtistTrackIds,
  fetchTempoTracks,
  fetchTracks,
  pageSize,
} from "./songs/_lib/audiometa"
import { lastBpm, mayAddArtists, nextTempoCursor } from "./songs/_lib/crawl"
import { importPhase, importedTrack } from "./songs/_lib/validators"

// Imports the Audiometa catalog into songs_v2, albums_v2 and artists_v2.
// Phase 1 (tempo): one worker per API key crawls /tracks/by-tempo, 1-BPM
// buckets 0-399. Phase 2 (artists): each worker then claims artists with
// exploredAt null and lists their tracks, which finds tracks without audio
// features. New artists found there join the queue, until none is left.
// Run: pnpm exec convex run catalog:startImport. Progress is in importRuns.

// ~0.8 s per request plus latency keeps each key under its 100 requests/minute.
const requestDelayMs = 800
// A failed step is retried this many times in a row (~30 min) before the worker stops.
const maxFailures = 6
const retryDelayMs = 5 * 60_000
// Wait before re-checking an empty artist queue while other workers may still add artists.
const idleDelayMs = 30_000

async function scheduleStep(
  ctx: MutationCtx,
  runId: Id<"importRuns">,
  delayMs: number
) {
  await ctx.scheduler.runAfter(delayMs, internal.catalog.step, { runId })
}

async function finishRun(ctx: MutationCtx, runId: Id<"importRuns">) {
  await ctx.db.patch("importRuns", runId, {
    status: "done",
    finishedAt: Date.now(),
  })
}

// One worker per API key; worker i crawls BPM fromBpm+i, +workers, ...
// skipTempo starts straight at the artists phase.
export const startImport = internalMutation({
  args: {
    fromBpm: v.optional(v.number()),
    toBpm: v.optional(v.number()),
    skipTempo: v.optional(v.boolean()),
    // Defaults to one worker per API key.
    workers: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const running = await ctx.db
      .query("importRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(50)
    if (running.length > 0) {
      return running.map((run) => run._id)
    }

    const fromBpm = args.fromBpm ?? 0
    const toBpm = Math.min(args.toBpm ?? lastBpm, lastBpm)
    if (fromBpm < 0 || fromBpm > toBpm) {
      throw new Error("fromBpm must be between 0 and toBpm")
    }

    // A new run explores every artist again: their track lists can grow.
    if (!args.skipTempo) {
      await ctx.scheduler.runAfter(0, internal.catalog.resetExplored, {})
    }

    const workers = Math.min(
      args.workers ?? apiKeyCount(),
      apiKeyCount(),
      toBpm - fromBpm + 1
    )
    if (!Number.isInteger(workers) || workers < 1) {
      throw new Error("workers must be a positive integer")
    }
    const runIds = []
    for (let keyIndex = 0; keyIndex < workers; keyIndex += 1) {
      const runId = await ctx.db.insert("importRuns", {
        status: "running",
        phase: args.skipTempo ? "artists" : "tempo",
        keyIndex,
        bpm: fromBpm + keyIndex,
        bpmStep: workers,
        toBpm,
        artistId: null,
        offset: 0,
        imported: 0,
        failures: 0,
        startedAt: Date.now(),
      })
      await scheduleStep(ctx, runId, 0)
      runIds.push(runId)
    }
    return runIds
  },
})

const resetBatchSize = 500

// Marks every artist as not explored, in batches.
export const resetExplored = internalMutation({
  args: {},
  handler: async (ctx) => {
    const page = await ctx.db
      .query("artists_v2")
      .withIndex("by_exploredAt", (q) => q.gt("exploredAt", null))
      .take(resetBatchSize)
    for (const artist of page) {
      await ctx.db.patch("artists_v2", artist._id, { exploredAt: null })
    }
    if (page.length === resetBatchSize) {
      await ctx.scheduler.runAfter(0, internal.catalog.resetExplored, {})
    }
    return null
  },
})

export const getRun = internalQuery({
  args: { runId: v.id("importRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("importRuns", runId)
    const artist = run?.artistId
      ? await ctx.db.get("artists_v2", run.artistId)
      : null
    return run ? { run, audiometaId: artist?.audiometaId ?? null } : null
  },
})

// Track IDs not in songs_v2 yet, so the artists phase only fetches new tracks.
export const unknownTrackIds = internalQuery({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, { ids }) => {
    const found = await Promise.all(
      ids.map((audiometaId) =>
        ctx.db
          .query("songs_v2")
          .withIndex("by_audiometaId", (q) => q.eq("audiometaId", audiometaId))
          .first()
      )
    )
    return ids.filter((_, index) => !found[index])
  },
})

export const step = internalAction({
  args: { runId: v.id("importRuns") },
  handler: async (ctx, { runId }) => {
    const loaded = await ctx.runQuery(internal.catalog.getRun, { runId })
    if (loaded?.run.status !== "running") {
      return null
    }
    try {
      await runStep(ctx, loaded.run, loaded.audiometaId)
    } catch (error) {
      // Any unexpected error is retried by fail, never left stuck as running.
      await ctx.runMutation(internal.catalog.fail, {
        runId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return null
  },
})

async function runStep(
  ctx: ActionCtx,
  run: Doc<"importRuns">,
  audiometaId: string | null
) {
  const runId = run._id
  if (run.phase === "artists" && (!run.artistId || !audiometaId)) {
    await ctx.runMutation(internal.catalog.claimArtist, { runId })
    return
  }

  // Phase 1: a tempo bucket page. Phase 2: one page of the artist's tracks,
  // fetching in full only the tracks not stored yet.
  const fetchPage =
    run.phase === "tempo" || !audiometaId
      ? fetchTempoTracks(run.keyIndex, run.bpm, run.offset)
      : Effect.gen(function* () {
          const page = yield* fetchArtistTrackIds(
            run.keyIndex,
            audiometaId,
            run.offset
          )
          const ids = yield* Effect.promise(() =>
            ctx.runQuery(internal.catalog.unknownTrackIds, { ids: page.ids })
          )
          return {
            tracks: yield* fetchTracks(run.keyIndex, ids),
            hasMore: page.hasMore,
            requests: ids.length > 0 ? 2 : 1,
          }
        })

  const result = await Effect.runPromise(
    fetchPage.pipe(
      Effect.map((page) => ({ ok: true as const, page })),
      Effect.catch((error) =>
        Effect.succeed({ ok: false as const, error: error.message })
      )
    )
  )

  if (!result.ok) {
    await ctx.runMutation(internal.catalog.fail, {
      runId,
      error: result.error,
    })
    return
  }

  await ctx.runMutation(internal.catalog.savePage, {
    runId,
    phase: run.phase,
    bpm: run.bpm,
    artistId: run.artistId,
    offset: run.offset,
    ...result.page,
  })
}

export const savePage = internalMutation({
  args: {
    runId: v.id("importRuns"),
    phase: importPhase,
    bpm: v.number(),
    artistId: v.union(v.id("artists_v2"), v.null()),
    offset: v.number(),
    hasMore: v.boolean(),
    requests: v.number(),
    tracks: v.array(importedTrack),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("importRuns", args.runId)
    // A stale or duplicate step must not save the same page twice.
    if (
      run?.status !== "running" ||
      run.phase !== args.phase ||
      run.bpm !== args.bpm ||
      run.artistId !== args.artistId ||
      run.offset !== args.offset
    ) {
      return null
    }

    const imported = run.imported + (await saveTracks(ctx, args.tracks))
    const delayMs = args.requests * requestDelayMs

    if (run.phase === "tempo") {
      const next = nextTempoCursor(run, args.hasMore, pageSize)
      // After the last bucket the worker moves on to the artists phase.
      await ctx.db.patch("importRuns", run._id, {
        ...(next.finished
          ? { phase: "artists" as const, artistId: null, offset: 0 }
          : { bpm: next.bpm, offset: next.offset }),
        imported,
        failures: 0,
      })
    } else {
      await ctx.db.patch("importRuns", run._id, {
        ...(args.hasMore
          ? { offset: args.offset + pageSize }
          : { artistId: null, offset: 0 }),
        imported,
        failures: 0,
      })
    }
    await scheduleStep(ctx, run._id, delayMs)
    return null
  },
})

// Takes the next unexplored artist. When none is left, the worker waits
// while other workers can still add artists, then finishes.
export const claimArtist = internalMutation({
  args: { runId: v.id("importRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("importRuns", runId)
    if (run?.status !== "running" || run.phase !== "artists" || run.artistId) {
      return null
    }

    const artist = await ctx.db
      .query("artists_v2")
      .withIndex("by_exploredAt", (q) => q.eq("exploredAt", null))
      .first()

    if (artist) {
      await ctx.db.patch("artists_v2", artist._id, { exploredAt: Date.now() })
      await ctx.db.patch("importRuns", runId, {
        artistId: artist._id,
        offset: 0,
      })
      await scheduleStep(ctx, runId, 0)
      return null
    }

    const running = await ctx.db
      .query("importRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(50)
    const othersBusy = running.some(
      (other) => other._id !== runId && mayAddArtists(other)
    )
    if (othersBusy) {
      await scheduleStep(ctx, runId, idleDelayMs)
    } else {
      await finishRun(ctx, runId)
    }
    return null
  },
})

// Retries a failed step after a pause; stops the worker after maxFailures.
export const fail = internalMutation({
  args: { runId: v.id("importRuns"), error: v.string() },
  handler: async (ctx, { runId, error }) => {
    const run = await ctx.db.get("importRuns", runId)
    if (run?.status !== "running") {
      return null
    }

    const failures = run.failures + 1
    if (failures < maxFailures) {
      await ctx.db.patch("importRuns", runId, { failures, error })
      await scheduleStep(ctx, runId, retryDelayMs)
      return null
    }

    await ctx.db.patch("importRuns", runId, {
      status: "failed",
      failures,
      error,
      finishedAt: Date.now(),
    })
    return null
  },
})

// Continues a failed worker from the page where it stopped.
// Run: pnpm exec convex run catalog:resume '{"runId": "..."}'
export const resume = internalMutation({
  args: { runId: v.id("importRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("importRuns", runId)
    if (run?.status !== "failed") {
      return null
    }

    await ctx.db.patch("importRuns", runId, {
      status: "running",
      failures: 0,
      error: undefined,
      finishedAt: undefined,
    })
    await scheduleStep(ctx, runId, 0)
    return null
  },
})

// Stops every running worker; their next step sees the status and exits.
// Run: pnpm exec convex run catalog:stopImport
export const stopImport = internalMutation({
  args: {},
  handler: async (ctx) => {
    const running = await ctx.db
      .query("importRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(50)
    for (const run of running) {
      await ctx.db.patch("importRuns", run._id, {
        status: "failed",
        error: "stopped by hand",
        finishedAt: Date.now(),
      })
    }
    return running.length
  },
})
