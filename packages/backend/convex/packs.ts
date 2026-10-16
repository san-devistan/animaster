import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { playerId } from "./auth"
import {
  drawRarity,
  godPackChance,
  godPackOdds,
  packOdds,
  rarityRank,
  type Rarity,
} from "./rarity"

const card = (species: Doc<"species">) => {
  const lineageClass =
    species.lineage.class ??
    species.lineage.order ??
    species.lineage.family ??
    "Animal"
  return {
    id: species._id,
    name: species.names.en ?? species.names.scientific ?? "Unknown animal",
    subtitle: lineageClass,
    imageUrl: species.photoUrl,
    stat: lineageClass,
    rarity: species.rarity,
    views: species.views,
    wikipediaUrl: species.wikipedia.en ?? null,
    extinct: species.extinct,
  }
}

type Card = ReturnType<typeof card>

const cardById = async (ctx: QueryCtx, id: Id<"species">) => {
  const species = await ctx.db.get("species", id)
  return species ? card(species) : null
}

// A random species of `rarity`: the first at or after a random drawKey,
// wrapping round.
const drawSpecies = async (ctx: QueryCtx, rarity: Rarity) => {
  const key = Math.random()
  const row =
    (await ctx.db
      .query("species")
      .withIndex("by_rarity_and_drawKey", (q) =>
        q.eq("rarity", rarity).gte("drawKey", key)
      )
      .first()) ??
    (await ctx.db
      .query("species")
      .withIndex("by_rarity_and_drawKey", (q) => q.eq("rarity", rarity))
      .first())
  return row ? card(row) : null
}

const ownedCard = (ctx: QueryCtx, player: string, speciesId: Id<"species">) =>
  ctx.db
    .query("collection")
    .withIndex("by_playerId_and_speciesId", (q) =>
      q.eq("playerId", player).eq("speciesId", speciesId)
    )
    .unique()

const pendingPack = (ctx: QueryCtx, player: string) =>
  ctx.db
    .query("pendingPacks")
    .withIndex("by_playerId", (q) => q.eq("playerId", player))
    .unique()

// Five cards, each rolled with its position's odds (or all legendary in a god
// pack). Repeats are redrawn with the same odds, then the pack is shown least
// rare first.
const drawPack = async (ctx: MutationCtx) => {
  const cards: Array<Card> = []
  const drawn = new Set<Id<"species">>()
  const pack = Math.random() < godPackChance ? godPackOdds : packOdds
  for (const odds of pack) {
    let drew = false
    for (let tries = 0; tries < 10; tries++) {
      const pulled = await drawSpecies(ctx, drawRarity(odds, Math.random()))
      if (!pulled || drawn.has(pulled.id)) continue
      drawn.add(pulled.id)
      cards.push(pulled)
      drew = true
      break
    }
    if (!drew) throw new Error("Not enough species to draw a pack")
  }
  return cards.toSorted(
    (a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || a.views - b.views
  )
}

const requirePlayer = async (ctx: QueryCtx) => {
  const player = await playerId(ctx)
  if (!player) throw new Error("Not signed in")
  return player
}

// The player's waiting pack: drawn once, then the same until claimed, so a
// reload can't reroll it.
// shortcut: packs are unlimited; add a timer or currency when the game needs one.
export const next = mutation({
  args: {},
  handler: async (ctx) => {
    const player = await requirePlayer(ctx)
    const pending = await pendingPack(ctx, player)
    let cards: Array<Card>
    if (pending) {
      const found = await Promise.all(
        pending.speciesIds.map((id) => cardById(ctx, id))
      )
      cards = found.flatMap((pulled) => (pulled ? [pulled] : []))
    } else {
      cards = await drawPack(ctx)
      await ctx.db.insert("pendingPacks", {
        playerId: player,
        speciesIds: cards.map((pulled) => pulled.id),
      })
    }
    return Promise.all(
      cards.map(async (pulled) => ({
        ...pulled,
        isNew: !(await ownedCard(ctx, player, pulled.id)),
      }))
    )
  },
})

// Adds the waiting pack to the collection. Does nothing without one, so a
// double tap can't add a pack twice.
export const claim = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const player = await requirePlayer(ctx)
    const pending = await pendingPack(ctx, player)
    if (!pending) return null
    const pulledAt = Date.now()
    for (const speciesId of pending.speciesIds) {
      const owned = await ownedCard(ctx, player, speciesId)
      // A pull shows the card at its current rarity, so any upgrade is seen.
      const seenRarity = (await ctx.db.get("species", speciesId))?.rarity
      if (owned) {
        await ctx.db.patch("collection", owned._id, {
          copies: owned.copies + 1,
          seenRarity,
        })
      } else {
        await ctx.db.insert("collection", {
          playerId: player,
          speciesId,
          copies: 1,
          pulledAt,
          seenRarity,
        })
      }
    }
    await ctx.db.delete("pendingPacks", pending._id)
    return null
  },
})

// The signed-in player's cards; empty for a visitor.
// shortcut: one query for the whole collection, fine up to a few thousand cards; paginate past that.
export const collection = query({
  args: {},
  handler: async (ctx) => {
    const player = await playerId(ctx)
    if (!player) return []
    const rows = await ctx.db
      .query("collection")
      .withIndex("by_playerId", (q) => q.eq("playerId", player))
      .take(5000)
    const found = await Promise.all(
      rows.map(async ({ speciesId, copies, pulledAt }) => {
        const owned = await cardById(ctx, speciesId)
        return owned ? [{ ...owned, copies, pulledAt }] : []
      })
    )
    return found.flat()
  },
})

// The signed-in player's cards whose rarity went up since they last saw them,
// rarest first, each with the rarity it was at; empty for a visitor.
// shortcut: reads the whole collection like `collection` does; keep pending upgrades per player if collections grow past a few thousand cards.
export const upgrades = query({
  args: {},
  handler: async (ctx) => {
    const player = await playerId(ctx)
    if (!player) return []
    const rows = await ctx.db
      .query("collection")
      .withIndex("by_playerId", (q) => q.eq("playerId", player))
      .take(5000)
    const found = await Promise.all(
      rows.map(async ({ speciesId, copies, seenRarity }) => {
        if (!seenRarity || seenRarity === "legendary") return []
        const owned = await cardById(ctx, speciesId)
        return owned && rarityRank(owned.rarity) > rarityRank(seenRarity)
          ? [{ ...owned, copies, from: seenRarity }]
          : []
      })
    )
    return found
      .flat()
      .toSorted(
        (a, b) =>
          rarityRank(b.rarity) - rarityRank(a.rarity) || b.views - a.views
      )
  },
})

// Marks an upgraded card as seen at its current rarity, once its upgrade has
// played.
export const seeUpgrade = mutation({
  args: { speciesId: v.id("species") },
  returns: v.null(),
  handler: async (ctx, { speciesId }) => {
    const player = await requirePlayer(ctx)
    const owned = await ownedCard(ctx, player, speciesId)
    const species = await ctx.db.get("species", speciesId)
    if (owned && species) {
      await ctx.db.patch("collection", owned._id, {
        seenRarity: species.rarity,
      })
    }
    return null
  },
})

// How many cards the game has, and four legendary photos for the pack art.
export const catalog = query({
  args: {},
  handler: async (ctx) => {
    const stats = await ctx.db.query("catalogStats").unique()
    const covers = await ctx.db
      .query("species")
      .withIndex("by_rarity_and_drawKey", (q) => q.eq("rarity", "legendary"))
      .take(4)
    return {
      total: stats?.species ?? 0,
      covers: covers.map((species) => species.photoUrl),
    }
  },
})
