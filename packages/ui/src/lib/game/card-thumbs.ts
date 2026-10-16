import { CARD_W } from "@workspace/ui/lib/game/card-art"
import { cardFilm, type CardSlot } from "@workspace/ui/lib/game/card-scene"
import {
  addFilm,
  createStage,
  type Disposable,
  type Film,
  type Stage,
} from "@workspace/ui/lib/game/film-scene"
import { loadImage } from "@workspace/ui/lib/game/pack-art"
import type { GameCardData } from "@workspace/ui/lib/game/theme"

// Same framing as GameCard without its mirror floor.
const THUMB_W = 280
const THUMB_H = 400
// The card is raised by this much on its stage, as at the top of GameCard's bob.
const LIFT = 6
// How far the foil's light turns between the viewport's middle and its edges.
const TILT = { across: 0.5, down: 0.8 }
// At rest the light drifts, like the big card's sway; scrolling swings it
// further (tilt per px/s, capped), which also sets the sparkles flaring.
const SWAY = 0.22
const KICK = { perSpeed: 0.0008, max: 0.9 }

type Thumb = {
  film: Film
  shown: boolean
  drawn: boolean
  onDrawn: () => void
  top: number | null
  kick: number
}
// A card's film and the GPU resources only it uses.
type Built = { film: Film; parts: Array<Disposable> }

let stage: Stage | null = null
let observer: IntersectionObserver | null = null
let frame = 0
let last = 0
let tick = 0
let kicking = false
const thumbs = new Map<Element, Thumb>()
// Thumbs waiting for their film (by canvas; warm-ups by card), and which are
// on screen: films load one at a time, those on screen first, so a long grid
// shows its top at once.
const waiting = new Map<
  Element | string,
  { card: GameCardData; load: () => Promise<void> }
>()
const onScreen = new Set<Element>()
let loadingAny = false
// Cards a mounted thumb shows or is loading, so a warm-up doesn't build them twice.
const live = new Set<string>()
// Films of thumbs that unmounted, by card, so a grid shown again (back on its
// tab, or after a data refresh) draws at once instead of rebuilding each card.
// shortcut: kept for the session, the oldest dropped past PARK_MAX; free them
// on memory pressure if phones struggle.
const parked = new Map<string, Built>()
const PARK_MAX = 200

// Everything the film is drawn from.
const filmKey = (card: GameCardData) =>
  [
    card.id,
    card.rarity,
    card.name,
    card.subtitle,
    card.imageUrl,
    card.views,
  ].join("|")

function park(key: string, kept: Built) {
  for (const part of parked.get(key)?.parts ?? []) part.dispose()
  parked.delete(key)
  parked.set(key, kept)
  const [oldest] = parked
  if (parked.size <= PARK_MAX || !oldest) return
  parked.delete(oldest[0])
  for (const part of oldest[1].parts) part.dispose()
}

// A parked film, back on the stage for a thumb.
function unpark(key: string) {
  const kept = parked.get(key)
  if (!kept) return null
  parked.delete(key)
  thumbStage().scene.add(kept.film.subject)
  return kept
}

// A card's film on the shared stage, hidden until a thumb shows it. Films
// build one at a time, so each takes only the disposables added meanwhile.
async function build(card: GameCardData): Promise<Built> {
  const scene = thumbStage()
  const before = scene.disposables.length
  const film = addFilm(scene, cardFilm(card))
  film.subject.visible = false
  film.subject.position.y = LIFT
  try {
    await film.ready
  } catch (error) {
    scene.scene.remove(film.subject)
    for (const part of scene.disposables.splice(before)) part.dispose()
    throw error
  }
  return { film, parts: scene.disposables.splice(before) }
}

// Builds the films of cards about to be shown (the newest of the collection)
// in idle time, so their thumbs draw as soon as they mount.
export function warmCardThumbs(cards: ReadonlyArray<GameCardData>) {
  for (const card of cards) {
    const key = filmKey(card)
    if (parked.has(key) || live.has(key) || waiting.has(key)) continue
    waiting.set(key, {
      card,
      async load() {
        if (parked.has(key) || live.has(key)) return
        const built = await build(card)
        const { renderer, scene, camera } = thumbStage()
        // Drawn once off screen, so its textures and shaders are on the GPU.
        built.film.subject.visible = true
        renderer.render(scene, camera)
        built.film.subject.visible = false
        scene.remove(built.film.subject)
        park(key, built)
      },
    })
  }
  void loadWaiting()
}

// Waits for the page to be idle, or for a thumb to come on screen.
let wake: (() => void) | null = null
const whenIdle = () =>
  new Promise<void>((resolve) => {
    wake = resolve
    // Safari has no requestIdleCallback.
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => resolve(), { timeout: 1000 })
    } else setTimeout(resolve, 200)
  }).finally(() => {
    wake = null
  })

function schedule() {
  frame ||= requestAnimationFrame(draw)
}

async function loadWaiting() {
  if (loadingAny || !waiting.size) return
  loadingAny = true
  const urgent = () =>
    [...waiting.keys()].find(
      (key) => typeof key !== "string" && onScreen.has(key)
    )
  // Work off screen only takes idle time, so it costs no frames.
  if (urgent() === undefined) await whenIdle()
  const keys = [...waiting.keys()]
  const next =
    urgent() ?? keys.find((key) => typeof key === "string") ?? keys[0]
  const thumb = next === undefined ? undefined : waiting.get(next)
  if (next !== undefined) waiting.delete(next)
  await thumb?.load().catch(() => undefined)
  loadingAny = false
  // Picks the next one only now, so a scroll meanwhile reorders the rest.
  void loadWaiting()
}

function watcher() {
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const { target, isIntersecting } = entry
      if (isIntersecting) onScreen.add(target)
      else onScreen.delete(target)
      // Photos coming on screen download together, not one per film.
      const photo = isIntersecting && waiting.get(target)?.card.imageUrl
      if (photo) loadImage(photo).catch(() => undefined)
      const thumb = thumbs.get(target)
      if (!thumb) continue
      thumb.shown = isIntersecting
      // Coming back into view isn't a scroll: measure speed afresh.
      thumb.top = null
    }
    schedule()
    wake?.()
    void loadWaiting()
  })
  return observer
}

// One shared WebGL context, so a collection grid can show many real cards.
function thumbStage() {
  if (stage) return stage
  const canvas = document.createElement("canvas")
  canvas.style.width = `${THUMB_W}px`
  canvas.style.height = `${THUMB_H}px`
  Object.defineProperties(canvas, {
    clientWidth: { value: THUMB_W },
    clientHeight: { value: THUMB_H },
  })
  stage = createStage(canvas)
  // Thumbs run their own loop over the visible ones, and are small enough to
  // skip the big card's supersampling.
  stage.renderer.setAnimationLoop(null)
  stage.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  return stage
}

// Where a thumb's card sits on screen and how it's lit, for a big card to
// take over from it seamlessly; null while the thumb isn't drawn.
export function cardThumbSlot(canvas: HTMLCanvasElement): CardSlot | null {
  const thumb = thumbs.get(canvas)
  if (!stage || !thumb?.drawn) return null
  const box = canvas.getBoundingClientRect()
  if (!box.width) return null
  const px = box.width / THUMB_W
  return {
    x: box.left + box.width / 2,
    // The stage middle, less the card's lift; a little under perspective.
    y: box.top + box.height / 2 - LIFT * px,
    width: CARD_W * px,
    tilt: { x: thumb.film.tilt.x, y: thumb.film.tilt.y },
    time: stage.time.value,
  }
}

// Each visible card is lit for where it sits on screen and how fast it moves,
// so its foil, glare and sparkles swing as the page scrolls while the card
// itself stays put.
function draw(stamp: number) {
  frame = 0
  if (!stage) return
  const { renderer, scene, camera, time, still } = stage
  // Idle drift is slow enough for 30fps; scrolling gets every frame.
  tick += 1
  if (!kicking && tick % 2 && last) {
    schedule()
    return
  }
  const delta = last ? Math.min((stamp - last) / 1000, 0.1) : 0
  last = stamp
  if (!still) time.value += delta
  const ease = 1 - 0.9 ** (delta * 60)
  let running = false
  kicking = false
  for (const [canvas, thumb] of thumbs) {
    if (!(canvas instanceof HTMLCanvasElement)) continue
    if (!thumb.shown) continue
    running = true
    // Faded out under a showcase: keep the loop, skip the work. Inert alone
    // isn't enough, the page is back on screen while the card flies home.
    if (still && thumb.drawn) continue
    if (!canvas.checkVisibility({ opacityProperty: true })) continue
    const box = canvas.getBoundingClientRect()
    const across = (box.left + box.width / 2) / innerWidth - 0.5
    const down = (box.top + box.height / 2) / innerHeight - 0.5
    const speed =
      thumb.top === null || !delta ? 0 : (box.top - thumb.top) / delta
    thumb.top = box.top
    const push = Math.max(-KICK.max, Math.min(KICK.max, speed * KICK.perSpeed))
    thumb.kick += (push - thumb.kick) * ease
    kicking ||= Math.abs(thumb.kick) > 0.01
    if (!still) {
      // Offset by position, so the drift ripples across the grid.
      const phase = across * 2 + down * 3
      const turn = time.value * Math.PI * 2
      thumb.film.tilt.set(
        across * TILT.across + SWAY * Math.sin(turn / 7 + phase),
        -down * TILT.down + 0.6 * SWAY * Math.cos(turn / 9 + phase) + thumb.kick
      )
    }
    scene.environmentRotation.set(thumb.film.tilt.y, -thumb.film.tilt.x, 0)
    thumb.film.subject.visible = true
    renderer.render(scene, camera)
    thumb.film.subject.visible = false
    const ctx = canvas.getContext("2d")
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    ctx?.drawImage(renderer.domElement, 0, 0)
    if (!thumb.drawn) {
      thumb.drawn = true
      thumb.onDrawn()
    }
  }
  if (running && !still) schedule()
  else last = 0
}

// Draws a live card into `canvas` until the returned cleanup runs.
export function mountCardThumb(
  canvas: HTMLCanvasElement,
  card: GameCardData,
  onDrawn: () => void
) {
  const key = filmKey(card)
  let built: Built | null = null
  let disposed = false
  let loading = false
  live.add(key)
  const release = () => {
    live.delete(key)
    waiting.delete(canvas)
    onScreen.delete(canvas)
    thumbs.delete(canvas)
    observer?.unobserve(canvas)
    if (!built) return
    stage?.scene.remove(built.film.subject)
    park(key, built)
  }

  function show(film: Film) {
    const scene = thumbStage()
    canvas.width = scene.renderer.domElement.width
    canvas.height = scene.renderer.domElement.height
    thumbs.set(canvas, {
      film,
      shown: onScreen.has(canvas),
      drawn: false,
      onDrawn,
      top: null,
      kick: 0,
    })
    schedule()
  }

  async function load() {
    loading = true
    try {
      built = unpark(key) ?? (await build(card))
      // Give the art a frame to land.
      await new Promise(requestAnimationFrame)
    } finally {
      loading = false
      if (disposed) release()
    }
    if (!disposed) show(built.film)
  }

  built = unpark(key)
  if (built) show(built.film)
  // Loading starts from the watcher, once it knows which thumbs are on screen.
  else waiting.set(canvas, { card, load })
  watcher().observe(canvas)
  return () => {
    disposed = true
    if (!loading) release()
  }
}
