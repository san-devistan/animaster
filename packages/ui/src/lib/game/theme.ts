export type Rarity = "common" | "rare" | "epic" | "legendary"

// Least to most rare.
export const RARITY_ORDER: ReadonlyArray<Rarity> = [
  "common",
  "rare",
  "epic",
  "legendary",
]

// Shader gradients take at most 8 stops.
export const FOIL: ReadonlyArray<readonly [string, number]> = [
  ["#2e9e52", 0.04],
  ["#68c36d", 0.15],
  ["#c2ecb9", 0.3],
  ["#ffd64a", 0.46],
  ["#d8d6d8", 0.58],
  ["#7bd1ba", 0.66],
  ["#35aa76", 0.74],
  ["#2e9e52", 0.82],
]

export type Stops = ReadonlyArray<readonly [string, number]>

// Two-colour foil: A owns the card, B is one narrow band placed high on the
// diagonal (mostly behind the image) so it shows as an accent and on tilt.
const DUO_AT = [0, 0.12, 0.24, 0.3, 0.35, 0.46, 0.6] as const
const duo = ([a, aLight, hi, b, bLight]: ReadonlyArray<string>): Stops =>
  [a, aLight, hi, b, bLight, aLight, a].map(
    (color, index) => [color ?? "#ffffff", DUO_AT[index] ?? 1] as const
  )

export const RARITIES: Record<Rarity, Stops> = {
  common: duo(["#5fd9b0", "#bff5e2", "#ffffff", "#d8f46a", "#effab8"]),
  rare: duo(["#6f86ff", "#c3ccff", "#f2f4ff", "#4fd6ff", "#bdefff"]),
  epic: duo(["#e05cf0", "#f6c2fb", "#fff2fd", "#8a5cff", "#d0bfff"]),
  legendary: duo(["#ffb21e", "#ffe08a", "#fffbe8", "#ff8ab8", "#ffd3e2"]),
}

// Brand green, shared with the pack foil.
export const BRAND = {
  color: "#258343",
  on: "#ffffff",
  // Darker green for small text on paper (#258343 is ~4.3:1 there).
  ink: "#246e3a",
  mesh: ["#2e9e52", "#68c36d", "#0b7643", "#9dde9e"],
}

export type GameCardData = {
  id: string
  name: string
  subtitle: string
  imageUrl: string
  // Yearly English Wikipedia page views.
  views: number
  rarity: Rarity
}

export const cssGradient = (colors: ReadonlyArray<string>) =>
  `linear-gradient(135deg, ${colors.join(", ")})`

export const stopsCss = (stops: Stops) =>
  `linear-gradient(135deg, ${stops.map(([color, at]) => `${color} ${at * 100}%`).join(", ")})`

export const FOIL_CSS = stopsCss(FOIL)

export type CssVars = Record<`--${string}`, string>
