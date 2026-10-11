import {
  fadeIn,
  fadeOut,
  PREVIEW_FADE,
  usePreviewUrl,
  waitToFadeIn,
} from "@/game/_hooks/use-song-preview"
import { sfx } from "@workspace/ui/lib/game/sfx"
import { useEffect, useRef } from "react"

// A silent WAV: played inside the tap that opens the pack, so the browser
// lets the same audio element play later, when a card lands.
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA="

// Plays each revealed card's preview while it's on show. On a swipe the
// last song fades out fully, then the next fades in. Follows the game's sound
// setting; silent for songs without a preview. `unlock` must run inside the
// tap that opens the pack.
export function useRevealMusic() {
  const previewUrl = usePreviewUrl()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // The latest request wins: a quick swipe skips songs still loading.
  const wantedRef = useRef<string | null>(null)

  function current() {
    audioRef.current ??= new Audio()
    return audioRef.current
  }

  function stop() {
    wantedRef.current = null
    if (audioRef.current) void fadeOut(audioRef.current)
  }

  function unlock() {
    const audio = current()
    audio.src = SILENCE
    void audio.play().catch(() => undefined)
  }

  // Fully in `by` seconds from now: once its card's reveal has played out.
  async function play(songId: string, by = PREVIEW_FADE) {
    wantedRef.current = songId
    if (!sfx.isEnabled()) {
      stop()
      return
    }
    const end = performance.now() + by * 1000
    const audio = current()
    // The last song fades out while the next is looked up; only once it's
    // silent does the next one start.
    const [url] = await Promise.all([
      previewUrl(songId).catch(() => null),
      fadeOut(audio),
    ])
    // A later swipe took over, or this song has no preview: stay silent.
    if (wantedRef.current !== songId || !url) return
    audio.preload = "auto"
    audio.src = url
    // Loads while it waits.
    await waitToFadeIn(end)
    if (wantedRef.current !== songId) return
    await fadeIn(audio).catch(() => undefined)
    // Swiped on or stopped while it was starting: fade it straight back out.
    if (wantedRef.current !== songId) void fadeOut(audio)
  }

  useEffect(
    () => () => {
      if (audioRef.current) void fadeOut(audioRef.current)
      audioRef.current = null
    },
    []
  )

  return { unlock, play, stop }
}
