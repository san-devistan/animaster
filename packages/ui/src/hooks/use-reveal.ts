import type { OpeningScene } from "@workspace/ui/lib/game/opening-scene"
import type { Celebrated } from "@workspace/ui/lib/game/reveal-motion"
import { play, REVEAL } from "@workspace/ui/lib/game/sfx"
import type { GameSong } from "@workspace/ui/lib/game/theme"
import { useCallback, useRef, useState, type RefObject } from "react"

export type Party = { index: number; rarity: Celebrated; key: number }

// Plays a card cue, and the first time each epic or legendary card appears,
// its celebration.
export function useReveal(
  songs: ReadonlyArray<GameSong>,
  sceneRef: RefObject<OpeningScene | null>
) {
  const seen = useRef(new Set<number>())
  const [party, setParty] = useState<Party | null>(null)

  const reveal = useCallback(
    (next: number) => {
      const rarity = songs[next]?.rarity
      if (!rarity) return
      if (
        (rarity !== "epic" && rarity !== "legendary") ||
        seen.current.has(next)
      ) {
        play(REVEAL[rarity])
        return
      }
      seen.current.add(next)
      sceneRef.current?.celebrate(next, rarity)
      setParty({ index: next, rarity, key: Date.now() })
      if (rarity === "epic") {
        play(REVEAL.epic)
        return
      }
      play("swipe")
      setTimeout(() => play(REVEAL.legendary), 850)
    },
    [songs, sceneRef]
  )

  const reset = useCallback(() => {
    seen.current.clear()
    setParty(null)
  }, [])

  return { party, reveal, reset }
}
