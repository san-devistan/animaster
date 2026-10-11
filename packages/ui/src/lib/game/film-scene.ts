import {
  canvasTexture,
  filmMaterial,
  type Foil,
  type FilmSpec,
} from "@workspace/ui/lib/game/film-material"
import { drawFoilRamp } from "@workspace/ui/lib/game/pack-art"
import * as THREE from "three"

export type { FilmSpec, Trim } from "@workspace/ui/lib/game/film-material"

// Product-shot studio: dim lavender sweep with a few softboxes, so the glossy
// film shows crisp highlights instead of mirroring a whole bright room.
function studio() {
  const room = new THREE.Scene()
  const parts: Array<{ dispose: () => void }> = []
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.MeshBasicMaterial
  ) => {
    parts.push(geometry, material)
    const mesh = new THREE.Mesh(geometry, material)
    room.add(mesh)
    return mesh
  }
  add(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.MeshBasicMaterial({ color: "#3a3248", side: THREE.BackSide })
  )
  const boxes = [
    [-14, 18, 22, 10, 24, 2.4],
    [24, 4, 12, 4, 30, 1.2],
    [0, -26, 18, 30, 6, 0.5],
  ] as const
  for (const [x, y, z, width, height, glow] of boxes) {
    const box = add(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(glow, glow, glow * 1.04),
      })
    )
    box.position.set(x, y, z)
    box.lookAt(0, 0, 0)
  }
  return { room, parts }
}

export type Disposable = { dispose: () => void }

// Lit studio sized to its canvas: 1 world unit ≈ 1 CSS px at depth 0.
export type Stage = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  // Seconds since mount, held at 0 for reduced motion.
  time: { value: number }
  still: boolean
  disposables: Array<Disposable>
  // Per-frame update; delta is in seconds, capped so tab switches don't jump.
  onFrame: (update: (time: number, delta: number) => void) => void
  disposed: boolean
  dispose: () => void
}

const FOV = 22

export function cameraDistance(height: number) {
  return height / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  })
  renderer.setPixelRatio(Math.min(devicePixelRatio * 1.5, 3))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.toneMapping = THREE.NeutralToneMapping

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const { room, parts } = studio()
  scene.environment = pmrem.fromScene(room, 0.02).texture
  for (const part of parts) part.dispose()
  scene.add(new THREE.AmbientLight("#ffffff", 1.35))
  const key = new THREE.DirectionalLight("#ffffff", 1.4)
  key.position.set(-300, 420, 520)
  scene.add(key)

  const camera = new THREE.PerspectiveCamera(
    FOV,
    canvas.clientWidth / canvas.clientHeight,
    10,
    4000
  )
  camera.position.z = cameraDistance(canvas.clientHeight)

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches
  const time = { value: 0 }
  const updates: Array<(time: number, delta: number) => void> = []
  const disposables: Array<Disposable> = [renderer, pmrem]
  const clock = new THREE.Timer()
  renderer.setAnimationLoop((stamp: DOMHighResTimeStamp) => {
    clock.update(stamp)
    const delta = Math.min(clock.getDelta(), 0.1)
    if (!still) time.value += delta
    for (const update of updates) update(time.value, delta)
    renderer.render(scene, camera)
  })

  const stage: Stage = {
    renderer,
    scene,
    camera,
    time,
    still,
    disposables,
    onFrame: (update) => updates.push(update),
    disposed: false,
    dispose() {
      stage.disposed = true
      renderer.setAnimationLoop(null)
      for (const item of disposables) item.dispose()
    },
  }
  return stage
}

// A film and, given a floor, its mirror image: `subject` is what you pose, the
// `reflection` group must be posed the same (see mirrorPose).
export type Film = {
  subject: THREE.Group
  reflection: THREE.Group
  // Surface geometry of each face; the rear is the front turned round y.
  faces: { front: THREE.BufferGeometry; rear: THREE.BufferGeometry }
  // Turns the foil's light without turning the film.
  tilt: THREE.Vector2
  // Resolves once the art is drawn and on the film.
  ready: Promise<void>
}

type FilmOptions = {
  // Mirror floor height; no reflection without one.
  floorY?: number
  // Planes cutting the film and its solid parts away.
  clip?: Array<THREE.Plane>
}

export function addFilm(
  stage: Stage,
  spec: FilmSpec,
  { floorY, clip }: FilmOptions = {}
): Film {
  const { renderer, scene, disposables } = stage
  const subject = new THREE.Group()
  const reflection = new THREE.Group()
  scene.add(subject)
  if (floorY !== undefined) {
    const mirror = new THREE.Group()
    mirror.position.y = 2 * floorY
    mirror.scale.y = -1
    mirror.add(reflection)
    scene.add(mirror)
  }
  const back = spec.geometry.clone().rotateY(Math.PI)
  for (const solid of spec.solids ?? []) {
    if (clip) for (const part of solid.material) part.clippingPlanes = clip
    subject.add(solid)
  }
  const foil: Foil = {
    ramp: canvasTexture(drawFoilRamp(spec.stops), renderer),
    time: stage.time,
    tilt: new THREE.Vector2(),
  }
  disposables.push(
    spec.geometry,
    back,
    foil.ramp,
    ...(spec.solids ?? []).flatMap((solid) => [
      solid.geometry,
      ...solid.material,
    ])
  )

  async function dress() {
    const { front, rear, shape, marquees = [] } = await spec.draw()
    if (stage.disposed) return
    const outline = canvasTexture(shape, renderer)
    disposables.push(outline)
    const printed = marquees.map((marquee) => {
      const map = canvasTexture(marquee.art, renderer)
      map.premultiplyAlpha = true
      map.wrapS = THREE.RepeatWrapping
      disposables.push(map)
      return { ...marquee, map }
    })
    const faces = rear
      ? ([
          [front, spec.geometry],
          [rear, back],
        ] as const)
      : ([[front, spec.geometry]] as const)
    for (const [art, surface] of faces) {
      const map = canvasTexture(art, renderer)
      // Premultiplied so mipmaps don't fringe the ink edges with black.
      map.premultiplyAlpha = true
      // Marquees print on the front only.
      const print = {
        ink: map,
        shape: outline,
        foil,
        marquees: art === front ? printed : [],
      }
      const material = filmMaterial(spec, print)
      if (clip) material.clippingPlanes = clip
      disposables.push(map, material)
      subject.add(new THREE.Mesh(surface, material))
      if (floorY === undefined) continue
      const mirrored = filmMaterial(spec, print, true)
      disposables.push(mirrored)
      reflection.add(new THREE.Mesh(surface, mirrored))
    }
  }

  return {
    subject,
    reflection,
    faces: { front: spec.geometry, rear: back },
    tilt: foil.tilt,
    ready: dress(),
  }
}

export function mirrorPose({ subject, reflection }: Film) {
  reflection.position.copy(subject.position)
  reflection.quaternion.copy(subject.quaternion)
  reflection.scale.copy(subject.scale)
  reflection.visible = subject.visible
}

// Where to aim, null when away. Mice aim on hover, -0.5..0.5 across the
// element; with `touch`, a finger drags from where it landed, -1..1.
export function trackPointer(
  element: HTMLElement,
  stage: Stage,
  { touch = false } = {}
) {
  // `touch` is true while the aim comes from a finger.
  const pointer: { at: { x: number; y: number } | null; touch: boolean } = {
    at: null,
    touch: false,
  }
  let origin = { x: 0, y: 0 }
  const onDown = (event: PointerEvent) => {
    if (!touch || event.pointerType !== "touch") return
    origin = { x: event.clientX, y: event.clientY }
    pointer.at = { x: 0, y: 0 }
    pointer.touch = true
  }
  const onMove = (event: PointerEvent) => {
    const box = element.getBoundingClientRect()
    if (event.pointerType === "touch") {
      if (!touch || !pointer.at) return
      // A half-width swipe reaches the full turn.
      const reach = Math.min(box.width, box.height) / 2
      pointer.at = {
        x: THREE.MathUtils.clamp((event.clientX - origin.x) / reach, -1, 1),
        y: THREE.MathUtils.clamp((event.clientY - origin.y) / reach, -1, 1),
      }
      return
    }
    // A held mouse button is a drag, not a hover.
    if (event.buttons) return
    pointer.touch = false
    pointer.at = {
      x: (event.clientX - box.left) / box.width - 0.5,
      y: (event.clientY - box.top) / box.height - 0.5,
    }
  }
  const onLeave = () => {
    pointer.at = null
    pointer.touch = false
  }
  element.addEventListener("pointerdown", onDown)
  element.addEventListener("pointermove", onMove)
  element.addEventListener("pointerleave", onLeave)
  element.addEventListener("pointercancel", onLeave)
  stage.disposables.push({
    dispose() {
      element.removeEventListener("pointerdown", onDown)
      element.removeEventListener("pointermove", onMove)
      element.removeEventListener("pointerleave", onLeave)
      element.removeEventListener("pointercancel", onLeave)
    },
  })
  return pointer
}

// One film on its own stage: sways, bobs and turns towards the pointer.
export function mountFilmScene(
  canvas: HTMLCanvasElement,
  spec: FilmSpec,
  mirror = true
) {
  const stage = createStage(canvas)
  // Mirror floor just under the lowest bob (+6).
  const film = addFilm(stage, spec, {
    floorY: mirror ? -spec.height / 2 + 4 : undefined,
  })
  const pointer = trackPointer(canvas, stage, { touch: true })
  const { subject } = film
  stage.onFrame((time, delta) => {
    const at = pointer.at
    const sway = at ? 0 : Math.sin((time * Math.PI * 2) / 9) * 0.14
    const targetY = sway + (at?.x ?? 0) * 0.8
    const targetX = (at?.y ?? 0) * 0.7
    const ease = 1 - 0.92 ** (delta * 60)
    subject.rotation.y += (targetY - subject.rotation.y) * ease
    subject.rotation.x += (targetX - subject.rotation.x) * ease
    // Same 5s bob as the CSS packs.
    subject.position.y = 6 + 4 * (1 - Math.cos((time * Math.PI * 2) / 5))
    mirrorPose(film)
  })
  return { ...stage, film }
}
