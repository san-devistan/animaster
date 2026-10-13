// Yearly English Wikipedia views a species needs for each rarity. Fixed
// counts, set so that in October 2026 about 2% were legendary, 8% epic and
// 25% rare, so one card rising never pushes another down.
export type Rarity = "common" | "rare" | "epic" | "legendary"

const RARITY_VIEWS: [Rarity, number][] = [
  ["legendary", 25000],
  ["epic", 2500],
  ["rare", 330],
]
const RANK: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
}

export const rarityRank = (rarity: Rarity) => RANK[rarity]

export const rarityFromViews = (views: number): Rarity =>
  RARITY_VIEWS.find(([, min]) => views >= min)?.[0] ?? "common"

// Rarity only goes up: a card keeps its best rarity when its views drop.
export const nextRarity = (views: number, stored?: Rarity): Rarity => {
  const fromViews = rarityFromViews(views)
  return stored && RANK[stored] > RANK[fromViews] ? stored : fromViews
}

type Odds = Partial<Record<Rarity, number>>

// A pack's five cards, each with its own odds (in %): commons first, then a
// last card that is always rare or better.
export const packOdds: ReadonlyArray<Odds> = [
  { common: 90, rare: 10 },
  { common: 85, rare: 12, epic: 3 },
  { common: 65, rare: 27, epic: 8 },
  { common: 85, rare: 12, epic: 2.5, legendary: 0.5 },
  { rare: 70, epic: 24, legendary: 6 },
]

// One pack in 1,000 is a god pack: all five cards legendary.
export const godPackChance = 0.001
export const godPackOdds: ReadonlyArray<Odds> = packOdds.map(() => ({
  legendary: 100,
}))

// The rarity a roll in [0, 1) gives under `odds`, rarest first.
export function drawRarity(odds: Odds, roll: number): Rarity {
  const rarities: ReadonlyArray<Rarity> = [
    "legendary",
    "epic",
    "rare",
    "common",
  ]
  const total = rarities.reduce((sum, rarity) => sum + (odds[rarity] ?? 0), 0)
  let threshold = roll * total
  for (const rarity of rarities) {
    threshold -= odds[rarity] ?? 0
    if (threshold < 0) return rarity
  }
  return rarities.findLast((rarity) => odds[rarity]) ?? "common"
}
