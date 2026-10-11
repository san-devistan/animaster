// Run: node packages/backend/convex/songs/_lib/crawl.check.mjs
import assert from "node:assert/strict"

import { mayAddArtists, nextTempoCursor } from "./crawl.ts"

const run = { bpm: 120, bpmStep: 6, toBpm: 399, offset: 100 }
assert.deepEqual(nextTempoCursor(run, true, 50), {
  bpm: 120,
  offset: 150,
  finished: false,
})
assert.deepEqual(nextTempoCursor(run, false, 50), {
  bpm: 126,
  offset: 0,
  finished: false,
})
assert.deepEqual(nextTempoCursor({ ...run, bpm: 395 }, false, 50), {
  bpm: 401,
  offset: 0,
  finished: true,
})

assert.equal(mayAddArtists({ phase: "tempo", artistId: null }), true)
assert.equal(mayAddArtists({ phase: "artists", artistId: "a1" }), true)
assert.equal(mayAddArtists({ phase: "artists", artistId: null }), false)
