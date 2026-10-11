import { Effect, Schedule, Schema } from "effect"

import type { ImportedAlbum, ImportedArtist, ImportedTrack } from "./validators"

const baseUrl = "https://api.audiometa.io/v1"
// Max page size and max IDs per /tracks?ids= call.
export const pageSize = 50

export class AudiometaError extends Schema.TaggedError<AudiometaError>()(
  "AudiometaError",
  { message: Schema.String, status: Schema.optional(Schema.Number) }
) {}

class HttpStatusError extends Error {
  readonly status: number

  constructor(status: number, path: string) {
    super(`${status} on ${path}`)
    this.status = status
  }
}

const NullableNumber = Schema.NullOr(Schema.Number)
const NullableString = Schema.NullOr(Schema.String)
const Strings = Schema.Record(Schema.String, Schema.String)
const Numbers = Schema.Record(Schema.String, NullableNumber)

const Image = Schema.Struct({
  url: Schema.String,
  width: Schema.optional(NullableNumber),
  height: Schema.optional(NullableNumber),
})

const Artist = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  external_urls: Schema.optional(Strings),
})

const Album = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  album_type: Schema.optional(NullableString),
  total_tracks: Schema.optional(NullableNumber),
  images: Schema.Array(Image),
  release_date: Schema.optional(NullableString),
  release_date_precision: Schema.optional(NullableString),
  artists: Schema.Array(Artist),
  external_urls: Schema.optional(Strings),
})

const Track = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  duration_ms: Schema.optional(NullableNumber),
  explicit: Schema.optional(Schema.NullOr(Schema.Boolean)),
  preview_url: Schema.optional(NullableString),
  artists: Schema.Array(Artist),
  external_urls: Schema.optional(Strings),
  images: Schema.Array(Image),
  external_ids: Schema.optional(Strings),
  album: Schema.optional(Schema.NullOr(Album)),
  playcounts: Schema.optional(Schema.NullOr(Numbers)),
  audio_features: Schema.optional(Schema.NullOr(Numbers)),
})

const IdPage = Schema.Struct({
  items: Schema.Array(Schema.Struct({ id: Schema.String })),
  next: Schema.optional(NullableString),
})

const TracksResponse = Schema.Struct({
  tracks: Schema.Array(Schema.NullOr(Track)),
})

type Track = typeof Track.Type

function isRetryable(error: AudiometaError) {
  return (
    error.status === undefined || error.status === 429 || error.status >= 500
  )
}

const getJson = Effect.fn("audiometaGet")(function* <S extends Schema.Top>(
  apiKey: string,
  path: string,
  schema: S
) {
  const body = yield* Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(`${baseUrl}${path}`, {
        signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      })
      if (!response.ok) {
        throw new HttpStatusError(response.status, path)
      }
      return (await response.json()) as unknown
    },
    catch: (error) =>
      new AudiometaError({
        message: error instanceof Error ? error.message : String(error),
        status: error instanceof HttpStatusError ? error.status : undefined,
      }),
  }).pipe(
    Effect.timeout("45 seconds"),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail(new AudiometaError({ message: `Timed out on ${path}` }))
    ),
    Effect.retry({
      times: 6,
      schedule: Schedule.exponential("2 seconds"),
      while: isRetryable,
    })
  )

  return yield* Schema.decodeUnknownEffect(schema)(body).pipe(
    Effect.mapError(
      (error) => new AudiometaError({ message: `${path}: ${error.message}` })
    )
  )
})

// AUDIOMETA_API_KEY holds one key or a comma-separated list (one per worker).
function apiKeys() {
  return (process.env.AUDIOMETA_API_KEY ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
}

export function apiKeyCount() {
  return Math.max(1, apiKeys().length)
}

function readApiKey(index: number) {
  const apiKey = apiKeys()[index % apiKeyCount()]
  return apiKey
    ? Effect.succeed(apiKey)
    : Effect.fail(
        new AudiometaError({ message: "AUDIOMETA_API_KEY is not set" })
      )
}

const toImage = (image: typeof Image.Type) => ({
  url: image.url,
  width: image.width ?? null,
  height: image.height ?? null,
})

const toArtist = (artist: typeof Artist.Type): ImportedArtist => ({
  audiometaId: artist.id,
  name: artist.name,
  externalUrls: artist.external_urls ?? {},
})

const toAlbum = (album: typeof Album.Type): ImportedAlbum => ({
  audiometaId: album.id,
  name: album.name,
  artists: album.artists.map(toArtist),
  albumType: album.album_type ?? null,
  totalTracks: album.total_tracks ?? null,
  images: album.images.map(toImage),
  releaseDate: album.release_date ?? null,
  releaseDatePrecision: album.release_date_precision ?? null,
  externalUrls: album.external_urls ?? {},
})

export function toTrack(track: Track): ImportedTrack {
  return {
    audiometaId: track.id,
    name: track.name,
    album: track.album ? toAlbum(track.album) : null,
    artists: track.artists.map(toArtist),
    audioFeatures: track.audio_features ?? {},
    durationMs: track.duration_ms ?? null,
    explicit: track.explicit ?? null,
    previewUrl: track.preview_url ?? null,
    playcounts: track.playcounts ?? {},
    externalUrls: track.external_urls ?? {},
    externalIds: track.external_ids ?? {},
    images: track.images.map(toImage),
  }
}

// Full tracks, with their embedded album and artists. At most pageSize IDs.
export const fetchTracks = Effect.fn("fetchTracks")(function* (
  keyIndex: number,
  ids: ReadonlyArray<string>
) {
  if (ids.length === 0) {
    return []
  }
  const apiKey = yield* readApiKey(keyIndex)
  const { tracks } = yield* getJson(
    apiKey,
    `/tracks?ids=${ids.join(",")}`,
    TracksResponse
  )
  return tracks.flatMap((track) => (track ? [toTrack(track)] : []))
})

// One page of a 1-BPM bucket, most popular first, as full tracks. Buckets
// keep offsets shallow (~12k max) instead of paging ~380k tracks deep.
export const fetchTempoTracks = Effect.fn("fetchTempoTracks")(function* (
  keyIndex: number,
  bpm: number,
  offset: number
) {
  const apiKey = yield* readApiKey(keyIndex)
  const page = yield* getJson(
    apiKey,
    `/tracks/by-tempo?tempo_min=${bpm}&tempo_max=${bpm}.9999&sort=popularity&order=desc&limit=${pageSize}&offset=${offset}`,
    IdPage
  )
  return {
    tracks: yield* fetchTracks(
      keyIndex,
      page.items.map((item) => item.id)
    ),
    hasMore: Boolean(page.next),
    requests: page.items.length > 0 ? 2 : 1,
  }
})

// One page of an artist's track IDs, including tracks they are featured on.
// Finds tracks without audio features, which /tracks/by-tempo never lists.
export const fetchArtistTrackIds = Effect.fn("fetchArtistTrackIds")(function* (
  keyIndex: number,
  artistId: string,
  offset: number
) {
  const apiKey = yield* readApiKey(keyIndex)
  const page = yield* getJson(
    apiKey,
    `/artists/${artistId}/tracks?limit=${pageSize}&offset=${offset}`,
    IdPage
  ).pipe(
    // A removed or merged-away artist has nothing left to list.
    Effect.catchIf(
      (error) => error.status === 404,
      () => Effect.succeed({ items: [], next: null })
    )
  )
  return { ids: page.items.map((item) => item.id), hasMore: Boolean(page.next) }
})
