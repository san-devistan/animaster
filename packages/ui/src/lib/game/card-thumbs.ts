import { CARD_W } from "@workspace/ui/lib/game/card-art"
import { cardFilm, type CardSlot } from "@workspace/ui/lib/game/card-scene"
import {
  addFilm,
  createStage,
  type Disposable,
  type Film,
  type Stage,
} from "@workspace/ui/lib/game/film-scene"
import type { GameSong } from "@workspace/ui/lib/game/theme"

// Same framing as SongCard without its mirror floor.
const THUMB_W = 280
const THUMB_H = 400
// The card is raised by this much on its stage, as at the top of SongCard's bob.
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

let stage: Stage | null = null
let observer: IntersectionObserver | null = null
let queue = Promise.resolve()
let frame = 0
let last = 0
let tick = 0
let kicking = false
const thumbs = new Map<Element, Thumb>()

function schedule() {
  frame ||= requestAnimationFrame(draw)
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
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const thumb = thumbs.get(entry.target)
      if (!thumb) continue
      thumb.shown = entry.isIntersecting
      // Coming back into view isn't a scroll: measure speed afresh.
      thumb.top = null
    }
    schedule()
  })
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
  song: GameSong,
  onDrawn: () => void
) {
  let film: Film | null = null
  let disposed = false
  let loading = true
  const parts: Array<Disposable> = []
  const release = () => {
    thumbs.delete(canvas)
    observer?.unobserve(canvas)
    if (film) stage?.scene.remove(film.subject)
    for (const part of parts.splice(0)) part.dispose()
  }

  // Films load one at a time, so each takes only its own disposables.
  async function load() {
    if (disposed) return
    const scene = thumbStage()
    canvas.width = scene.renderer.domElement.width
    canvas.height = scene.renderer.domElement.height
    const before = scene.disposables.length
    const loaded = addFilm(scene, cardFilm(song))
    film = loaded
    loaded.subject.visible = false
    loaded.subject.position.y = LIFT
    try {
      await loaded.ready
      // Give the art a frame to land.
      await new Promise(requestAnimationFrame)
    } finally {
      parts.push(...scene.disposables.splice(before))
      loading = false
      if (disposed) release()
    }
    if (disposed) return
    thumbs.set(canvas, {
      film: loaded,
      shown: false,
      drawn: false,
      onDrawn,
      top: null,
      kick: 0,
    })
    observer?.observe(canvas)
  }

  queue = queue.then(load).catch(() => undefined)
  return () => {
    disposed = true
    if (!loading) release()
  }
}
