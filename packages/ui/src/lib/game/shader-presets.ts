import {
  BRAND,
  FOIL,
  RARITIES,
  type Rarity,
} from "@workspace/ui/lib/game/theme"
import type { ComponentConfig } from "shaders/js"

export type ShaderName = "foil" | "studio" | "back" | Rarity

const toStops = (colors: ReadonlyArray<string>) =>
  colors.map((color, index) => ({
    color,
    position: index / (colors.length - 1),
  }))

const fullRect = JSON.stringify({
  type: "roundedRectSDF",
  radius: 0.8,
  height: 0.8,
})

const mesh = (
  colors: ReadonlyArray<string>,
  props: Record<string, unknown> = {}
): ComponentConfig => ({
  type: "MeshGradient",
  id: "mesh",
  props: {
    stops: toStops(colors),
    count: 5,
    smoothness: 2.2,
    speed: 0.3,
    ...props,
  },
})

const holo = (props: Record<string, unknown>): ComponentConfig => ({
  type: "Holographic",
  id: "holo",
  props: {
    shape: fullRect,
    foilScale: 1.3,
    saturation: 0.5,
    sparkle: 0.5,
    crinkle: 0.4,
    roughness: 0.15,
    ...props,
  },
})

// shaders@4 ships Sparkle; 3.2 (the newest past the release-age gate) has Glow.
const glow = (
  props: Record<string, unknown>,
  children: Array<ComponentConfig>
): ComponentConfig => ({ type: "Glow", props, children })

// Pack foil: diagonal bands that slide with tilt (see Fx), holo on top.
// Rarer cards get more glow and holo, so the shine itself shows rarity.
const foil = (
  stops: ReadonlyArray<readonly [string, number]>,
  level = 1
): Array<ComponentConfig> => [
  glow({ size: 18, intensity: 0.6 * level, threshold: 0.7 }, [
    {
      type: "WaveDistortion",
      props: { strength: 0.1, frequency: 1.2, speed: 0.35, angle: 45 },
      children: [
        {
          type: "LinearGradient",
          id: "sheen",
          props: {
            stops: stops.map(([color, position]) => ({ color, position })),
            start: { x: 0, y: 0 },
            end: { x: 1, y: 1 },
            colorSpace: "oklch",
          },
        },
      ],
    },
    holo({ opacity: 0.45 * level, blendMode: "overlay" }),
  ]),
]

const studio = (): Array<ComponentConfig> => [
  {
    type: "StudioBackground",
    props: {
      color: "#e6dcff",
      keyColor: "#ffffff",
      fillColor: "#f4efff",
      backColor: "#d9c8ff",
      center: { x: 0.5, y: 0.8 },
      brightness: 100,
      keyIntensity: 50,
      backIntensity: 45,
      fillIntensity: 30,
      ambientIntensity: 40,
      ambientSpeed: 1,
    },
  },
  {
    type: "LinearGradient",
    props: {
      colorA: "#d9c8ff",
      colorB: "#ffffff",
      start: { x: 0.5, y: 0 },
      end: { x: 0.5, y: 1 },
      opacity: 0.7,
      blendMode: "screen",
    },
  },
]

export function shaderPreset(name: ShaderName): Array<ComponentConfig> {
  switch (name) {
    case "foil":
      return foil(FOIL)
    case "studio":
      return studio()
    case "back":
      return [
        mesh(BRAND.mesh, { speed: 0.25 }),
        holo({ opacity: 0.18, blendMode: "softLight", sparkle: 0.2 }),
      ]
    case "common":
      return foil(RARITIES.common, 0.2)
    case "rare":
      return foil(RARITIES.rare, 0.5)
    case "epic":
      return foil(RARITIES.epic, 0.8)
    case "legendary":
      return foil(RARITIES.legendary, 1.2)
    default:
      return name satisfies never
  }
}
