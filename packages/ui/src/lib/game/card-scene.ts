import {
  CARD_H,
  CARD_RADIUS,
  CARD_W,
  drawCardArt,
  drawCardBack,
  drawSticker,
  STICKER,
} from "@workspace/ui/lib/game/card-art"
import { canvasTexture } from "@workspace/ui/lib/game/film-material"
import {
  mountFilmScene,
  type FilmSpec,
  type Trim,
} from "@workspace/ui/lib/game/film-scene"
import { SILVER_FOIL } from "@workspace/ui/lib/game/pack-scene"
import {
  CELEBRATION,
  celebrations,
  easeInOut,
  FLY,
  mix,
  PILE_ZOOM,
  place,
  pose,
  RISE,
  SHINE,
  span,
  type Pose,
} from "@workspace/ui/lib/game/reveal-motion"
import { RARITIES, type GameSong } from "@workspace/ui/lib/game/theme"
import * as THREE from "three"

// Card stock: about 0.5 mm on a 63 mm wide card.
const THICKNESS = 2

// Borders go from flat ink to plain silver, a two-tone foil, then gold with
// racing light; each has a dark tone so it stands off the card colour.
const SILVER: Trim = { tones: ["#3b4152", "#9aa3b8", "#f4f6ff"], bands: 1.2 }
const ORCHID: Trim = { tones: ["#4a1468", "#b04ce0", "#ffd6ff"], bands: 2 }
const GOLD: Trim = {
  tones: ["#5c3200", "#c98a1c", "#f3d27a"],
  bands: 2,
  race: true,
}

// Rarer cards get more holo (like the 2D shader presets), fancier borders and
// a metallic edge; glitter flakes grow into glints (epic) and flaring stars
// (legendary).
const RARITY = {
  common: { level: 0.2, metal: 0, sparkle: "flakes" },
  rare: {
    level: 0.5,
    trim: SILVER,
    metal: 0.4,
    sparkle: "flakes",
    glitter: 2,
  },
  epic: { level: 0.8, trim: ORCHID, metal: 0.7, sparkle: "glints" },
  legendary: { level: 1.2, trim: GOLD, metal: 1, sparkle: "stars" },
} as const

// The card stock's cut edge: the outline extruded, walls only (the printed
// faces cover the caps).
function cardEdge(color: string, metal: number) {
  const outline = new THREE.Shape()
  outline.moveTo(-CARD_W / 2 + CARD_RADIUS, -CARD_H / 2)
  for (const [x, y, angle] of [
    [CARD_W / 2 - CARD_RADIUS, -CARD_H / 2 + CARD_RADIUS, -Math.PI / 2],
    [CARD_W / 2 - CARD_RADIUS, CARD_H / 2 - CARD_RADIUS, 0],
    [-CARD_W / 2 + CARD_RADIUS, CARD_H / 2 - CARD_RADIUS, Math.PI / 2],
    [-CARD_W / 2 + CARD_RADIUS, -CARD_H / 2 + CARD_RADIUS, Math.PI],
  ] as const) {
    outline.absarc(x, y, CARD_RADIUS, angle, angle + Math.PI / 2)
  }
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: THICKNESS,
    bevelEnabled: false,
    curveSegments: 16,
  }).translate(0, 0, -THICKNESS / 2)
  const caps = new THREE.MeshBasicMaterial({ visible: false })
  const walls = new THREE.MeshPhysicalMaterial({
    color,
    metalness: metal,
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.2,
    // Rarer edges catch prism colours as they turn, like the trim.
    iridescence: metal,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [200, 800],
  })
  return new THREE.Mesh(geometry, [caps, walls])
}

export const CARD_THICKNESS = THICKNESS

export function cardFilm(song: GameSong): FilmSpec {
  const { metal, ...look } = RARITY[song.rarity]
  const stops = RARITIES[song.rarity]
  return {
    width: CARD_W,
    height: CARD_H,
    geometry: new THREE.PlaneGeometry(CARD_W, CARD_H).translate(
      0,
      0,
      THICKNESS / 2
    ),
    stops,
    ...look,
    // Common cards keep the 2D ink edge; rarer ones show their foil colour.
    solids: [cardEdge(metal ? (stops[0]?.[0] ?? "#121016") : "#121016", metal)],
    draw: () => drawCardArt(song),
  }
}

// NEW sticker stuck on the card's face, above the foil border and its glare.
// With `time`, its pill is the pack lining's silver foil, rainbow reflections
// and all, with ink lettering. Returns the mesh and what to dispose.
export function newSticker(
  renderer: THREE.WebGLRenderer,
  label?: string,
  color?: string,
  time?: { value: number }
) {
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    // The canvas is premultiplied, so blend it as such.
    premultipliedAlpha: true,
  })
  if (time) foilSticker(material, time)
  const geometry = new THREE.PlaneGeometry(STICKER.w, STICKER.h)
  // A white pill marks where the foil goes; ink reads on silver.
  const art = time
    ? drawSticker(label, "#ffffff", "#121016")
    : drawSticker(label, color)
  const texture = art.then((canvas) => {
    const map = canvasTexture(canvas, renderer)
    map.premultiplyAlpha = true
    material.map = map
    material.needsUpdate = true
    return map
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(
    STICKER.x - CARD_W / 2,
    CARD_H / 2 - STICKER.y,
    THICKNESS / 2 + 0.4
  )
  mesh.rotation.z = -STICKER.tilt
  mesh.renderOrder = 1
  return {
    mesh,
    dispose() {
      geometry.dispose()
      material.dispose()
      void texture.then((map) => map.dispose())
    },
  }
}

// Turns the sticker's white pill into silver foil. The ink label and outline
// keep their print colour.
function foilSticker(
  material: THREE.MeshBasicMaterial,
  time: { value: number }
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.time = time
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `uniform float time;\n${SILVER_FOIL}\nvoid main() {`
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
        #ifdef USE_MAP
        {
          vec3 ink = diffuseColor.rgb / max( diffuseColor.a, 0.001 );
          // The pill is white; the label and the edge are ink, the shadow dark.
          float pill = smoothstep( 0.6, 0.9, min( ink.r, min( ink.g, ink.b ) ) ) * diffuseColor.a;
          // The pill sits in the middle 60 x 26 of the 76 x 40 sticker.
          vec2 uv = clamp( ( vMapUv - vec2( 0.105, 0.175 ) ) / vec2( 0.79, 0.65 ), 0.0, 1.0 );
          diffuseColor.rgb = mix( diffuseColor.rgb, silverFoil( uv, time ) * diffuseColor.a, pill );
        }
        #endif`
      )
  }
}

// The back face, shared by every card on a stage (add one Mesh per card).
export function cardBack(renderer: THREE.WebGLRenderer) {
  const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H)
    .rotateY(Math.PI)
    .translate(0, 0, -THICKNESS / 2)
  const material = new THREE.MeshPhysicalMaterial({
    alphaTest: 0.5,
    roughness: 0.5,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
  })
  const texture = drawCardBack().then((art) => {
    const map = canvasTexture(art, renderer)
    material.map = map
    material.needsUpdate = true
    return map
  })
  return {
    geometry,
    material,
    dispose() {
      geometry.dispose()
      material.dispose()
      void texture.then((map) => map.dispose())
    },
  }
}

const SHINE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`

const SHINE_FRAGMENT = /* glsl */ `
  uniform float progress;
  varying vec2 vUv;
  void main() {
    // Rounded card outline, so the light stays on the card.
    vec2 size = vec2( ${CARD_W.toFixed(1)}, ${CARD_H.toFixed(1)} );
    vec2 inside = abs( ( vUv - 0.5 ) * size ) - ( 0.5 * size - ${CARD_RADIUS.toFixed(1)} );
    float edge = length( max( inside, 0.0 ) ) - ${CARD_RADIUS.toFixed(1)};
    float card = 1.0 - smoothstep( -1.0, 0.0, edge );
    // A wide soft band with a bright core and a thin trailing glint, sweeping
    // from the bottom-left corner to the top-right one. Measured across the
    // card's real diagonal, so the band stays at the same angle on screen.
    vec2 onCard = vUv * size;
    float along = dot( onCard, normalize( vec2( 1.0, 1.0 ) ) ) / ( ( size.x + size.y ) * 0.70711 );
    float at = mix( -0.15, 1.15, progress );
    float band = exp( -pow( ( along - at ) / 0.09, 2.0 ) )
      + 1.6 * exp( -pow( ( along - at ) / 0.025, 2.0 ) )
      + 0.7 * exp( -pow( ( along - at + 0.13 ) / 0.015, 2.0 ) );
    float fade = smoothstep( 0.0, 0.08, progress ) * ( 1.0 - smoothstep( 0.92, 1.0, progress ) );
    gl_FragColor = vec4( vec3( 1.0, 0.94, 0.78 ) * band * fade * card * 0.9, 1.0 );
  }
`

// Light sweeping across a card's face: set `progress` 0..1 to move it.
export function cardShine() {
  const uniforms = { progress: { value: 0 } }
  const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H)
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    // Adds light, leaves alpha, like the pack's cut glow.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    vertexShader: SHINE_VERTEX,
    fragmentShader: SHINE_FRAGMENT,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.z = THICKNESS / 2 + 0.6
  mesh.renderOrder = 2
  mesh.visible = false
  return {
    mesh,
    uniforms,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}

// Where a card sits on screen (CSS px): its middle and width, plus the light
// tilt and foil clock it is drawn with there, so a handover doesn't flicker.
export type CardSlot = {
  x: number
  y: number
  width: number
  tilt?: { x: number; y: number }
  time?: number
}

export type CardSceneOptions = {
  mirror?: boolean
  // Pack-opening entrance: rise into place, then celebrate.
  reveal?: boolean
  // Fly in from this slot, e.g. a card picked from a grid, then celebrate.
  from?: CardSlot
  // Where a flown-in card lands (CSS px from the canvas middle, y down) and
  // its width there; defaults to the middle at the opened pile's size.
  land?: { y: number; width: number }
}

export type CardScene = {
  dispose: () => void
  // Resolves once the card is drawn where it starts.
  ready: Promise<void>
  // Sends the card back to a slot; resolves once it is there.
  flyBack: (to: () => CardSlot | null) => Promise<void>
}

export function mountCardScene(
  canvas: HTMLCanvasElement,
  song: GameSong,
  { mirror = true, reveal = false, from, land }: CardSceneOptions = {}
): CardScene {
  const stage = mountFilmScene(canvas, cardFilm(song), mirror)
  const flight = from && !stage.still ? flyCard(stage, song, from, land) : null
  if (!flight && land) frame(stage, land)
  if (!flight && reveal && !stage.still) revealCard(stage, song, !land)
  // A frame after the art lands, so the card is on screen.
  const ready = stage.film.ready.then(
    () => new Promise<void>((done) => requestAnimationFrame(() => done()))
  )
  return {
    dispose: stage.dispose,
    ready,
    flyBack: (to) => flight?.flyBack(to) ?? Promise.resolve(),
  }
}

type CardStage = ReturnType<typeof mountFilmScene>

// Groups carrying an entrance round the film and its mirror image, so the
// inner film keeps its sway and bob; plus the back and light sweep the
// celebrations show.
function entrance(stage: CardStage) {
  const { subject, reflection } = stage.film
  // The legendary spin turns the card round, so it needs its back.
  const back = cardBack(stage.renderer)
  subject.add(new THREE.Mesh(back.geometry, back.material))
  const shine = cardShine()
  subject.add(shine.mesh)
  stage.disposables.push(back, shine)
  const motion = new THREE.Group()
  const mirrored = new THREE.Group()
  subject.parent?.add(motion)
  reflection.parent?.add(mirrored)
  motion.add(subject)
  mirrored.add(reflection)
  return { motion, mirrored, shine }
}

// Once landed, epic and legendary cards play their first-pull celebration
// and light sweep.
function celebrate(
  rarity: GameSong["rarity"],
  at: Pose,
  since: number,
  shine: ReturnType<typeof cardShine>
) {
  const progress = rarity === "legendary" ? span(since, SHINE) : 0
  shine.uniforms.progress.value = progress
  shine.mesh.visible = progress > 0 && progress < 1
  const partying =
    (rarity === "epic" || rarity === "legendary") &&
    since >= 0 &&
    since < CELEBRATION[rarity]
  return partying ? celebrations[rarity](at, since) : at
}

// Frames the card where `land` asks: sized, and the picture shifted (mirror
// floor included) so the card stays head-on. Returns the zoom in CSS px per
// world unit and the shift in CSS px below the canvas middle.
function frame(stage: CardStage, land: CardSceneOptions["land"]) {
  const canvas = stage.renderer.domElement
  const { clientWidth: width, clientHeight: height } = canvas
  // Landed like the opened pile (or as asked), always clear of the sides.
  const zoom = Math.min(
    land ? land.width / CARD_W : PILE_ZOOM,
    (width - 48) / CARD_W
  )
  stage.camera.position.z /= zoom
  const shift = land?.y ?? 0
  // The view window moves the other way to the picture.
  if (shift) stage.camera.setViewOffset(width, height, 0, -shift, width, height)
  return { zoom, shift }
}

// Pack-opening entrance on a phone-sized canvas framed like the opened pile:
// the card rises into place, then celebrates.
function revealCard(stage: CardStage, song: GameSong, pile: boolean) {
  if (pile) stage.camera.position.z /= PILE_ZOOM
  const { motion, mirrored, shine } = entrance(stage)
  const start = stage.time.value
  stage.onFrame((time) => {
    const since = time - start
    const rise = easeInOut(span(since, [0, RISE]))
    // Starts low but fully in view, like a card rising out of the pack.
    const low = pose({ y: -150, z: -160, rx: 0.4, s: 0.8 })
    const at = celebrate(
      song.rarity,
      mix(low, pose({}), rise),
      since - RISE,
      shine
    )
    place(motion, at)
    place(mirrored, at)
  })
}

// How far a flying card lifts towards the viewer mid-flight.
const LIFT = 140

// A card picked from a grid: drawn exactly over its slot, it lifts out, flies
// to the middle and celebrates; flyBack lays it back in a slot.
function flyCard(
  stage: CardStage,
  song: GameSong,
  from: CardSlot,
  land?: CardSceneOptions["land"]
) {
  const { motion, mirrored, shine } = entrance(stage)
  const canvas = stage.renderer.domElement
  const { subject, tilt } = stage.film
  // The canvas spans the page, so cap its resolution; the card stays sharp.
  stage.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  const { zoom, shift } = frame(stage, land)
  if (from.time !== undefined) stage.time.value = from.time
  // A world unit is `zoom` CSS px at depth 0, and the film is CARD_W wide.
  const slotPose = (slot: CardSlot) => {
    const box = canvas.getBoundingClientRect()
    return pose({
      x: (slot.x - box.left - box.width / 2) / zoom,
      y: (box.top + box.height / 2 + shift - slot.y) / zoom,
      s: slot.width / (CARD_W * zoom),
    })
  }
  const start = slotPose(from)
  let leaving: {
    at: number
    from: Pose
    to: () => CardSlot | null
  } | null = null
  let landed: (() => void) | null = null
  // Time starts on the first drawn frame, so the flight isn't eaten by loading.
  let began: number | null = null
  void stage.film.ready.then(() => (began = stage.time.value))
  stage.onFrame((time) => {
    let at: Pose
    // How far the card is from its slot: 0 sits flat in it, 1 is free.
    let out: number
    let slot = from
    if (leaving) {
      const t = span(time - leaving.at, [0, FLY])
      slot = leaving.to() ?? from
      out = 1 - t
      at = mix(leaving.from, slotPose(slot), easeInOut(t))
      at.z += LIFT * Math.sin(Math.PI * t)
      at.rx -= 0.3 * Math.sin(Math.PI * t)
      if (t >= 1) {
        landed?.()
        landed = null
      }
    } else {
      const since = began === null ? 0 : time - began
      const t = span(since, [0, FLY])
      out = t
      at = mix(start, pose({}), easeInOut(t))
      at.z += LIFT * Math.sin(Math.PI * t)
      at.rx += 0.3 * Math.sin(Math.PI * t)
      at = celebrate(song.rarity, at, since - FLY, shine)
    }
    // In its slot the card sits flat and lit like the thumb: the outer group
    // cancels the film's sway and bob there, and they grow in as it flies.
    const held = 1 - out
    at.rx -= subject.rotation.x * held
    at.ry -= subject.rotation.y * held
    at.y -= subject.position.y * held * at.s
    tilt.set((slot.tilt?.x ?? 0) * held, (slot.tilt?.y ?? 0) * held)
    stage.scene.environmentRotation.set(tilt.y, -tilt.x, 0)
    place(motion, at)
    place(mirrored, at)
    // The mirror floor belongs under the landed card, not mid-flight.
    mirrored.visible = out >= 1 && !leaving
  })
  return {
    flyBack(to: () => CardSlot | null) {
      shine.mesh.visible = false
      const at = pose({
        x: motion.position.x,
        y: motion.position.y,
        z: motion.position.z,
        rx: motion.rotation.x,
        // Mid-spin, take the short way round.
        ry: Math.atan2(
          Math.sin(motion.rotation.y),
          Math.cos(motion.rotation.y)
        ),
        rz: motion.rotation.z,
        s: motion.scale.x,
      })
      leaving = { at: stage.time.value, from: at, to }
      return new Promise<void>((done) => {
        landed = done
      })
    },
  }
}
