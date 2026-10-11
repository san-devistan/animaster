import type { Rarity } from "@workspace/ui/lib/game/theme"
import type * as THREE from "three"

// Seconds each first-pull celebration takes (the DOM effects match these).
export const CELEBRATION = { epic: 1.1, legendary: 2.1 } as const
export type Celebrated = keyof typeof CELEBRATION

// Camera zoom on the opened pile (the card about 90% of a phone's width), and
// the seconds a revealed card takes to rise into it.
export const PILE_ZOOM = 1.45
export const RISE = 0.6
// Seconds a card picked from the collection takes to fly out or back.
export const FLY = 0.55

export type Pose = {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  s: number
}

export const pose = (part: Partial<Pose>): Pose => ({
  x: 0,
  y: 0,
  z: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  s: 1,
  ...part,
})

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
export const span = (time: number, [from, to]: readonly [number, number]) =>
  clamp01((time - from) / (to - from))
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
export const easeOut = (t: number) => 1 - (1 - t) ** 3
export const easeOutBack = (t: number) =>
  1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function mix(a: Pose, b: Pose, t: number): Pose {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
    rx: lerp(a.rx, b.rx, t),
    ry: lerp(a.ry, b.ry, t),
    rz: lerp(a.rz, b.rz, t),
    s: lerp(a.s, b.s, t),
  }
}

export function place(group: THREE.Object3D, at: Pose) {
  group.position.set(at.x, at.y, at.z)
  group.rotation.set(at.rx, at.ry, at.rz)
  group.scale.setScalar(at.s)
}

// Epic: the card bursts forward and twists back and forth, like a jolt. The
// twist starts once it's clear of the pile and is gone before it lands back.
function epicPose(at: Pose, t: number): Pose {
  const twisting = Math.max(0, t - 0.15)
  const settle = Math.exp(-twisting * 4) * (1 - clamp01(t / CELEBRATION.epic))
  return {
    ...at,
    z: at.z + 110 * Math.sin(Math.PI * clamp01(t / CELEBRATION.epic)),
    ry: at.ry + 0.8 * Math.sin(twisting * 15) * settle,
    rz: at.rz + 0.12 * Math.sin(twisting * 11) * settle,
  }
}

// Legendary: the card spins a full turn on itself, lifting towards the
// viewer, and lands as the flash goes off; then light sweeps across it.
const SPIN = 0.9
export const SHINE = [0.9, 2.1] as const
function legendaryPose(at: Pose, t: number): Pose {
  const turn = clamp01(t / SPIN)
  return {
    ...at,
    // High enough that the card's edges clear the pile while it's side-on.
    z: at.z + 140 * Math.sin(Math.PI * turn),
    ry: at.ry + Math.PI * 2 * easeInOut(turn),
  }
}

export const celebrations = { epic: epicPose, legendary: legendaryPose }

// Seconds after a card lands until its reveal cue (uisfx lengths) and
// celebration have played out: when its song should be in. Legendary's cue
// comes 0.85s in and its light sweep ends at 2.1s.
export const REVEAL_PLAYED: Record<Rarity, number> = {
  common: 0.4,
  rare: 0.75,
  epic: Math.max(CELEBRATION.epic, 0.95),
  legendary: Math.max(SHINE[1], 0.85 + 1.2),
}
