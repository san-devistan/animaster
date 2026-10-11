import type { Marquee } from "@workspace/ui/lib/game/film-material"
import { blankCanvas, loadImage } from "@workspace/ui/lib/game/pack-art"
import { BRAND, type GameCardData } from "@workspace/ui/lib/game/theme"

// Card artwork drawn to a canvas, in the game card layout
// (240×336, 3px ink border, 24px radius). Rarity foil shows where it's clear.
// Front only: the card never turns far enough to show its back.
export const CARD_W = 240
export const CARD_H = 336
export const CARD_RADIUS = 24
const INK = "#121016"
// The image sits on an ink frame that shows as a thin ring around the art.
const FRAME = { at: 12.75, size: 214.5, radius: 14 }
const ART = { at: 15.5, size: 209, radius: 11 }

const DISPLAY = "800 18px 'Unbounded Variable'"
const UI = "500 14px 'Space Grotesk Variable'"
const STAT = "700 12px 'Space Grotesk Variable'"
const NEW = "900 12px 'Unbounded Variable'"

function border(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(1.5, 1.5, CARD_W - 3, CARD_H - 3, CARD_RADIUS - 1.5)
  ctx.stroke()
}

async function picture(ctx: CanvasRenderingContext2D, card: GameCardData) {
  const image = await loadImage(card.imageUrl)
  ctx.save()
  ctx.shadowColor = "rgb(18 16 22 / 0.35)"
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 8
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.roundRect(FRAME.at, FRAME.at, FRAME.size, FRAME.size, FRAME.radius)
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(ART.at, ART.at, ART.size, ART.size, ART.radius)
  ctx.clip()
  const side = Math.min(image.naturalWidth, image.naturalHeight)
  ctx.drawImage(
    image,
    (image.naturalWidth - side) / 2,
    (image.naturalHeight - side) / 2,
    side,
    side,
    ART.at,
    ART.at,
    ART.size,
    ART.size
  )
  ctx.restore()
}

function stat(ctx: CanvasRenderingContext2D, card: GameCardData) {
  ctx.fillStyle = INK
  ctx.font = STAT
  ctx.fillText(card.stat, 18.75, 309.5)
}

// Name and subtitle sit on their own marquee strips so long ones can scroll;
// `pad` keeps text at the 18.7px margin and is where a scrolling line fades.
const CAPTION_BOX = { x: 10.7, width: 218.5, pad: 8 }
const CAPTIONS = {
  name: {
    font: DISPLAY,
    spacing: "-0.72px",
    color: INK,
    baseline: 256,
    top: 236,
    height: 28,
  },
  subtitle: {
    font: UI,
    spacing: "0px",
    color: "rgb(18 16 22 / 0.8)",
    baseline: 276,
    top: 262,
    height: 20,
  },
} as const

const CAPTION_GAP = 48
// Card px per second.
const CAPTION_SPEED = 30
// Long lines get a lower scale so the canvas stays a safe texture size.
const MAX_CAPTION_PX = 4096

// One caption line from `pad`; a line too long for the box is followed by a
// gap so the canvas tiles into a seamless loop.
function caption(text: string, line: keyof typeof CAPTIONS): Marquee {
  const { font, spacing, color, baseline, top, height } = CAPTIONS[line]
  const { ctx: measure } = blankCanvas(1, 1)
  measure.font = font
  measure.letterSpacing = spacing
  const width = measure.measureText(text).width
  const scrolls = width > CAPTION_BOX.width - 2 * CAPTION_BOX.pad
  const length = scrolls
    ? CAPTION_BOX.pad + width + CAPTION_GAP
    : CAPTION_BOX.width
  const scale = Math.min(4, MAX_CAPTION_PX / length)
  const canvas = document.createElement("canvas")
  canvas.width = Math.ceil(length * scale)
  canvas.height = Math.ceil(height * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D canvas unavailable")
  ctx.scale(scale, scale)
  ctx.font = font
  ctx.letterSpacing = spacing
  ctx.fillStyle = color
  ctx.fillText(text, CAPTION_BOX.pad, baseline - top)
  return {
    art: canvas,
    box: { x: CAPTION_BOX.x, y: top, width: CAPTION_BOX.width, height },
    cycle: canvas.width / scale,
    speed: scrolls ? CAPTION_SPEED : 0,
    fade: scrolls ? CAPTION_BOX.pad : 0,
  }
}

// NEW sticker, drawn on its own canvas so it can sit on top of the card's
// foil border. STICKER is its size and where its middle sits on the card.
export const STICKER = { w: 76, h: 40, x: CARD_W - 30, y: 20, tilt: 0.14 }

// `text` defaults to white; pass ink for a light pill.
export async function drawSticker(
  label = "NEW",
  color = "#ff3d7f",
  text = "#ffffff"
) {
  await document.fonts.load(NEW)
  const { canvas, ctx } = blankCanvas(STICKER.w, STICKER.h)
  ctx.translate(STICKER.w / 2, STICKER.h / 2)
  ctx.shadowColor = "rgb(18 16 22 / 0.35)"
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 3
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(-30, -13, 60, 26, 13)
  ctx.fill()
  ctx.shadowColor = "transparent"
  ctx.strokeStyle = INK
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.fillStyle = text
  ctx.font = NEW
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(label, 0, 1)
  return canvas
}

// The card's back, as on the 2D card back: violet mesh and wordmark.
export async function drawCardBack() {
  await Promise.all(
    ["900 28px 'Unbounded Variable'", "600 12px 'Space Grotesk Variable'"].map(
      (font) => document.fonts.load(font)
    )
  )
  const { canvas, ctx } = blankCanvas(CARD_W, CARD_H)
  ctx.beginPath()
  ctx.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS)
  ctx.clip()
  const mesh = ctx.createLinearGradient(0, 0, CARD_W, CARD_H)
  BRAND.mesh.forEach((color, index) =>
    mesh.addColorStop(index / (BRAND.mesh.length - 1), color)
  )
  ctx.fillStyle = mesh
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = BRAND.on
  ctx.textAlign = "center"
  ctx.font = "900 28px 'Unbounded Variable'"
  ctx.fillText("ANI", CARD_W / 2, 164)
  ctx.font = "600 12px 'Space Grotesk Variable'"
  ctx.letterSpacing = "3.6px"
  ctx.globalAlpha = 0.7
  ctx.fillText("MASTER", CARD_W / 2 + 1.8, 190)
  ctx.globalAlpha = 1
  border(ctx)
  return canvas
}

// Rounded card outline for the alpha test (green), with the card border and
// the image ring marked in red so rarer cards can foil them alike.
function cardShape() {
  const { canvas, ctx } = blankCanvas(CARD_W, CARD_H)
  ctx.fillStyle = "#00ff00"
  ctx.beginPath()
  ctx.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS)
  ctx.fill()
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS)
  ctx.roundRect(3, 3, CARD_W - 6, CARD_H - 6, CARD_RADIUS - 3)
  ctx.roundRect(FRAME.at, FRAME.at, FRAME.size, FRAME.size, FRAME.radius)
  ctx.roundRect(ART.at, ART.at, ART.size, ART.size, ART.radius)
  ctx.fill("evenodd")
  return canvas
}

export async function drawCardArt(card: GameCardData) {
  await Promise.all(
    [DISPLAY, UI, STAT].map((font) => document.fonts.load(font))
  )
  const front = blankCanvas(CARD_W, CARD_H)
  await picture(front.ctx, card)
  stat(front.ctx, card)
  border(front.ctx)
  return {
    front: front.canvas,
    shape: cardShape(),
    marquees: [caption(card.name, "name"), caption(card.subtitle, "subtitle")],
  }
}
