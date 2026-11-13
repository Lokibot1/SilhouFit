import { jitterPx } from '../../src/utils/arMeter'
import { LANDMARK_FILTER, PoseFollower, type Landmark, type PoseFrame, type View } from '../../src/utils/arPose'

// A synthetic person for measuring the follower's jitter and lag: truth in stage pixels, Gaussian landmark noise, 30 detections a second.
// Used by tests/utils/arSmooth.test.ts. The person faces the camera (yaw 0); the world landmarks are exact.

export const VIEW: View = { videoW: 640, videoH: 480, width: 640, height: 480 }
export const HZ = 30
export const STEP_MS = 1000 / HZ

export function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}
/** Standard normal from a uniform source (Box-Muller). */
export const gaussian = (rand: () => number) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())

export interface Truth {
  /** Shoulder midpoint in stage px. */
  x: number
  y: number
  /** Half the shoulder joint span in px. */
  half: number
}

/** The landmarks of a person at `truth` (hips 195 px below the shoulders, elbows and wrists out and down, a face above), each moved by `noise()` px on both axes. */
export function personFrame({ x, y, half }: Truth, noise: () => number = () => 0, visibility: Record<number, number> = {}): PoseFrame {
  const image: Landmark[] = []
  const put = (i: number, sx: number, sy: number) => {
    image[i] = { x: 1 - (sx + noise()) / VIEW.width, y: (sy + noise()) / VIEW.height, visibility: visibility[i] ?? 1 }
  }
  // The person's left landmarks (odd indices, and 2, 3, 7, 9 on the face) are on the left of the mirrored screen, as in arFeed.
  put(11, x - half, y)
  put(12, x + half, y)
  put(13, x - half - 20, y + 100)
  put(14, x + half + 20, y + 100)
  put(15, x - half - 20, y + 200)
  put(16, x + half + 20, y + 200)
  put(23, x - half * 0.57, y + 195)
  put(24, x + half * 0.57, y + 195)
  // A face 64 px wide and 96 tall: eyes 48 px above the shoulder line, nose, mouth 24 px below the eyes.
  put(0, x, y - 24)
  put(2, x - 16, y - 48)
  put(5, x + 16, y - 48)
  put(3, x - 26, y - 48)
  put(6, x + 26, y - 48)
  put(7, x - 32, y - 40)
  put(8, x + 32, y - 40)
  put(9, x - 10, y - 24)
  put(10, x + 10, y - 24)
  const world = []
  world[11] = { x: 0.2, y: 0, z: 0 }
  world[12] = { x: -0.2, y: 0, z: 0 }
  return { image, world }
}

export interface Out {
  t: number
  x: number
  y: number
  /** Degrees. */
  roll: number
  pxPerCm: number
  face: { x: number; y: number } | null
  truth: Truth
}

/** Runs a fresh PoseFollower (with `filter` in place of LANDMARK_FILTER while it runs) on `seconds` of the person given by `at(tMs)`. */
export function simulate(at: (tMs: number) => Truth, { seconds = 20, sd = 0, seed = 1, filter = LANDMARK_FILTER }: { seconds?: number; sd?: number; seed?: number; filter?: typeof LANDMARK_FILTER } = {}) {
  const keep = { ...LANDMARK_FILTER }
  Object.assign(LANDMARK_FILTER, filter)
  try {
    const rand = seeded(seed)
    const noise = () => sd * gaussian(rand)
    const follower = new PoseFollower()
    const out: Out[] = []
    for (let t = 0; t <= seconds * 1000; t += STEP_MS) {
      const truth = at(t)
      const { pose } = follower.update(personFrame(truth, noise), t, VIEW, 1)
      out.push({ t, x: pose!.x, y: pose!.y, roll: (pose!.roll * 180) / Math.PI, pxPerCm: pose!.pxPerCm, face: pose!.occluders.face, truth })
    }
    return out
  } finally {
    Object.assign(LANDMARK_FILTER, keep)
  }
}

const sdOf = (values: number[]) => {
  const mean = values.reduce((a, v) => a + v, 0) / values.length
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length)
}
const STILL: Truth = { x: 320, y: 200, half: 70 }
export const still = () => STILL

/** Standard deviation of the shirt anchor (per axis), the roll (degrees) and px/cm (percent of its mean) of a person standing still, after a 2 s warm-up. */
export function stillSd(sd: number, filter = LANDMARK_FILTER) {
  const out = simulate(still, { sd, filter }).filter((o) => o.t >= 2000)
  const anchor = Math.sqrt((sdOf(out.map((o) => o.x)) ** 2 + sdOf(out.map((o) => o.y)) ** 2) / 2)
  const mean = out.reduce((a, o) => a + o.pxPerCm, 0) / out.length
  return { anchor, roll: sdOf(out.map((o) => o.roll)), scalePct: (100 * sdOf(out.map((o) => o.pxPerCm))) / mean }
}

/** The delay in ms of the anchor behind a person walking sideways at `speed` px a second, no noise: the steady-state gap over the speed. */
export function walkLag(speed: number, filter = LANDMARK_FILTER) {
  const out = simulate((t) => ({ ...STILL, x: 100 + (speed * t) / 1000 }), { seconds: 4, filter }).filter((o) => o.t >= 2000)
  return (1000 * out.reduce((a, o) => a + (o.truth.x - o.x), 0)) / out.length / speed
}

/** Jitter (the meter's, trend removed) of a person walking at `speed` with `sd` px of noise. */
export function walkJitter(speed: number, sd: number, filter = LANDMARK_FILTER) {
  const out = simulate((t) => ({ ...STILL, x: 100 + (speed * t) / 1000 }), { seconds: 6, sd, filter }).filter((o) => o.t >= 2000)
  return jitterPx(out)
}

/** Time in ms for the anchor to reach 90% of a step of `px` at t = 1 s, in the direction `axis` (a shrug is `y` -20; a sidestep `x`), no noise. */
export function stepMs(axis: 'x' | 'y', px: number, filter = LANDMARK_FILTER) {
  const out = simulate((t) => ({ ...STILL, [axis]: STILL[axis] + (t >= 1000 ? px : 0) }), { seconds: 3, filter })
  const base = out.filter((o) => o.t < 1000).at(-1)![axis]
  const hit = out.find((o) => o.t >= 1000 && (o[axis] - base) / px >= 0.9)
  return hit ? hit.t - 1000 : Infinity
}

/** Time in ms for px/cm to reach 90% of a +20% step of the shoulder span at t = 1 s. */
export function scaleStepMs(filter = LANDMARK_FILTER) {
  const out = simulate((t) => ({ ...STILL, half: t >= 1000 ? 84 : 70 }), { seconds: 4, filter })
  const [from, to] = [out[0].pxPerCm, out[out.length - 1].pxPerCm]
  const hit = out.find((o) => o.t >= 1000 && (o.pxPerCm - from) / (to - from) >= 0.9)
  return hit ? hit.t - 1000 : Infinity
}
