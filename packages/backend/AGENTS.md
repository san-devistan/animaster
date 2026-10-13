<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

<!-- convex-ai-end -->

## Role

This is where the app's data and business logic live. Apps call the generated
API from `@workspace/backend`; anything beyond presentation belongs here.

## Providers

External providers are added as Convex components:

- Auth: [Better Auth](https://www.convex.dev/components/better-auth) (MCP)
- Payments: [Stripe](https://www.convex.dev/components/stripe) (MCP, CLI)
- Email: [Resend](https://www.convex.dev/components/resend)

Convex itself is reachable through its MCP and the workspace CLI
(`pnpm exec convex`).

## Game

- Players (`auth.ts`): Better Auth in its Convex component, anonymous guests
  only for now. Set the Convex env vars `BETTER_AUTH_SECRET` and `SITE_URL`
  (the web app URL); `playerId(ctx)` uses the authenticated Convex identity.
- Packs (`packs.ts`): `packs:next` draws and stores a player's waiting pack
  once; `packs:claim` moves it into `collection`, adding copies for repeats.
  Each `collection` row keeps `seenRarity`, the rarity the player last saw the
  card at. `packs:upgrades` lists owned cards whose rarity rose past it in an
  import, and `packs:seeUpgrade` marks one seen once the app has shown it.
  Each of the five card positions has its own `packOdds` in `rarity.ts`; one
  pack in 1,000 is a god pack with five legendary cards. Species rarities stay
  the view-based tiers in `rarity.ts`. Check:
  `node packages/backend/convex/rarity.check.mjs`.
- Draws use each species' random `drawKey` on `by_rarity_and_drawKey`.
  `catalogStats` stores the species count; `species:upsert` keeps both.
