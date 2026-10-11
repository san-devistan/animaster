// Run: node packages/backend/convex/songs/_lib/audiometa.check.mjs
import assert from "node:assert/strict"

import { toTrack } from "./audiometa.ts"

const artist = {
  id: "amart_9fP1hzeauMJQZ7gI",
  name: "Mark Ronson",
  external_urls: {},
}
const track = {
  id: "amtrk_rKDiAPGRsRY8bb21",
  name: "Uptown Funk (feat. Bruno Mars)",
  duration_ms: 269666,
  explicit: false,
  preview_url: null,
  artists: [artist],
  external_urls: {
    spotify: "https://open.spotify.com/track/57n3qOwXcoRMyGFjeqC1Rh",
  },
  images: [{ url: "https://i.scdn.co/image/a", height: null, width: null }],
  external_ids: { isrc: "GBARL1401524" },
  album: {
    id: "amalb_cif2mu2zaXHhBYFt",
    name: "Uptown Funk (Remixes) (feat. Bruno Mars)",
    album_type: "ep",
    total_tracks: null,
    images: [{ url: "https://i.scdn.co/image/a" }],
    release_date: "2015-04-13",
    release_date_precision: "day",
    artists: [artist],
    external_urls: {},
  },
  playcounts: { spotify: null, youtube: 12, soundcloud: null },
  audio_features: { tempo: 115, key: 0, energy: null },
}

const imported = toTrack(track)
assert.equal(imported.audiometaId, "amtrk_rKDiAPGRsRY8bb21")
assert.equal(imported.previewUrl, null)
assert.deepEqual(imported.playcounts, track.playcounts)
assert.deepEqual(imported.audioFeatures, track.audio_features)
assert.deepEqual(imported.externalIds, { isrc: "GBARL1401524" })
assert.deepEqual(imported.artists, [
  {
    audiometaId: "amart_9fP1hzeauMJQZ7gI",
    name: "Mark Ronson",
    externalUrls: {},
  },
])
// Album images without size get explicit nulls.
assert.deepEqual(imported.album?.images, [
  { url: "https://i.scdn.co/image/a", width: null, height: null },
])
assert.equal(imported.album?.totalTracks, null)

// Tracks without an album or features keep null and empty records.
const bare = toTrack({
  ...track,
  album: null,
  playcounts: null,
  audio_features: null,
})
assert.equal(bare.album, null)
assert.deepEqual(bare.playcounts, {})
assert.deepEqual(bare.audioFeatures, {})
