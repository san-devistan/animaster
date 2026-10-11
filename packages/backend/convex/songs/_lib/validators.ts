import { v, type Infer } from "convex/values"

export const songRarity = v.union(
  v.literal("common"),
  v.literal("rare"),
  v.literal("epic"),
  v.literal("legendary")
)

// Full artist from /artists: genres, bio, socials. Stored in artists.details.
export const artistDetails = v.object({
  imageUrl: v.optional(v.string()),
  popularity: v.optional(v.number()),
  genres: v.array(v.string()),
  countryCode: v.optional(v.string()),
  bio: v.optional(v.string()),
  spotifyUrl: v.optional(v.string()),
  followers: v.optional(v.number()),
  monthlyListeners: v.optional(v.number()),
  youtubeSubscribers: v.optional(v.number()),
  instagramFollowers: v.optional(v.number()),
  tiktokFollowers: v.optional(v.number()),
})

// Full album from /albums. Stored in albums.details.
export const albumDetails = v.object({
  releaseDatePrecision: v.optional(v.string()),
  totalTracks: v.optional(v.number()),
  label: v.optional(v.string()),
  upc: v.optional(v.string()),
  popularity: v.optional(v.number()),
  spotifyUrl: v.optional(v.string()),
})

export const songDetails = v.object({
  youtubePlays: v.optional(v.number()),
  soundcloudPlays: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  explicit: v.optional(v.boolean()),
  popularity: v.optional(v.number()),
  discNumber: v.optional(v.number()),
  trackNumber: v.optional(v.number()),
  musicalKey: v.optional(v.number()),
  mode: v.optional(v.number()),
  energy: v.optional(v.number()),
  danceability: v.optional(v.number()),
  valence: v.optional(v.number()),
  loudness: v.optional(v.number()),
  timeSignature: v.optional(v.number()),
  externalUrls: v.optional(v.record(v.string(), v.string())),
})

export type SongRarity = Infer<typeof songRarity>

// tempo: crawl /tracks/by-tempo; artists: list the tracks of each artist.
export const importPhase = v.union(v.literal("tempo"), v.literal("artists"))

// From images; width and height are null when the API omits them.
export const image = v.object({
  url: v.string(),
  width: v.union(v.number(), v.null()),
  height: v.union(v.number(), v.null()),
})

// Keyed by platform or id type, as the API returns them.
const strings = v.record(v.string(), v.string())
const numbers = v.record(v.string(), v.union(v.number(), v.null()))

export const importedArtist = v.object({
  audiometaId: v.string(),
  name: v.string(),
  externalUrls: strings,
})

export const importedAlbum = v.object({
  audiometaId: v.string(),
  name: v.string(),
  artists: v.array(importedArtist),
  albumType: v.union(v.string(), v.null()),
  totalTracks: v.union(v.number(), v.null()),
  images: v.array(image),
  releaseDate: v.union(v.string(), v.null()),
  releaseDatePrecision: v.union(v.string(), v.null()),
  externalUrls: strings,
})

// A track from /tracks?ids=, with its embedded album and artists.
export const importedTrack = v.object({
  audiometaId: v.string(),
  name: v.string(),
  album: v.union(importedAlbum, v.null()),
  artists: v.array(importedArtist),
  audioFeatures: numbers,
  durationMs: v.union(v.number(), v.null()),
  explicit: v.union(v.boolean(), v.null()),
  previewUrl: v.union(v.string(), v.null()),
  playcounts: numbers,
  externalUrls: strings,
  externalIds: strings,
  images: v.array(image),
})

export type Image = Infer<typeof image>
export type ImportedArtist = Infer<typeof importedArtist>
export type ImportedAlbum = Infer<typeof importedAlbum>
export type ImportedTrack = Infer<typeof importedTrack>
