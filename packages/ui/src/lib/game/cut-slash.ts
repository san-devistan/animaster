// The katana slash drawn once a pack is cut through, along the finger's own
// stroke rather than a fixed line.

export type StrokePoint = readonly [x: number, y: number]

export type Slash = {
  // SVG path, in stage px: the stroke smoothed and carried past both edges.
  d: string
  start: StrokePoint
  end: StrokePoint
  // Where the finger was when the cut went through.
  release: StrokePoint
  // Which way the slash leaves there, in degrees clockwise from the right.
  angle: number
}

// How far past the stage's edges the slash runs, so its blade enters and
// leaves off screen.
const MARGIN = 48
// Points closer than this to the last one kept are dropped.
const STEP = 4
// The ends' headings are read this far into the stroke, so a twitch of the
// finger right at an end doesn't swing the blade.
const REACH = 24

const distance = (from: StrokePoint, to: StrokePoint) =>
  Math.hypot(to[0] - from[0], to[1] - from[1])

function heading(from: StrokePoint, to: StrokePoint): StrokePoint {
  const length = distance(from, to)
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
}

// How far along `by` from `at` until just past either edge of `size`.
function untilEdge(at: number, by: number, size: number) {
  if (by > 0) return (size + MARGIN - at) / by
  if (by < 0) return (-MARGIN - at) / by
  return Infinity
}

// From `from` along the unit `step` to just past the stage's edge.
function pastEdge(
  from: StrokePoint,
  step: StrokePoint,
  width: number,
  height: number
): StrokePoint {
  const length = Math.max(
    0,
    Math.min(
      untilEdge(from[0], step[0], width),
      untilEdge(from[1], step[1], height)
    )
  )
  return [from[0] + step[0] * length, from[1] + step[1] * length]
}

const format = ([x, y]: StrokePoint) => `${x.toFixed(1)},${y.toFixed(1)}`

// The first point at least REACH from points[from], walking `by` (±1), or the
// far end of the stroke when none is.
function reach(points: ReadonlyArray<StrokePoint>, from: number, by: number) {
  const origin = points[from]
  let index = from + by
  while (index > 0 && index < points.length - 1) {
    if (distance(origin, points[index]) >= REACH) break
    index += by
  }
  return points[index]
}

// The slash along `stroke` (stage px, in drawing order) on a `width` x
// `height` stage; null when the stroke is too short to have a direction.
export function slashPath(
  stroke: ReadonlyArray<StrokePoint>,
  width: number,
  height: number
): Slash | null {
  const points: Array<StrokePoint> = []
  for (const point of stroke) {
    const last = points.at(-1)
    if (!last || distance(last, point) >= STEP) points.push(point)
  }
  const first = points[0]
  const release = points.at(-1)
  if (!first || !release || points.length < 2) return null
  // Carried on the way the stroke started and the way it ended.
  const start = pastEdge(
    first,
    heading(reach(points, 0, 1), first),
    width,
    height
  )
  const leaving = heading(reach(points, points.length - 1, -1), release)
  const end = pastEdge(release, leaving, width, height)
  // Smoothed through the midpoints, each point bending the curve.
  const path = [start, ...points, end]
  let d = `M${format(start)}`
  for (let index = 1; index < path.length - 1; index += 1) {
    const point = path[index]
    const next = path[index + 1]
    d += ` Q${format(point)} ${format([(point[0] + next[0]) / 2, (point[1] + next[1]) / 2])}`
  }
  d += ` L${format(end)}`
  const angle = (Math.atan2(leaving[1], leaving[0]) * 180) / Math.PI
  return { d, start, end, release, angle }
}
