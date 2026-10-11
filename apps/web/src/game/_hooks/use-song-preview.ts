import { api } from "@workspace/backend/api"
import { sfx } from "@workspace/ui/lib/game/sfx"
import { useConvex } from "convex/react"
import { useEffect, useRef } from "react"

// Previews never start or stop dead: they fade in and out over this.
export const PREVIEW_FADE = 0.4
export const PREVIEW_VOLUME = 0.8

// The fade running on each element, so a new one takes over from the last.
type Fade = { frame: number; settle: (done: boolean) => void }
const fades = new WeakMap<HTMLAudioElement, Fade>()

// Stops the fade running on `audio`, if any.
function stopFade(audio: HTMLAudioElement) {
  fades.get(audio)?.settle(false)
}

// Eases `audio`'s volume to `to` over PREVIEW_FADE. Resolves true once there,
// false if another fade took over first.
function fadeAudio(audio: HTMLAudioElement, to: number) {
  stopFade(audio)
  return new Promise<boolean>((resolve) => {
    const from = audio.volume
    const start = performance.now()
    const fade: Fade = {
      frame: 0,
      settle(done) {
        cancelAnimationFrame(fade.frame)
        if (fades.get(audio) === fade) fades.delete(audio)
        resolve(done)
      },
    }
    const step = (now: number) => {
      // A frame's time can fall a hair before `start`: a negative share would
      // set a negative volume, which throws and leaves the fade stuck.
      const t = Math.min(Math.max((now - start) / (PREVIEW_FADE * 1000), 0), 1)
      audio.volume = from + (to - from) * t
      if (t < 1) fade.frame = requestAnimationFrame(step)
      else fade.settle(true)
    }
    fades.set(audio, fade)
    fade.frame = requestAnimationFrame(step)
  })
}

// Elements already set to loop, and those rewinding right now.
const looping = new WeakSet<HTMLAudioElement>()
const rewinding = new WeakSet<HTMLAudioElement>()

// Plays the preview over and over: just before it ends it fades out, goes
// back to the start and fades in again. Left alone while another fade (a
// swipe or a stop) is running, or once it's been paused.
function loopPreview(audio: HTMLAudioElement) {
  if (looping.has(audio)) return
  looping.add(audio)
  audio.addEventListener("timeupdate", () => {
    const left = audio.duration - audio.currentTime
    // timeupdate fires every ~250ms, so start the fade a little early.
    if (!(left <= PREVIEW_FADE + 0.3) || audio.paused) return
    if (rewinding.has(audio) || fades.has(audio)) return
    void rewind(audio)
  })
  // If it reaches the end anyway (a stalled tab), start it over too.
  audio.addEventListener("ended", () => {
    if (rewinding.has(audio) || fades.has(audio)) return
    void fadeIn(audio).catch(() => undefined)
  })
}

async function rewind(audio: HTMLAudioElement) {
  rewinding.add(audio)
  const done = await fadeAudio(audio, 0)
  rewinding.delete(audio)
  if (!done || audio.paused) return
  audio.currentTime = 0
  void fadeAudio(audio, PREVIEW_VOLUME)
}

// Starts `audio` silent and fades it up; it loops from then on.
export async function fadeIn(audio: HTMLAudioElement) {
  stopFade(audio)
  loopPreview(audio)
  audio.volume = 0
  await audio.play()
  void fadeAudio(audio, PREVIEW_VOLUME)
}

// Waits until a fade-in started then is fully in at `end`, a
// performance.now() time; at once if that's already passed.
export function waitToFadeIn(end: number) {
  const left = end - PREVIEW_FADE * 1000 - performance.now()
  return new Promise<void>((resolve) => setTimeout(resolve, Math.max(left, 0)))
}

// Fades `audio` down, then pauses it; resolves once it's silent, or once
// another fade has taken over.
export async function fadeOut(audio: HTMLAudioElement) {
  if (audio.paused) return
  if (await fadeAudio(audio, 0)) audio.pause()
}

// Resolves a song's 30s preview: the stored Spotify one, else Deezer's
// (looked up server-side, since Deezer's API isn't open to browsers). Null
// without a Convex backend or a preview.
export function usePreviewUrl() {
  const convex = useConvex()
  return async (songId: string) => {
    if (!convex) return null
    const { url } = await convex.action(api.playback.preview, { songId })
    return url
  }
}

// Plays a song's preview on its own, fully faded in `by` seconds from now,
// unless the game's sound is off; looked up and loaded meanwhile. `autoplay`
// resolves once the song is heard, or once it won't be. Fades it out on
// `stop` or when the component unmounts.
export function useSongPreview(songId: string) {
  const previewUrl = usePreviewUrl()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // False once stopped, so a preview still loading doesn't start after.
  const wantedRef = useRef(false)
  // The one start per mount; later calls wait on it too.
  const startRef = useRef<Promise<void> | null>(null)

  useEffect(
    () => () => {
      wantedRef.current = false
      if (audioRef.current) void fadeOut(audioRef.current)
      audioRef.current = null
    },
    []
  )

  async function start(by: number) {
    if (!sfx.isEnabled()) return
    wantedRef.current = true
    const end = performance.now() + by * 1000
    const url = await previewUrl(songId).catch(() => null)
    if (!url || !wantedRef.current) return
    const next = new Audio(url)
    next.preload = "auto"
    audioRef.current = next
    await waitToFadeIn(end)
    if (!wantedRef.current) return
    // Blocked by the browser's autoplay rules: stay silent.
    await fadeIn(next).catch(() => undefined)
    // Stopped while it was starting: fade it straight back out.
    if (!wantedRef.current) void fadeOut(next)
  }

  function autoplay(by = PREVIEW_FADE) {
    startRef.current ??= start(by)
    return startRef.current
  }

  function stop() {
    wantedRef.current = false
    if (audioRef.current) void fadeOut(audioRef.current)
  }

  return { autoplay, stop }
}
