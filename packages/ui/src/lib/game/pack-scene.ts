import {
  mountFilmScene,
  type FilmSpec,
} from "@workspace/ui/lib/game/film-scene"
import {
  CUT,
  drawPackArt,
  PACK_H,
  PACK_W,
  SEAL,
} from "@workspace/ui/lib/game/pack-art"
import { FOIL } from "@workspace/ui/lib/game/theme"
import * as THREE from "three"

const PUFF = 16 // max bulge per face, in pack px
const RISE = 64 // how far from a seal the film takes to reach full bulge

// The strip the cut takes off: the top of the film, down past the ragged tear.
export const STRIP_BAND = CUT + 8
const TEAR_Y = PACK_H / 2 - CUT
// The strip's centre line, above the tear.
const STRIP_MIDLINE = CUT - STRIP_BAND / 2

// Inflated pillow: flat seals, straight side edges, film rounding off at the
// rim and pleating where it is gathered into the seals.
function bulge(x: number, y: number) {
  const fromSeal = PACK_H / 2 - SEAL - Math.abs(y)
  if (fromSeal <= 0) return 0
  const t = Math.min(fromSeal / RISE, 1)
  const across = (1 - Math.abs(x / (PACK_W / 2)) ** 5) ** 0.4
  const along = 1 - (1 - t) ** 3
  const pleats =
    Math.sin(x * 0.27 + 1.6 * Math.sin(x * 0.061)) * Math.exp(-fromSeal / 9)
  return PUFF * across * along * (1 + 0.6 * pleats)
}

// The film's top `band` px (all of it by default), mapped as on the full pack.
function filmGeometry(band = PACK_H) {
  const geometry = new THREE.PlaneGeometry(
    PACK_W,
    band,
    160,
    Math.ceil((260 * band) / PACK_H)
  ).translate(0, (PACK_H - band) / 2, 0)
  const position = geometry.attributes.position
  const uv = geometry.attributes.uv
  if (!position || !uv) throw new Error("Plane without positions")
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index)
    position.setZ(index, bulge(position.getX(index), y))
    uv.setY(index, y / PACK_H + 0.5)
  }
  geometry.computeVertexNormals()
  return geometry
}

export const packFilm = (draw: FilmSpec["draw"], band?: number): FilmSpec => ({
  width: PACK_W,
  height: PACK_H,
  geometry: filmGeometry(band),
  stops: FOIL,
  streak: 0.18,
  seal: SEAL,
  draw,
})

export const mountPackScene = (
  canvas: HTMLCanvasElement,
  covers: ReadonlyArray<string>
) =>
  mountFilmScene(
    canvas,
    packFilm(() => drawPackArt(covers))
  ).dispose

const flat = new WeakMap<THREE.BufferGeometry, THREE.BufferAttribute>()
// Total turn at the strip's free end when fully curled, in radians.
const CURL_TURN = 1.4 * Math.PI
// How far the strip folds back on its torn edge: some at the anchored end,
// most at the loose one, so it twists along its length.
const HINGE = 1.1
const STEPS = 160

// The strip's centre line, sampled every PACK_W / STEPS from its right end:
// x, z and turn per sample. It bends more and more towards the loose end.
function curlSpine(amount: number) {
  const step = PACK_W / STEPS
  const spine = new Float32Array((STEPS + 2) * 3)
  let x = PACK_W / 2
  let z = 0
  for (let index = 0; index <= STEPS + 1; index += 1) {
    const angle = amount * CURL_TURN * Math.min(index / STEPS, 1) ** 2
    spine.set([x, z, angle], index * 3)
    x -= Math.cos(angle) * step
    z += Math.sin(angle) * step
  }
  return spine
}

// Peels the cut strip off like a ribbon of foil springing free: anchored at
// the right end, where the cut finished, it rolls up from the loose left end
// and folds back on its torn edge. `amount` goes 0..1. Bent in pack space, so
// the front and rear faces share the spine and their puff (±z) rides its
// normal: they stay one sheet. `twist` turns its ends opposite ways about its
// length, in radians end to end.
export function curl(
  geometry: THREE.BufferGeometry,
  amount: number,
  twist = 0
) {
  const position = geometry.getAttribute("position")
  if (!(position instanceof THREE.BufferAttribute)) return
  const base = flat.get(geometry) ?? position.clone()
  flat.set(geometry, base)
  const spine = curlSpine(amount)
  const at = (sample: number, axis: number) => spine[sample * 3 + axis] ?? 0
  for (let index = 0; index < position.count; index += 1) {
    const along = THREE.MathUtils.clamp(
      ((PACK_W / 2 - base.getX(index)) / PACK_W) * STEPS,
      0,
      STEPS
    )
    const low = Math.floor(along)
    const t = along - low
    const blend = (axis: number) =>
      THREE.MathUtils.lerp(at(low, axis), at(low + 1, axis), t)
    const angle = blend(2)
    const puff = base.getZ(index)
    const z = blend(1) + puff * Math.cos(angle)
    // Fold back round the tear: the roll towards the viewer turns upward.
    const hinge = -amount * HINGE * (0.35 + 0.65 * (along / STEPS))
    const up = base.getY(index) - TEAR_Y
    const bentY = up * Math.cos(hinge) - z * Math.sin(hinge)
    const bentZ = up * Math.sin(hinge) + z * Math.cos(hinge)
    // Twisted about the strip's centre line, more the further from its middle.
    const turn = twist * (along / STEPS - 0.5)
    const across = bentY - STRIP_MIDLINE
    position.setXYZ(
      index,
      blend(0) + puff * Math.sin(angle),
      TEAR_Y + STRIP_MIDLINE + across * Math.cos(turn) - bentZ * Math.sin(turn),
      across * Math.sin(turn) + bentZ * Math.cos(turn)
    )
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
}

const GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`

// The seam glow band is 18 px; the plane is taller so the cutting glint's
// rays fit.
const GLOW_H = 36

const GLOW_FRAGMENT = /* glsl */ `
  uniform float time;
  uniform float cut;
  uniform float tail;
  uniform float fade;
  varying vec2 vUv;
  void main() {
    // Pack px along the seam from its left end, and across it.
    vec2 at = vec2( vUv.x * ${PACK_W.toFixed(1)}, ( vUv.y - 0.5 ) * ${GLOW_H.toFixed(1)} );
    float across = abs( at.y ) / 9.0;
    float core = exp( -across * across / 0.01 );
    float halo = exp( -across * across / 0.2025 );
    // Holo tint drifting along the seam, like the foil around it.
    vec3 tint = 0.6 + 0.4 * cos( 6.2832 * ( vUv.x * 0.7 - time * 0.2 + vec3( 0.0, 0.333, 0.667 ) ) );
    // Light runs along it, and the stretch already cut burns brighter.
    float run = pow( 0.5 + 0.5 * sin( vUv.x * 14.0 - time * 6.0 ), 8.0 );
    float lit = step( vUv.x, cut );
    float glow = 0.8 + 0.2 * sin( time * 4.0 ) + run + 1.2 * lit;
    float ends = smoothstep( 0.0, 0.05, vUv.x ) * ( 1.0 - smoothstep( 0.95, 1.0, vUv.x ) );
    vec3 seam = ( vec3( core ) + 0.55 * halo * tint ) * glow * ends;
    // While cutting, a comet rides the finger: a four-point glint with a
    // trail that lags behind it, so it stretches the faster the finger goes.
    float cutting = step( 0.001, cut ) * ( 1.0 - step( 1.0, cut ) );
    float head = cut * ${PACK_W.toFixed(1)};
    float back = min( tail * ${PACK_W.toFixed(1)}, head - 28.0 );
    float along = clamp( ( at.x - back ) / ( head - back ), 0.0, 1.0 ) * step( at.x, head );
    float comet = along * along * exp( -at.y * at.y / ( 1.0 + 50.0 * along ) );
    // Sparks shed off the trail, spreading out as it passes.
    float cell = floor( at.x / 4.0 );
    float seed = fract( sin( cell * 91.7 ) * 43758.5 );
    vec2 fleck = vec2( ( cell + 0.5 ) * 4.0, ( seed - 0.5 ) * 32.0 * ( 1.0 - along ) );
    float spark = exp( -dot( at - fleck, at - fleck ) / 1.6 ) * sqrt( along ) * step( 0.3, seed )
      * ( 0.5 + 0.5 * sin( time * 24.0 + seed * 40.0 ) );
    vec2 d = at - vec2( head, 0.0 );
    float rays = exp( -abs( d.y ) / 0.8 - abs( d.x ) / 14.0 ) + exp( -abs( d.x ) / 0.8 - abs( d.y ) / 11.0 );
    float star = ( 3.0 * exp( -dot( d, d ) / 10.0 ) + 1.5 * rays ) * ( 0.85 + 0.15 * sin( time * 9.0 ) );
    vec3 trail = ( 1.6 * comet + 2.0 * spark ) * tint + vec3( star );
    gl_FragColor = vec4( ( seam + cutting * trail ) * fade, 1.0 );
  }
`

// Glowing seam laid on the puffed front film where the pack cuts open; `cut`
// (0..1) lights it from the left as the finger passes, with a comet at the
// finger whose trail ends at `tail`; `fade` shows it.
export function cutGlow(time: { value: number }) {
  const geometry = new THREE.PlaneGeometry(PACK_W, GLOW_H, 116, 12).translate(
    0,
    PACK_H / 2 - CUT,
    0
  )
  const position = geometry.attributes.position
  if (!position) throw new Error("Plane without positions")
  for (let index = 0; index < position.count; index += 1) {
    position.setZ(index, bulge(position.getX(index), position.getY(index)) + 1)
  }
  const uniforms = {
    time,
    cut: { value: 0 },
    tail: { value: 0 },
    fade: { value: 0 },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    // Adds light but leaves alpha alone, so it never paints black over the
    // see-through canvas once the pack is gone.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
  })
  return { mesh: new THREE.Mesh(geometry, material), uniforms }
}

const INSIDE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`

// Silver foil: brushed metal, a touch dimmer along the middle of `uv`, with
// rainbow reflections sliding across it. The pack's lining, and the NEW badge.
export const SILVER_FOIL = /* glsl */ `
  vec3 silverFoil( vec2 uv, float time ) {
    float across = abs( uv.y - 0.5 ) * 2.0;
    float brushed = 0.04 * sin( uv.x * 420.0 + sin( uv.x * 37.0 ) * 3.0 );
    vec3 silver = mix( vec3( 0.7, 0.72, 0.8 ), vec3( 0.97, 0.97, 1.0 ), across * across ) + brushed;
    vec3 tint = 0.6 + 0.4 * cos( 6.2832 * ( uv.x * 1.3 + uv.y * 0.5 - time * 0.15 + vec3( 0.0, 0.333, 0.667 ) ) );
    float band = pow( 0.5 + 0.5 * sin( uv.x * 11.0 - uv.y * 5.0 - time * 1.4 ), 6.0 );
    float glint = pow( 0.5 + 0.5 * sin( uv.x * 27.0 + uv.y * 9.0 + time * 0.9 ), 24.0 );
    return min( silver * mix( vec3( 0.85 ), vec3( 1.0 ), tint ) + 0.45 * band * tint + 0.5 * glint, 1.0 );
  }
`

// The pack's lining.
const INSIDE_FRAGMENT = /* glsl */ `
  uniform float time;
  varying vec2 vUv;
  ${SILVER_FOIL}
  void main() {
    gl_FragColor = vec4( silverFoil( vUv, time ), 1.0 );
  }
`

// The opened pack's mouth: the silver foil lining seen between its two films
// once the strip is off.
export function packInside(time: { value: number }) {
  const y = TEAR_Y - 1.6
  const geometry = new THREE.PlaneGeometry(PACK_W, 2, 96, 6).rotateX(
    -Math.PI / 2
  )
  const position = geometry.attributes.position
  if (!position) throw new Error("Plane without positions")
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const across = position.getZ(index)
    // The rear film is the front turned round y, so its puff is mirrored.
    const reach = across < 0 ? bulge(-x, y) : bulge(x, y)
    position.setXYZ(index, x, y, across * reach)
  }
  const material = new THREE.ShaderMaterial({
    uniforms: { time },
    side: THREE.DoubleSide,
    vertexShader: INSIDE_VERTEX,
    fragmentShader: INSIDE_FRAGMENT,
  })
  return new THREE.Mesh(geometry, material)
}
