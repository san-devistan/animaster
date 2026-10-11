import { FOIL, type Stops } from "@workspace/ui/lib/game/theme"

// Pack artwork drawn to a canvas so three.js can wrap it on the film.
// Units are the CSS pack's (232×380), rendered at SCALE for crisp texels.
export const PACK_W = 232
export const PACK_H = 380
export const SEAL = 26
// Where the opening cut runs, from the top edge: just under the top seal.
export const CUT = SEAL + 14
const SCALE = 4

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.addEventListener("load", () => resolve(image))
    image.addEventListener("error", reject)
    image.crossOrigin = "anonymous"
    image.src = src
  })
}

// Foil stops as a 1px strip; the film shader slides along it.
export function drawFoilRamp(stops: Stops = FOIL) {
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 1
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D canvas unavailable")
  const ramp = ctx.createLinearGradient(0, 0, canvas.width, 0)
  for (const [color, at] of stops) ramp.addColorStop(at, color)
  ctx.fillStyle = ramp
  ctx.fillRect(0, 0, canvas.width, 1)
  return canvas
}

function paintCrimp(ctx: CanvasRenderingContext2D, y: number) {
  for (let x = 0; x < PACK_W; x += 3) {
    ctx.fillStyle = "rgb(255 255 255 / 0.28)"
    ctx.fillRect(x, y, 1, SEAL)
    ctx.fillStyle = "rgb(20 12 40 / 0.12)"
    ctx.fillRect(x + 1, y, 2, SEAL)
  }
}

async function paintCovers(
  ctx: CanvasRenderingContext2D,
  covers: ReadonlyArray<string>
) {
  const images = await Promise.all(covers.slice(0, 4).map(loadImage))
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(26, 44, 180, 180, 16)
  ctx.clip()
  images.forEach((image, index) => {
    ctx.drawImage(
      image,
      26 + (index % 2) * 90,
      44 + Math.floor(index / 2) * 90,
      90,
      90
    )
  })
  ctx.restore()
}

function paintTitle(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#121016"
  ctx.textAlign = "center"
  ctx.font = "900 28px 'Unbounded Variable'"
  ctx.fillText("BILLION", PACK_W / 2, 262)
  ctx.fillText("CLUB", PACK_W / 2, 291)
  ctx.font = "700 10px 'Space Mono'"
  ctx.letterSpacing = "0.8px"
  ctx.fillText("5 SONG CARDS · VOL. 1", PACK_W / 2, 318)
}

// Zigzag teeth on the cut seals (12px period, 6px deep, like the CSS mask).
function cutTeeth(ctx: CanvasRenderingContext2D, edge: number, inward: number) {
  ctx.save()
  ctx.globalCompositeOperation = "destination-out"
  ctx.beginPath()
  ctx.moveTo(0, edge)
  for (let x = 0; x <= PACK_W; x += 6) {
    ctx.lineTo(x, x % 12 === 0 ? edge + inward : edge)
  }
  ctx.lineTo(PACK_W, edge)
  ctx.fill()
  ctx.restore()
}

export function blankCanvas(width = PACK_W, height = PACK_H) {
  const canvas = document.createElement("canvas")
  canvas.width = width * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D canvas unavailable")
  ctx.scale(SCALE, SCALE)
  return { canvas, ctx }
}

// Ink printed over the foil; transparent wherever the foil shows through.
function blankFilm() {
  const film = blankCanvas()
  paintCrimp(film.ctx, 0)
  paintCrimp(film.ctx, PACK_H - SEAL)
  return film
}

// Ragged tear along the cut; the body and the strip share it so they mate.
function tearAbove(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.moveTo(-1, -1)
  ctx.lineTo(PACK_W + 1, -1)
  for (let x = PACK_W + 1; x >= -1; x -= 3) {
    ctx.lineTo(x, CUT + 1.6 * Math.sin(x * 0.9) * Math.sin(x * 0.23))
  }
  ctx.closePath()
}

// Film outline for the alpha test: the whole pack minus the cut teeth, or
// one side of the opening cut.
export function packShape(part: "whole" | "body" | "strip" = "whole") {
  const { canvas, ctx } = blankCanvas()
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, PACK_W, PACK_H)
  cutTeeth(ctx, 0, 6)
  cutTeeth(ctx, PACK_H, -6)
  if (part === "whole") return canvas
  ctx.globalCompositeOperation =
    part === "body" ? "destination-out" : "destination-in"
  tearAbove(ctx)
  ctx.fill()
  return canvas
}

export async function drawPackArt(covers: ReadonlyArray<string>) {
  await Promise.all([
    document.fonts.load("900 28px 'Unbounded Variable'"),
    document.fonts.load("700 10px 'Space Mono'"),
  ])
  const front = blankFilm()
  await paintCovers(front.ctx, covers)
  paintTitle(front.ctx)
  const rear = blankFilm()
  rear.ctx.fillStyle = "#121016"
  rear.ctx.textAlign = "center"
  rear.ctx.font = "900 16px 'Unbounded Variable'"
  rear.ctx.fillText("MUSI MASTER", PACK_W / 2, PACK_H / 2)
  return { front: front.canvas, rear: rear.canvas, shape: packShape() }
}
