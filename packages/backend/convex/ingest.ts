import type { Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import type {
  ImportedAlbum,
  ImportedArtist,
  ImportedTrack,
} from "./songs/_lib/validators"

// Upserts imported tracks with their album and artists, matched by audiometaId.

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

async function upsertArtist(ctx: MutationCtx, artist: ImportedArtist) {
  const existing = await ctx.db
    .query("artists_v2")
    .withIndex("by_audiometaId", (q) => q.eq("audiometaId", artist.audiometaId))
    .unique()

  if (!existing) {
    return await ctx.db.insert("artists_v2", { ...artist, exploredAt: null })
  }
  // Skipping unchanged writes avoids conflicts between workers on shared artists.
  if (
    existing.name !== artist.name ||
    !sameValue(existing.externalUrls, artist.externalUrls)
  ) {
    await ctx.db.patch("artists_v2", existing._id, {
      name: artist.name,
      externalUrls: artist.externalUrls,
    })
  }
  return existing._id
}

async function upsertArtists(
  ctx: MutationCtx,
  artists: ReadonlyArray<ImportedArtist>
) {
  const ids: Array<Id<"artists_v2">> = []
  for (const artist of artists) {
    ids.push(await upsertArtist(ctx, artist))
  }
  return ids
}

async function upsertAlbum(ctx: MutationCtx, album: ImportedAlbum) {
  const { artists, ...fields } = album
  const row = { ...fields, artistIds: await upsertArtists(ctx, artists) }
  const existing = await ctx.db
    .query("albums_v2")
    .withIndex("by_audiometaId", (q) => q.eq("audiometaId", album.audiometaId))
    .unique()

  if (!existing) {
    return await ctx.db.insert("albums_v2", row)
  }
  const { _id, _creationTime, ...stored } = existing
  if (!sameValue(stored, row)) {
    await ctx.db.replace("albums_v2", _id, row)
  }
  return _id
}

// Returns true when the song is new.
async function saveTrack(ctx: MutationCtx, track: ImportedTrack) {
  const { album, artists, ...fields } = track
  const row = {
    ...fields,
    albumId: album ? await upsertAlbum(ctx, album) : null,
    artistIds: await upsertArtists(ctx, artists),
  }
  const existing = await ctx.db
    .query("songs_v2")
    .withIndex("by_audiometaId", (q) => q.eq("audiometaId", track.audiometaId))
    .unique()

  if (!existing) {
    await ctx.db.insert("songs_v2", row)
    return true
  }
  const { _id, _creationTime, ...stored } = existing
  if (!sameValue(stored, row)) {
    await ctx.db.replace("songs_v2", _id, row)
  }
  return false
}

export async function saveTracks(
  ctx: MutationCtx,
  tracks: ReadonlyArray<ImportedTrack>
) {
  let imported = 0
  for (const track of tracks) {
    if (await saveTrack(ctx, track)) {
      imported += 1
    }
  }
  return imported
}
