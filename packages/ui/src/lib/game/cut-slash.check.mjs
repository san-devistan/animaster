// Run: node packages/ui/src/lib/game/cut-slash.check.mjs
import { slashPath } from "./cut-slash.ts"

/** @type {(ok: unknown, what: string) => void} */
function check(ok, what) {
  if (!ok) throw new Error(`cut-slash: ${what}`)
}
/** @type {(value: number | undefined, want: number) => boolean} */
const near = (value, want) =>
  value !== undefined && Math.abs(value - want) < 1e-3

check(slashPath([], 400, 800) === null, "no stroke, no slash")
check(
  slashPath(
    [
      [100, 100],
      [101, 101],
    ],
    400,
    800
  ) === null,
  "a stroke too short to have a direction"
)

// A level stroke runs level past both edges.
const level = slashPath(
  [
    [100, 300],
    [200, 300],
    [300, 300],
  ],
  400,
  800
)
check(near(level?.start[0], -48) && near(level?.start[1], 300), "level start")
check(near(level?.end[0], 448) && near(level?.end[1], 300), "level end")
check(near(level?.release[0], 300), "level release")
check(near(level?.angle, 0), "level angle")

// A slanted stroke keeps its slant out to the edges.
const slanted = slashPath(
  [
    [100, 300],
    [200, 350],
    [300, 400],
  ],
  400,
  800
)
check(near(slanted?.start[0], -48), "slanted start x")
check(near(slanted?.start[1], 300 - 148 / 2), "slanted start y")
check(near(slanted?.end[0], 448), "slanted end x")
check(near(slanted?.end[1], 400 + 148 / 2), "slanted end y")
check(near(slanted?.angle, 26.565), "slanted angle")

// A stroke that bends keeps its bend: it leaves the way it ended.
const bent = slashPath(
  [
    [100, 300],
    [200, 300],
    [250, 250],
    [300, 200],
  ],
  400,
  800
)
check(near(bent?.start[1], 300), "bent start keeps its heading")
check(near(bent?.end[0], 448) && near(bent?.end[1], 52), "bent end")
check(near(bent?.angle, -45), "bent angle")
