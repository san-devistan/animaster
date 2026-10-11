// Same tiers as songs.rarity, so packs can draw either catalog.
type Rarity = "common" | "rare" | "epic" | "legendary"

// Sitelinks = Wikipedia editions with an article, a proxy for how well known
// a taxon is. Of ~1k animal subspecies with an image and English article:
// 9 have 80+, 29 have 50+, 94 have 30+.
const tiers: ReadonlyArray<{ rarity: Rarity; minSitelinks: number }> = [
  { rarity: "legendary", minSitelinks: 80 },
  { rarity: "epic", minSitelinks: 50 },
  { rarity: "rare", minSitelinks: 30 },
]

export function rarityForSitelinks(sitelinks: number): Rarity {
  return (
    tiers.find((tier) => sitelinks >= tier.minSitelinks)?.rarity ?? "common"
  )
}
