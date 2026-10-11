import type { SongRarity } from "./validators"

export const minSpotifyStreams = 100_000_000

// Tiers shrink ~3-4x each step, so per-song odds rise from common to legendary.
const tiers: ReadonlyArray<{ rarity: SongRarity; minStreams: number }> = [
  { rarity: "legendary", minStreams: 2_000_000_000 },
  { rarity: "epic", minStreams: 1_000_000_000 },
  { rarity: "rare", minStreams: 400_000_000 },
  { rarity: "common", minStreams: minSpotifyStreams },
]

export const rarityWeights: Record<SongRarity, number> = {
  common: 170,
  rare: 24,
  epic: 5,
  legendary: 1,
}

export const rarityOrder: ReadonlyArray<SongRarity> = [
  "legendary",
  "epic",
  "rare",
  "common",
]

// Songs under minSpotifyStreams get no rarity and stay out of packs.
export function rarityForStreams(streams: number): SongRarity | undefined {
  return tiers.find((tier) => streams >= tier.minStreams)?.rarity
}

export function drawRarity(roll: number): SongRarity {
  const total = rarityOrder.reduce(
    (sum, rarity) => sum + rarityWeights[rarity],
    0
  )
  let threshold = roll * total

  for (const rarity of rarityOrder) {
    threshold -= rarityWeights[rarity]
    if (threshold < 0) {
      return rarity
    }
  }

  return "common"
}
