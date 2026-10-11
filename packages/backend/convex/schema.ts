import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

import {
  albumDetails,
  artistDetails,
  image,
  importPhase,
  songDetails,
  songRarity,
} from "./songs/_lib/validators"

export default defineSchema({
  songs: defineTable({
    songKey: v.string(),
    sourceId: v.string(),
    title: v.string(),
    artistNames: v.array(v.string()),
    // Credited artists in order, lead first (same order as artistNames). Filled by imports and the artist backfill.
    artistIds: v.optional(v.array(v.id("artists"))),
    imageUrl: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    isrc: v.optional(v.string()),
    spotifyStreams: v.number(),
    rarity: songRarity,
    bpm: v.optional(v.number()),
    // Earliest known release of the recording (YYYY, YYYY-MM or YYYY-MM-DD).
    releaseDate: v.optional(v.string()),
    // Web check (scripts/web-release-dates.mjs): false = not checked yet, true = releaseDate confirmed,
    // null = no date found, to check by hand.
    reviewed: v.union(v.boolean(), v.null()),
    // Release date found by the web check (YYYY-MM-DD).
    webDate: v.optional(v.string()),
    details: v.optional(songDetails),
    randomKey: v.number(),
    syncedAt: v.number(),
  })
    .index("by_songKey", ["songKey"])
    .index("by_spotifyStreams", ["spotifyStreams"])
    .index("by_rarity_and_randomKey", ["rarity", "randomKey"])
    .index("by_reviewed_and_spotifyStreams", ["reviewed", "spotifyStreams"]),
  songs_v2: defineTable({
    // Audiometa track id (amtrk_...).
    audiometaId: v.string(),
    name: v.string(),
    // Each Audiometa track belongs to at most one album release; null when the API has none.
    albumId: v.union(v.id("albums_v2"), v.null()),
    // Credited artists in order, lead first.
    artistIds: v.array(v.id("artists_v2")),
    // From audio_features (tempo, key, mode, energy, ...), null kept as the API returns it.
    audioFeatures: v.record(v.string(), v.union(v.number(), v.null())),
    durationMs: v.union(v.number(), v.null()),
    explicit: v.union(v.boolean(), v.null()),
    previewUrl: v.union(v.string(), v.null()),
    // Keyed by platform (spotify, youtube, soundcloud), null kept as the API returns it.
    playcounts: v.record(v.string(), v.union(v.number(), v.null())),
    // From external_urls, keyed by platform (spotify, musicbrainz, ...).
    externalUrls: v.record(v.string(), v.string()),
    // From external_ids, keyed by id type (isrc, ...).
    externalIds: v.record(v.string(), v.string()),
    images: v.array(image),
  })
    .index("by_audiometaId", ["audiometaId"])
    .index("by_albumId", ["albumId"]),
  albums_v2: defineTable({
    // Audiometa album id (amalb_...).
    audiometaId: v.string(),
    name: v.string(),
    // Album artists in order, lead first.
    artistIds: v.array(v.id("artists_v2")),
    // album, single, ep or compilation.
    albumType: v.union(v.string(), v.null()),
    // From total_tracks; usually null in track responses.
    totalTracks: v.union(v.number(), v.null()),
    images: v.array(image),
    // YYYY, YYYY-MM or YYYY-MM-DD, see releaseDatePrecision.
    releaseDate: v.union(v.string(), v.null()),
    // year, month or day.
    releaseDatePrecision: v.union(v.string(), v.null()),
    externalUrls: v.record(v.string(), v.string()),
  }).index("by_audiometaId", ["audiometaId"]),
  artists_v2: defineTable({
    // Audiometa artist id (amart_...).
    audiometaId: v.string(),
    name: v.string(),
    externalUrls: v.record(v.string(), v.string()),
    // When an import worker claimed the artist to list its tracks; null = not explored yet.
    exploredAt: v.union(v.number(), v.null()),
  })
    .index("by_audiometaId", ["audiometaId"])
    .index("by_exploredAt", ["exploredAt"]),
  // Progress of the Audiometa import (catalog.ts): one row per worker (API key).
  importRuns: defineTable({
    status: v.union(
      v.literal("running"),
      v.literal("done"),
      v.literal("failed")
    ),
    phase: importPhase,
    keyIndex: v.number(),
    // Worker crawls bpm, bpm + bpmStep, ... up to toBpm, one 1-BPM bucket at a time.
    bpm: v.number(),
    bpmStep: v.number(),
    toBpm: v.number(),
    // Artist whose tracks the worker is listing in the artists phase.
    artistId: v.union(v.id("artists_v2"), v.null()),
    // Page offset in the current BPM bucket or artist track list.
    offset: v.number(),
    // New songs added by this worker.
    imported: v.number(),
    // Consecutive failed steps; the worker retries until maxFailures.
    failures: v.number(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_status", ["status"]),
  songVersions: defineTable({
    sourceId: v.string(),
    songId: v.id("songs"),
    title: v.string(),
    isrc: v.optional(v.string()),
    spotifyStreams: v.number(),
  })
    .index("by_sourceId", ["sourceId"])
    .index("by_songId", ["songId"]),
  albums: defineTable({
    sourceId: v.string(),
    name: v.string(),
    albumType: v.optional(v.string()),
    releaseDate: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    artistNames: v.array(v.string()),
    artistIds: v.optional(v.array(v.id("artists"))),
    // Set by the old enrichment backfill (removed); missing on rows it never reached.
    details: v.optional(albumDetails),
    enrichedAt: v.optional(v.number()),
  })
    .index("by_sourceId", ["sourceId"])
    .index("by_enrichedAt", ["enrichedAt"]),
  artists: defineTable({
    sourceId: v.string(),
    name: v.string(),
    // Set by the old enrichment backfill (removed); missing on rows it never reached.
    details: v.optional(artistDetails),
    enrichedAt: v.optional(v.number()),
  })
    .index("by_sourceId", ["sourceId"])
    .index("by_enrichedAt", ["enrichedAt"]),
  songArtists: defineTable({
    songId: v.id("songs"),
    artistId: v.id("artists"),
    // 0 = lead artist.
    position: v.number(),
  })
    .index("by_songId_and_artistId", ["songId", "artistId"])
    .index("by_artistId", ["artistId"]),
  songAlbums: defineTable({
    songId: v.id("songs"),
    albumId: v.id("albums"),
  })
    .index("by_songId_and_albumId", ["songId", "albumId"])
    .index("by_albumId", ["albumId"]),
  species: defineTable({
    // Catalogue of Life taxon id (5K5M9 = Bengal tiger), the source of truth
    // for which taxa exist; only accepted, living animals are kept.
    colId: v.string(),
    // Wikidata item id (Q15069 = Bengal tiger), links COL to Wikipedia/Commons.
    wikidataId: v.string(),
    // Accepted name in Catalogue of Life.
    scientificName: v.string(),
    // e.g. "(Linnaeus, 1758)".
    authorship: v.union(v.string(), v.null()),
    // subspecies for now.
    rank: v.string(),
    // From the COL classification.
    taxonomy: v.object({
      class: v.union(v.string(), v.null()),
      order: v.union(v.string(), v.null()),
      family: v.union(v.string(), v.null()),
      species: v.union(v.string(), v.null()),
    }),
    // English Wikipedia title, the card's common name.
    name: v.string(),
    // First sentences of the English Wikipedia article (CC BY-SA).
    summary: v.union(v.string(), v.null()),
    // Wikimedia Commons file; each has its own license, credit the file page.
    imageUrl: v.string(),
    imageFile: v.string(),
    wikipediaUrl: v.string(),
    // Wikipedia editions with an article, what rarity is based on.
    sitelinks: v.number(),
    rarity: songRarity,
    randomKey: v.number(),
    syncedAt: v.number(),
  })
    .index("by_colId", ["colId"])
    .index("by_sitelinks", ["sitelinks"])
    .index("by_rarity_and_randomKey", ["rarity", "randomKey"]),
})
