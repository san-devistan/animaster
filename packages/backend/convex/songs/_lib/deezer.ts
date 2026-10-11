import { Effect, Schema } from "effect"

import { displayTitle, normalizeText } from "./dedupe"

export class DeezerError extends Schema.TaggedError<DeezerError>()(
  "DeezerError",
  { message: Schema.String }
) {}

const Track = Schema.Struct({
  title: Schema.optional(Schema.String),
  readable: Schema.optional(Schema.Boolean),
  preview: Schema.optional(Schema.NullOr(Schema.String)),
  artist: Schema.optional(Schema.Struct({ name: Schema.String })),
})
type Track = typeof Track.Type
const Search = Schema.Struct({ data: Schema.Array(Track) })

const getJson = Effect.fn("deezerGet")(function* (url: string) {
  return yield* Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, { signal })
      return (await response.json()) as unknown
    },
    catch: (error) =>
      new DeezerError({
        message: error instanceof Error ? error.message : String(error),
      }),
  }).pipe(
    Effect.timeout("8 seconds"),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail(new DeezerError({ message: "Deezer timed out" }))
    )
  )
})

const decode = <S extends Schema.Top>(schema: S) =>
  Effect.fn("deezerDecode")(function* (body: unknown) {
    return yield* Schema.decodeUnknownEffect(schema)(body).pipe(
      Effect.mapError((error) => new DeezerError({ message: error.message }))
    )
  })

export const fetchDeezerPreview = Effect.fn("fetchDeezerPreview")(function* (
  isrc: string
) {
  const body = yield* getJson(
    `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`
  )
  const track = yield* decode(Track)(body)
  return track.preview || null
})

// The playable track in `tracks` with exactly this title and lead artist, so
// covers and karaoke versions never match.
export function deezerMatch(
  tracks: ReadonlyArray<Track>,
  title: string,
  artist: string
) {
  const wanted = normalizeText(displayTitle(title))
  const lead = normalizeText(artist)
  return tracks.find(
    (track) =>
      track.readable !== false &&
      Boolean(track.preview) &&
      normalizeText(displayTitle(track.title ?? "")) === wanted &&
      normalizeText(track.artist?.name ?? "") === lead
  )
}

// Some ISRCs only point at a release Deezer can't play (no preview); the same
// recording is often out again under another, found by title and artist.
export const searchDeezerPreview = Effect.fn("searchDeezerPreview")(function* (
  title: string,
  artist: string
) {
  const body = yield* getJson(
    `https://api.deezer.com/search?q=${encodeURIComponent(`${displayTitle(title)} ${artist}`)}&limit=10`
  )
  const { data } = yield* decode(Search)(body)
  return deezerMatch(data, title, artist)?.preview || null
})
