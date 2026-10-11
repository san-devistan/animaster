// Run: node packages/backend/convex/songs/_lib/deezer.check.mjs
import assert from "node:assert/strict"
import { registerHooks } from "node:module"

// deezer.ts imports "./dedupe" extensionless, which only Convex's bundler
// resolves; this maps it to the .ts file for Node.
registerHooks({
  resolve: (specifier, context, next) =>
    /^\.\/[\w-]+$/.test(specifier)
      ? next(`${specifier}.ts`, context)
      : next(specifier, context),
})
/** @type {typeof import("./deezer.ts")} */
const deezer = await import("./deezer.ts")
const { deezerMatch } = deezer

/** @type {(title: string, artist: string, preview?: string, readable?: boolean) => object} */
const track = (
  title,
  artist,
  preview = "https://preview",
  readable = true
) => ({
  title,
  artist: { name: artist },
  preview,
  readable,
})

// Deezer's search for "Taki Taki DJ Snake", trimmed.
const results = [
  track(
    "Taki Taki (DJ Snake feat Selena Gomez, Ozuna & Cardi B Cover Mix)",
    "Estelle Brand"
  ),
  track(
    "Taki Taki (Originally Performed By Dj Snake, Selena Gomez, Ozuna, Cardi B) (Karaoke Version)",
    "B Lou"
  ),
  track("Taki Taki", "DJ Snake", "", false),
  track("Taki Taki", "DJ Snake", "https://original"),
]

assert.equal(
  deezerMatch(
    results,
    "Taki Taki (with Selena Gomez, Ozuna & Cardi B)",
    "DJ Snake"
  )?.preview,
  "https://original"
)
assert.equal(
  deezerMatch(results.slice(0, 3), "Taki Taki", "DJ Snake"),
  undefined
)
assert.equal(deezerMatch(results, "Taki Taki", "Selena Gomez"), undefined)
