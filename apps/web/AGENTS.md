# Web App

TanStack Start app (Router + Query). It owns routes, loaders, and screen
composition; data and logic come from `@workspace/backend`.

## UI

Screens are built from `@workspace/ui`. When something is missing, it usually
belongs in `packages/ui` rather than in the app.

The game UI uses `packs` from `@workspace/backend` and starts an anonymous
Better Auth session on arrival. On app open, cards from `packs.upgrades` climb
one rarity per tap on their own screen
(`src/game/_components/card-upgrades.tsx`). Set `VITE_CONVEX_SITE_URL` to the deployment's
`.convex.site` URL so `/api/auth` can forward to Convex. Animal photos come
from Wikimedia Commons; check and show each image's attribution and license
before shipping.

## Effect

Effect makes errors, dependencies, and side effects explicit in types. Use it
where those matter, such as backend calls, server functions, retries, and
concurrent work; keep plain UI code plain. Before writing Effect code, read
`node_modules/effect/AGENTS.md`.
