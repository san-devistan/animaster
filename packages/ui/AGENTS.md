# Design System

Source of truth for design across the repo.

- Tokens: shadcn CSS variables in `src/styles/globals.css`. Run
  `pnpm sync:design-system` after changing them to update mobile.
- Components: shadcn-style web components in `src/components`, used by
  `apps/web`. Mobile uses only the tokens.
- shadcn: use the shadcn MCP or CLI. The CLI runs from the web app
  (`--cwd apps/web`) and writes into this package.
- Game visuals: `game-*`, `song-card`, `booster-pack`, `pack-opening`,
  `card-back`, `rarity-badge`, and `celebration` are the Musi Master
  primitives. The three.js and shader engine lives in `src/lib/game`; global
  effects live in `src/styles/game.css`.
