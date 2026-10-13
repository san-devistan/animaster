// Run: node packages/backend/convex/rarity.check.mjs
import assert from "node:assert/strict"

import { drawRarity, godPackOdds, packOdds } from "./rarity.ts"

for (const odds of packOdds) {
  assert.equal(
    Object.values(odds).reduce((sum, chance) => sum + chance, 0),
    100
  )
}

const [first, , , fourth, last] = packOdds
assert.equal(drawRarity(fourth, 0), "legendary")
assert.equal(drawRarity(fourth, 0.999), "common")
for (let roll = 0; roll < 1; roll += 0.001) {
  assert.ok(["common", "rare"].includes(drawRarity(first, roll)))
  assert.notEqual(drawRarity(last, roll), "common")
}
for (const odds of godPackOdds) {
  for (let roll = 0; roll < 1; roll += 0.01) {
    assert.equal(drawRarity(odds, roll), "legendary")
  }
}
