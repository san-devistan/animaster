import type { Stops } from "@workspace/ui/lib/game/theme"
import * as THREE from "three"

// A line of print in its own box (film px from the top-left) that scrolls
// sideways when too long: `art` is one `cycle` px of a seamless loop. Speed 0
// keeps it still; each end of the box fades over `fade` px.
export type Marquee = {
  art: HTMLCanvasElement
  box: { x: number; y: number; width: number; height: number }
  cycle: number
  speed: number
  fade: number
}

// A printed film over holo foil: the spec, its shaders and the material. The
// pack and the song cards are both films; only the art differs.
export type FilmSpec = {
  width: number
  height: number
  // Front face, facing +z; the rear (if any) is this turned around.
  geometry: THREE.BufferGeometry
  stops: Stops
  // Holo strength; 1 = the pack.
  level?: number
  // Glitter flake strength; defaults to level.
  glitter?: number
  // Rolling light down the side of a puffed film, kept off the flat seals.
  streak?: number
  seal?: number
  // Metal foil on the trim (the shape texture's red channel): dark, mid and
  // light tones banded across it, optionally with light racing round. None
  // leaves the trim as printed.
  trim?: Trim
  // What glitters: tiny flakes (default), mid-size glints (epic), or flaring
  // stars with a sweeping gold sheen (legendary).
  sparkle?: "flakes" | "glints" | "stars"
  // Solid parts posed with the film, like a card's edge.
  solids?: Array<THREE.Mesh<THREE.BufferGeometry, Array<THREE.Material>>>
  draw: () => Promise<{
    front: HTMLCanvasElement
    rear?: HTMLCanvasElement
    shape: HTMLCanvasElement
    marquees?: Array<Marquee>
  }>
}

const glsl = (value: number) => value.toFixed(4)

export function canvasTexture(
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer
) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  return texture
}

// `tilt` shifts the foil's light as if the film were turned, without moving it.
export type Foil = {
  ramp: THREE.Texture
  time: { value: number }
  tilt: THREE.Vector2
}

export type Trim = {
  tones: readonly [dark: string, mid: string, light: string]
  // Highlights across the card; more reads as shinier, busier metal.
  bands: number
  race?: boolean
}

const vec3 = (hex: string) => {
  const { r, g, b } = new THREE.Color(hex)
  return `vec3( ${glsl(r)}, ${glsl(g)}, ${glsl(b)} )`
}

// Bands on the same 135deg diagonal as the CSS foil gradients, sliding with
// tilt. The dark tone keeps the trim apart from the card colour.
const trimFragment = ({
  tones: [dark, mid, light],
  bands,
}: Trim) => /* glsl */ `
  float trimMask = texture2D( alphaMap, vAlphaMapUv ).r;
  float trimAt = dot( onFilm, vec2( 0.6, 0.8 ) ) + 0.7 * dot( facing.xy, vec2( 0.8, -0.6 ) );
  float trimShine = 0.5 + 0.5 * cos( 6.2832 * ${glsl(bands)} * trimAt );
  vec3 trimColor = mix( ${vec3(dark)}, ${vec3(mid)}, smoothstep( 0.0, 0.6, trimShine ) );
  trimColor = mix( trimColor, ${vec3(light)}, smoothstep( 0.75, 1.0, trimShine ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, trimColor, trimMask );
`

const raceFragment = (width: number, height: number) => /* glsl */ `
  // Two comets of light racing round every trim, once per 5s; angles are
  // taken round the film's middle, which sits inside each frame.
  vec2 fromMiddle = ( onFilm - 0.5 ) * vec2( ${glsl(width)}, ${glsl(height)} );
  float lap = fract( atan( fromMiddle.y, fromMiddle.x ) / 3.1416 - foilTime * 0.4 );
  totalEmissiveRadiance += trimMask * mix( trimColor, vec3( 1.0 ), 0.3 ) * 0.9 * pow( lap, 14.0 );
`

// Waits 2s, scrolls one loop, waits again; printed over the film's ink.
const marqueeFragment = (index: number, width: number, height: number) => {
  const name = `marquee${index}`
  return /* glsl */ `
  {
    vec2 inBox = vec2( vMapUv.x, 1.0 - vMapUv.y ) * vec2( ${glsl(width)}, ${glsl(height)} ) - ${name}Box.xy;
    vec3 run = ${name}Run;
    float shift = run.y * max( 0.0, mod( foilTime, 2.0 + run.x / max( run.y, 1.0 ) ) - 2.0 );
    float shown = step( 0.0, inBox.x ) * step( inBox.x, ${name}Box.z ) * step( 0.0, inBox.y ) * step( inBox.y, ${name}Box.w )
      * smoothstep( 0.0, max( run.z, 0.001 ), inBox.x ) * smoothstep( 0.0, max( run.z, 0.001 ), ${name}Box.z - inBox.x );
    vec4 line = shown * texture2D( ${name}, vec2( ( inBox.x + shift ) / run.x, 1.0 - inBox.y / ${name}Box.w ) );
    ink = line + ink * ( 1.0 - line.a );
  }
`
}

const foilFragment = (
  { width, height, level = 1, trim }: FilmSpec,
  marquees: number
) => /* glsl */ `
  vec4 ink = texture2D( map, vMapUv );
  ${Array.from({ length: marquees }, (_, index) => marqueeFragment(index, width, height)).join("")}
  vec2 at = vec2( vMapUv.x * ${glsl(width * width)}, ( 1.0 - vMapUv.y ) * ${glsl(height * height)} );
  float t = ( at.x + at.y ) / ${glsl(width * width + height * height)};
  // Bands slide with the surface angle (tilt, puff, pleats) and drift slowly.
  vec3 facing = normalize( vNormal );
  facing.xy += foilTilt;
  t += dot( facing.xy, vec2( 0.45, -0.3 ) );
  t += 0.025 * sin( 6.0 * ( vMapUv.x - vMapUv.y ) + foilTime * 0.7 );
  vec3 foil = texture2D( foilRamp, vec2( t, 0.5 ) ).rgb;
  diffuseColor.rgb *= foil * ( 1.0 - ink.a ) + ink.rgb;
  // Holo film over everything, art included, like the 2D Holographic layer
  // (overlay, 0.45 × level): rainbow patches that swirl as the surface turns.
  vec2 holoAt = vMapUv * vec2( 1.0, ${glsl(height / width)} );
  float blotch = sin( holoAt.x * 4.0 + 1.7 * sin( holoAt.y * 3.0 + foilTime * 0.12 ) )
    + sin( holoAt.y * 5.5 - holoAt.x * 2.0 - foilTime * 0.09 );
  float hue = 0.22 * blotch + 0.8 * dot( holoAt, vec2( 0.5, -0.87 ) )
    + 1.4 * dot( facing.xy, vec2( 0.5, -0.87 ) ) + 0.03 * foilTime;
  vec3 holo = mix( vec3( 0.74 ), 0.5 + 0.5 * cos( 6.2832 * ( hue + vec3( 0.0, 0.333, 0.667 ) ) ), 0.45 );
  vec3 base = diffuseColor.rgb;
  vec3 overlay = mix( 2.0 * base * holo, 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - holo ), step( 0.5, base ) );
  diffuseColor.rgb = mix( base, overlay, ${glsl(Math.min(0.45 * level, 0.6))} );
  // The 2D glare: a soft spot and a 115deg band, screened like light. They sit
  // where the 2D ones rest when the film faces the user, slide with tilt.
  vec2 onFilm = vec2( vMapUv.x, 1.0 - vMapUv.y );
  vec2 slide = facing.xy * vec2( 0.6, -0.6 );
  vec2 spotAt = ( onFilm - vec2( 0.3, 0.2 ) - slide ) * vec2( 1.0, 1.6 );
  float spot = exp( -dot( spotAt, spotAt ) / 0.06 );
  float band = smoothstep( 0.18, 0.0, abs( dot( onFilm, vec2( 0.906, 0.423 ) ) - 0.45 - slide.x ) );
  float glare = clamp( 0.75 * spot + 0.5 * band, 0.0, 1.0 );
  ${trim ? trimFragment(trim) : ""}
  diffuseColor.rgb = 1.0 - ( 1.0 - diffuseColor.rgb ) * ( 1.0 - 0.3 * glare );
`

const flakesFragment = ({
  width,
  height,
  level = 1,
  glitter = level,
}: FilmSpec) => /* glsl */ `
  float flakeSeed = rand( floor( onFilm * vec2( ${glsl(width)}, ${glsl(height)} ) ) );
  float twinkle = 0.5 + 0.5 * sin( foilTime * 2.2 + flakeSeed * 80.0 + ( normal.x + foilTilt.x + foilTilt.y ) * 24.0 );
  float flake = step( 0.985, flakeSeed ) * twinkle * twinkle;
  vec3 flakeTint = 0.5 + 0.5 * cos( 6.2832 * ( hue + 0.33 + flakeSeed * 4.0 + vec3( 0.0, 0.333, 0.667 ) ) );
  totalEmissiveRadiance += flakeTint * flake * ${glsl(0.35 * glitter)};
`

const glintsFragment = ({ width, height }: FilmSpec) => /* glsl */ `
  // Small four-point glints, one per 16px cell at most: denser and quicker
  // than the stars, no diagonals or sheen, tinted by the holo like the flakes.
  vec2 glintAt = onFilm * vec2( ${glsl(width / 16)}, ${glsl(height / 16)} );
  vec2 glintCell = floor( glintAt );
  float glintSeed = rand( glintCell );
  vec2 toGlint = ( fract( glintAt ) - 0.5 - 0.3 * ( vec2( glintSeed, rand( glintCell + 7.3 ) ) - 0.5 ) ) * 16.0;
  float glintPulse = max( 0.0, sin( foilTime * 2.4 + glintSeed * 60.0 + 8.0 * dot( facing.xy, vec2( 1.0, 0.6 ) ) ) );
  glintPulse = pow( glintPulse, 6.0 ) * step( 0.6, glintSeed );
  float glintRays = exp( -abs( toGlint.x ) / 1.6 - toGlint.y * toGlint.y * 2.0 )
    + exp( -abs( toGlint.y ) / 1.6 - toGlint.x * toGlint.x * 2.0 );
  float glintCore = exp( -dot( toGlint, toGlint ) / 1.2 );
  vec3 glintTint = mix( 0.6 + 0.4 * cos( 6.2832 * ( hue + glintSeed * 3.0 + vec3( 0.0, 0.333, 0.667 ) ) ), vec3( 1.0 ), glintCore );
  totalEmissiveRadiance += glintTint * ( 1.4 * glintCore + 0.9 * glintRays ) * glintPulse;
`

const starsFragment = ({ width, height }: FilmSpec) => /* glsl */ `
  // Four-point stars, one per 36px cell at most, that flare and fade; tilting
  // the card sets them off. Rays fade out well inside their cell.
  vec2 starAt = onFilm * vec2( ${glsl(width / 36)}, ${glsl(height / 36)} );
  vec2 starCell = floor( starAt );
  float starSeed = rand( starCell );
  vec2 toStar = ( fract( starAt ) - 0.5 - 0.3 * ( vec2( starSeed, rand( starCell + 7.3 ) ) - 0.5 ) ) * 36.0;
  float pulse = max( 0.0, sin( foilTime * 1.6 + starSeed * 40.0 + 6.0 * dot( facing.xy, vec2( 1.0, 0.6 ) ) ) );
  pulse = pow( pulse, 4.0 ) * step( 0.5, starSeed );
  float reach = mix( 3.0, 6.5, rand( starCell + 3.1 ) );
  vec2 diagonal = mat2( 0.7071, 0.7071, -0.7071, 0.7071 ) * toStar;
  float rays = exp( -abs( toStar.x ) / reach - toStar.y * toStar.y * 1.5 )
    + exp( -abs( toStar.y ) / reach - toStar.x * toStar.x * 1.5 )
    + 0.4 * exp( -abs( diagonal.x ) / ( 0.5 * reach ) - diagonal.y * diagonal.y * 2.0 )
    + 0.4 * exp( -abs( diagonal.y ) / ( 0.5 * reach ) - diagonal.x * diagonal.x * 2.0 );
  float core = exp( -dot( toStar, toStar ) / 3.0 );
  float halo = 0.25 * exp( -dot( toStar, toStar ) / 40.0 );
  vec3 starTint = mix( vec3( 1.0, 0.82, 0.48 ), vec3( 1.0 ), core );
  // Gold sheen sweeping across the card every 5s.
  float sweepAt = dot( onFilm, vec2( 0.55, 0.83 ) ) - ( fract( foilTime * 0.2 ) * 2.4 - 0.7 );
  float sweep = exp( -sweepAt * sweepAt / 0.006 );
  totalEmissiveRadiance += starTint * ( 1.8 * core + 1.3 * rays + halo ) * pulse + vec3( 1.0, 0.82, 0.45 ) * 0.4 * sweep;
`

const sparkleFragments = {
  flakes: flakesFragment,
  glints: glintsFragment,
  stars: starsFragment,
}

// Crisp light on top of the lacquer: the side streak and the sparkle.
const shineFragment = (spec: FilmSpec) => {
  const { width, height, streak = 0, seal = 0, trim, sparkle = "flakes" } = spec
  return /* glsl */ `
  #include <emissivemap_fragment>
  float streak = exp( -pow( ( onFilm.x - 0.19 - slide.x ) / 0.02, 2.0 ) );
  streak *= step( ${glsl(seal / height)}, onFilm.y ) * step( onFilm.y, ${glsl(1 - seal / height)} );
  totalEmissiveRadiance += vec3( ${glsl(streak)} * streak );
  ${trim ? "totalEmissiveRadiance += trimMask * trimColor * 0.4 * glare;" : ""}
  ${trim?.race ? raceFragment(width, height) : ""}
  ${sparkleFragments[sparkle](spec)}
`
}

// Printed film over holo foil, under a gloss lacquer: the print is a diffuse
// colour (no metal), the clearcoat and shine carry the light.
type Print = {
  ink: THREE.Texture
  shape: THREE.Texture
  foil: Foil
  marquees: Array<Marquee & { map: THREE.Texture }>
}

export function filmMaterial(
  spec: FilmSpec,
  { ink, shape, foil, marquees }: Print,
  reflection = false
) {
  const material = new THREE.MeshPhysicalMaterial({
    map: ink,
    alphaMap: shape,
    alphaTest: 0.5,
    transparent: reflection,
    // One-sided in the mirror too (three flips the winding for its negative
    // scale), or a two-faced film's rear would show through its front.
    side: THREE.FrontSide,
    roughness: 0.55,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
    specularIntensity: 0.4,
    iridescence: 0.35,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [250, 500],
  })
  // A define, not a branch in onBeforeCompile, so the two get separate programs.
  if (reflection) material.defines = { ...material.defines, REFLECTION: "" }
  const foilSource = foilFragment(spec, marquees.length)
  const shineSource = shineFragment(spec)
  // three caches programs by onBeforeCompile source, which films share.
  material.customProgramCacheKey = () => foilSource + shineSource
  material.onBeforeCompile = (shader) => {
    shader.uniforms.foilRamp = { value: foil.ramp }
    shader.uniforms.foilTime = foil.time
    shader.uniforms.foilTilt = { value: foil.tilt }
    const declarations = marquees.map(
      ({ map, box, cycle, speed, fade }, index) => {
        const name = `marquee${index}`
        shader.uniforms[name] = { value: map }
        shader.uniforms[`${name}Box`] = {
          value: new THREE.Vector4(box.x, box.y, box.width, box.height),
        }
        shader.uniforms[`${name}Run`] = {
          value: new THREE.Vector3(cycle, speed, fade),
        }
        return `uniform sampler2D ${name};\nuniform vec4 ${name}Box;\nuniform vec3 ${name}Run;`
      }
    )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform sampler2D foilRamp;",
          "uniform float foilTime;",
          "uniform vec2 foilTilt;",
          ...declarations,
        ].join("\n")
      )
      .replace("#include <map_fragment>", foilSource)
      .replace("#include <emissivemap_fragment>", shineSource)
      .replace(
        "#include <opaque_fragment>",
        // Mirror image fades out from the film's bottom edge (v = 0).
        "#include <opaque_fragment>\n#ifdef REFLECTION\ngl_FragColor.a *= 0.3 * pow( 1.0 - smoothstep( 0.0, 0.22, vMapUv.y ), 2.0 );\n#endif"
      )
  }
  return material
}
