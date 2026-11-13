import { GARMENT_BASE } from './arGarment'
import type { Point } from './arPose'

// Where each sleeve points, for the AR try-on: the angle of the upper arm (shoulder to elbow) on the canvas. Pure TypeScript with no rendering.
// Angles are in radians from the arm hanging straight down: 0 hanging, 90 degrees straight out to the side, negative across the body. The
// 2D image only is used, so a turned body or an arm reaching towards the camera is read as it looks flat.

const rad = (deg: number) => (deg * Math.PI) / 180

export const SLEEVE_REST = rad(GARMENT_BASE.sleeveRestDeg)
/** Lowest angle: a sleeve hanging straight down would sink into the torso. */
export const SLEEVE_MIN = rad(10)
/** Highest angle: 40 degrees past the model's own A-pose. */
export const SLEEVE_MAX = SLEEVE_REST + rad(40)
/** Where an arm settles when its elbow cannot be seen. */
export const ARMS_DOWN = rad(12)

/** -1 for the sleeve on the left of the screen (the -x bone), 1 for the right. */
export type Side = -1 | 1

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * The upper arm's angle, unclamped (-90 to 270 degrees). `shoulder` and `elbow` are in stage pixels (y down); the vector between them is
 * turned back by the body's `roll` (counter-clockwise positive), so leaning the whole body leaves it unchanged.
 */
export function armAngle(shoulder: Point, elbow: Point, roll: number, side: Side) {
  const dx = elbow.x - shoulder.x
  const dy = shoulder.y - elbow.y
  const x = dx * Math.cos(roll) + dy * Math.sin(roll)
  const y = dy * Math.cos(roll) - dx * Math.sin(roll)
  const theta = Math.atan2(side * x, -y)
  // An arm up and across the head is as raised as it gets; without this it would flip to the lowest angle when it wobbles over the top.
  return theta < -Math.PI / 2 ? theta + 2 * Math.PI : theta
}

/** The arm angle clamped to [SLEEVE_MIN, SLEEVE_MAX]: what the sleeve is drawn at. */
export const sleeveAngle = (shoulder: Point, elbow: Point, roll: number, side: Side) => clamp(armAngle(shoulder, elbow, roll, side), SLEEVE_MIN, SLEEVE_MAX)

/** How far to turn a sleeve bone from the model's A-pose to reach `theta`: counter-clockwise (positive) for the +x sleeve, clockwise for -x. */
export const sleeveRotation = (theta: number, side: Side) => side * (theta - SLEEVE_REST)

/** The arm angles for the -x and +x sleeve bones. Facing away the mesh is turned half way round, so the -x sleeve is on the right of the screen. */
export const sleevesOnBones = (sleeves: [number, number], facingAway: boolean): [number, number] => (facingAway ? [sleeves[1], sleeves[0]] : sleeves)

/** How long (ms, the time constant) an arm takes to ease from what it showed to the measured angle once its elbow is seen again. */
export const EASE_IN_MS = 150

/**
 * One arm's angle over time: the measured one, held for `holdMs` when the elbow goes, then eased to ARMS_DOWN over `fadeMs` (at once if `snap`).
 * When the elbow comes back it eases in from the angle that was showing (not at once, unless `snap`).
 */
export class SleeveTracker {
  private last: { theta: number; t: number } | null = null
  private shown: number | null = null
  private lost = false
  private from: { delta: number; t: number } | null = null
  private readonly holdMs: number
  private readonly fadeMs: number

  constructor(holdMs: number, fadeMs: number) {
    this.holdMs = holdMs
    this.fadeMs = fadeMs
  }

  /** `theta` is the measured angle, or null when the elbow or shoulder is not visible. */
  update(theta: number | null, tMs: number, snap = false) {
    if (theta === null) {
      this.lost = true
      return (this.shown = this.unseen(tMs, snap))
    }
    if (this.lost && !snap && this.shown !== null) this.from = { delta: this.shown - theta, t: tMs }
    this.lost = false
    this.last = { theta, t: tMs }
    return (this.shown = theta + (this.from ? this.from.delta * Math.exp(-(tMs - this.from.t) / EASE_IN_MS) : 0))
  }

  private unseen(tMs: number, snap: boolean) {
    if (!this.last) return ARMS_DOWN
    const gone = tMs - this.last.t
    if (gone <= this.holdMs) return this.last.theta
    if (snap || gone >= this.holdMs + this.fadeMs) return ARMS_DOWN
    return this.last.theta + (ARMS_DOWN - this.last.theta) * ((gone - this.holdMs) / this.fadeMs)
  }

  reset() {
    this.last = null
    this.shown = null
    this.lost = false
    this.from = null
  }
}
