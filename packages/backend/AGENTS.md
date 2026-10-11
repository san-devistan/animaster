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

## Song catalog (Audiometa)

Cards are songs with at least 100M Spotify streams from the
[Audiometa API](https://api.audiometa.io/v1/docs).

- Set the keys: `pnpm exec convex env set AUDIOMETA_API_KEY <key,key,...>`
  (never in source). Limit: 100 requests/min per key.
- Import (`catalog.ts`, `ingest.ts`, `songs/_lib/audiometa.ts`): fills
  `songs_v2`, `albums_v2` and `artists_v2` with every track it reaches, no
  stream filter. Rows are matched by `audiometaId`, so re-running updates
  them. Each worker (one per API key) runs two phases:
  1. tempo: crawls 1-BPM buckets (0–399) of `/tracks/by-tempo`, 50 tracks per
     step, fetched in full with `/tracks?ids=…` and saved with their
     embedded album and artists.
  2. artists: claims an artist with `exploredAt: null` and pages
     `/artists/{id}/tracks`, fetching only tracks not stored yet. This finds
     tracks without audio features, which `/tracks/by-tempo` never lists.
     New artists join the queue; a worker finishes when the queue is empty
     and no other worker can add artists.
- A monthly cron runs `catalog:startImport` (both phases; it re-explores
  every artist). By hand: `pnpm exec convex run catalog:startImport`, or
  `'{"fromBpm": 120, "toBpm": 120, "workers": 1}'` to test one bucket, or
  `'{"skipTempo": true}'` for the artists phase only. Progress is in
  `importRuns`. A failed step retries every 5 minutes, 6 times; after that
  `catalog:resume { runId }` continues the worker. `catalog:stopImport`
  stops every worker. Checks: `node
packages/backend/convex/songs/_lib/audiometa.check.mjs` and
  `crawl.check.mjs`.
- The old `songs`, `albums` and `artists` tables hold the last v1 import and
  are not refreshed.
- Duplicates: `songKey` is the lead artist ID plus a normalized title with
  featurings, remasters, remix and version suffixes removed. Every Audiometa
  ID is kept in `songVersions`. The card keeps the version with the most
  streams, including its cover.
- Rarity comes from streams (`songs/_lib/rarity.ts`): legendary 2B+, epic 1B+,
  rare 400M+, common 100M+. Each card rolls common 85%, rare 12%, epic 2.5%,
  legendary 0.5%, then a random song of that tier via `randomKey`.
  Every song has a rarity; imports skip tracks below 100M streams. After
  changing tiers, run `pnpm exec convex run rarity:rerateSongs`.
- Titles: `displayTitle` (`songs/_lib/dedupe.ts`) strips featurings (feat,
  ft, with, con, w/, part.), live, remix, remaster/year and Taylor's Version
  suffixes. Featured artists stay in the song's artist credits. Check:
  `node packages/backend/convex/songs/_lib/dedupe.check.mjs`.
- Artists and albums: `artists` (Audiometa ID, name, `details` with genres,
  bio, country, image, followers, socials), `songArtists` (song ↔ artist, with
  `position`, 0 = lead) and `songs.artistIds` (same order as `artistNames`).
  `albums` have `artistIds` and `details` (label, UPC, total tracks,
  popularity, date precision). They are stored but not shown in the app yet.
- Release dates (`releases.ts`, `scripts/web-release-dates.mjs`):
  `songs.releaseDate` is `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. The script runs
  locally on songs with `reviewed: false` (new songs start there), 4 at a
  time. Claude Sonnet answers from memory or searches the web, and the found
  day goes in `webDate`.
  When a date is found it wins: `releaseDate = webDate`, `reviewed: true`.
  When none is found, `releaseDate` stays and `reviewed` is `null`. List
  those with `releases:toReview` and fix them with `releases:setDates`.
- Previews (`playback.ts`): Audiometa's `previewUrl` if present, otherwise a
  fresh Deezer link looked up by ISRC. Deezer links expire, so don't store
  them.

## Species catalog (Catalogue of Life + Wikidata + Wikipedia)

Prototype animal cards in `species` (not wired to the app yet). Cards are
subspecies (Bengal tiger, not tiger). No API key is needed.

- Run: `pnpm exec convex run animals:importTop '{"limit": 10}'` (1–100).
  Re-running updates rows by `colId`. Clear all rows with
  `animals:clear`.
- Flow (`species/_lib/flow.ts`):
  1. Wikidata, through the QLever mirror (`query.wikidata.org` times out on
     the animal tree): animal subspecies with a Catalogue of Life ID, a
     Commons image and an English article, most sitelinks (Wikipedia
     editions with an article) first, 5 candidates per card wanted.
  2. Catalogue of Life (`species/_lib/col.ts`, ChecklistBank
     API, latest release `3LR`): keeps accepted, non-extinct Animalia taxa
     and stores COL's ID, name, authorship and taxonomy. Synonyms are
     dropped (Siberian tiger and Asiatic lion are synonyms in COL), as are
     extinct taxa. When Wikidata's COL ID is stale (404), an exact accepted-name
     search finds the current one.
  3. Wikipedia: the first two sentences of each English article, 20 per
     call.
- Rarity (`species/_lib/rarity.ts`): legendary 80+ sitelinks, epic 50+,
  rare 30+, else common.
- Licensing: summaries are CC BY-SA and each image has its own Commons
  license (`imageFile` is the file page), so cards must credit both.
  Catalogue of Life data is CC BY.
- Check: `node packages/backend/convex/species/_lib/species.check.mjs`.
