// Run: node packages/backend/convex/songs/_lib/dedupe.check.mjs
import assert from "node:assert/strict"

import { displayTitle } from "./dedupe.ts"

const cases = {
  "Lapada Dela - Ao Vivo": "Lapada Dela",
  "No Se Va - En Vivo": "No Se Va",
  "Shake the Frost (Live)": "Shake the Frost",
  "Liberdade Provisória (Live - Ibirapuera / 2019)": "Liberdade Provisória",
  "Old Town Road - Remix": "Old Town Road",
  "Cold Heart - PNAU Remix": "Cold Heart",
  "Soltera (Remix)": "Soltera",
  "ETA - RMX": "ETA",
  "Love Story (Taylor’s Version)": "Love Story",
  "All Too Well (10 Minute Version) (Taylor's Version)":
    "All Too Well (10 Minute Version)",
  "There Is a Light That Never Goes Out - 2017 Master":
    "There Is a Light That Never Goes Out",
  "A Milli - Re-Mastered 2008": "A Milli",
  "Cielo - 2002": "Cielo",
  "Sueño (con Pablo Alborán)": "Sueño",
  "I LOVE YOU HOE (w/ 9lives)": "I LOVE YOU HOE",
  "Ojos Marrones - Con Sebastián Yatra": "Ojos Marrones",
  "LOVE. FEAT. ZACARI.": "LOVE.",
  "Insane feat. Moon Holiday": "Insane",
  "Guess featuring billie eilish": "Guess",
  "Oprah's Bank Account (Lil Yachty & DaBaby feat. Drake)":
    "Oprah's Bank Account",
  "Calling (Spider-Man: Across the Spider-Verse) (Metro Boomin & Swae Lee, NAV, feat. A Boogie Wit da Hoodie)":
    "Calling (Spider-Man: Across the Spider-Verse)",
  "Malbec (Part. DENNIS) - Ao Vivo": "Malbec",
  "Love The Way You Lie (Part II) - Pt. 2":
    "Love The Way You Lie (Part II) - Pt. 2",
  "Invocada (Participação especial de Léo Santana) - Ao vivo": "Invocada",
  "Spectrum (Say My Name) - Calvin Harris Remix": "Spectrum (Say My Name)",
  "Running Up That Hill (A Deal With God)":
    "Running Up That Hill (A Deal With God)",
  "Sunflower - Spider-Man: Into the Spider-Verse":
    "Sunflower - Spider-Man: Into the Spider-Verse",
  "Fue en un café - Under the Boardwalk":
    "Fue en un café - Under the Boardwalk",
  "Delivery Boy": "Delivery Boy",
  Alive: "Alive",
  "Live Forever": "Live Forever",
}
for (const [title, expected] of Object.entries(cases)) {
  assert.equal(displayTitle(title), expected, title)
}
