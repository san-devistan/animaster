import type { Rarity } from "@workspace/ui/lib/game/theme"
import { createUISFX, type CueName } from "uisfx"
import { WebHaptics, type HapticInput } from "web-haptics"

// One player for the game; Web Audio only starts after a user gesture (unlock).
export const sfx = createUISFX({
  pack: "glass",
  volume: 0.7,
  preferences: { key: "musi-master:sound" },
})

const haptics = new WebHaptics()

// Each cue's feel; rarer reveals hit harder and longer.
const HAPTIC: Partial<Record<CueName, HapticInput>> = {
  press: "medium",
  swipe: "selection",
  open: "heavy",
  select: "light",
  reward: "success",
  "level-up": [
    { duration: 30, intensity: 0.7 },
    { delay: 60, duration: 30, intensity: 0.85 },
    { delay: 60, duration: 50, intensity: 1 },
  ],
  achievement: [
    { duration: 40, intensity: 1 },
    { delay: 70, duration: 40, intensity: 1 },
    { delay: 70, duration: 120, intensity: 0.8 },
  ],
}

// Rarer cards get a bigger cue and a softer, fuller pack.
export const REVEAL: Record<Rarity, CueName> = {
  common: "select",
  rare: "reward",
  epic: "level-up",
  legendary: "achievement",
}

export function play(cue: CueName, options?: Parameters<typeof sfx.play>[1]) {
  sfx.play(cue, { retrigger: "overlap", ...options })
  const feel = HAPTIC[cue]
  if (feel !== undefined) void haptics.trigger(feel)
}
