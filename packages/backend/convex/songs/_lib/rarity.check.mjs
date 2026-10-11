// Run: node packages/backend/convex/songs/_lib/rarity.check.mjs
import assert from "node:assert/strict"

import { drawRarity, rarityForStreams, rarityWeights } from "./rarity.ts"

assert.equal(rarityForStreams(99_999_999), undefined)
assert.equal(rarityForStreams(100_000_000), "common")
assert.equal(rarityForStreams(399_999_999), "common")
assert.equal(rarityForStreams(400_000_000), "rare")
assert.equal(rarityForStreams(1_000_000_000), "epic")
assert.equal(rarityForStreams(2_000_000_000), "legendary")

const total = Object.values(rarityWeights).reduce((sum, w) => sum + w, 0)
assert.deepEqual(
  Object.fromEntries(
    Object.entries(rarityWeights).map(([rarity, w]) => [rarity, w / total])
  ),
  { common: 0.85, rare: 0.12, epic: 0.025, legendary: 0.005 }
)
assert.equal(drawRarity(0), "legendary")
assert.equal(drawRarity(0.999), "common")
