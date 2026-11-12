import { garmentScale, GARMENT_BASE, SEAM_HEIGHT } from './arGarment'
import { OneEuro, OneEuroPoint } from './oneEuro'

// From pose landmarks to where the shirt goes on the stage, for the AR try-on. Pure TypeScript with no rendering. The camera feed is shown
// mirrored (a selfie) but the canvas is not, so landmarks are mirrored into canvas pixels here (x' = 1 - x). Angles are for the canvas, in
// radians, counter-clockwise positive with y up (the way three.js rotates), so a shoulder that drops on the left of the screen gives a
// positive roll. The raw world-landmark yaw formula already comes out in that canvas convention, so mirroring does not flip it a second
// time (checked in the tests).

export const LEFT_SHOULDER = 11
export const RIGHT_SHOULDER = 12
export const LEFT_HIP = 23
export const RIGHT_HIP = 24

export const MIN_VISIBILITY = 0.5
/** The shoulder landmarks sit on the joints, a bit inside the width a person reports (seam to seam): joint distance is about this share of it. */
export const SHOULDER_JOINT_K = 0.8
/** Shoulder width (cm) assumed when the customer has no saved measurements. */
export const DEFAULT_SHOULDER_CM = 42
/** The seam sits about this far above the shoulder-joint landmarks (cm). */
export const LANDMARK_TO_SEAM_CM = 4
export const MAX_YAW = (45 * Math.PI) / 180

export const HOLD_MS = 300
export const FADE_MS = 300
/** Shoulder span as a share of the stage width, below which the customer is too far. */
export const TOO_FAR_SPAN = 0.18
/** Too close is when the drawn shirt (sleeves included) would be wider than the stage: the drawn width is this many times the shoulder span (about 1.93). */
const DRAWN_PER_SPAN = GARMENT_BASE.drawnWidth / (SHOULDER_JOINT_K * DEFAULT_SHOULDER_CM)
export const TOO_CLOSE_SPAN = 1 / DRAWN_PER_SPAN

export interface Landmark {
  x: number
  y: number
  visibility?: number
}
export interface WorldLandmark {
  x: number
  y: number
  z: number
}
/** One detection: the 33 image landmarks (0..1 over the video frame) and the 33 world landmarks (metres, hip-centred); only some are read. */
export interface PoseFrame {
  image: Landmark[]
  world: WorldLandmark[]
}
/** The video's own size, and the box it is shown in with object-fit: cover. */
export interface View {
  videoW: number
  videoH: number
  width: number
  height: number
}
export interface Point {
  x: number
  y: number
}

/** Where object-cover puts the video inside the box: one scale and the offsets of the cropped overflow. */
export function coverMap({ videoW, videoH, width, height }: View) {
  const scale = Math.max(width / videoW, height / videoH)
  return { scale, offsetX: (width - videoW * scale) / 2, offsetY: (height - videoH * scale) / 2 }
}

/** A landmark in canvas pixels (y down), mirrored to match the selfie video. */
export function toStage(p: Point, view: View): Point {
  const { scale, offsetX, offsetY } = coverMap(view)
  return { x: (1 - p.x) * view.videoW * scale + offsetX, y: p.y * view.videoH * scale + offsetY }
}

const seen = (p: Landmark | undefined): p is Landmark => !!p && (p.visibility ?? 1) >= MIN_VISIBILITY
export const shouldersTracked = (frame: PoseFrame) => seen(frame.image[LEFT_SHOULDER]) && seen(frame.image[RIGHT_SHOULDER])
const hipsTracked = (frame: PoseFrame) => seen(frame.image[LEFT_HIP]) && seen(frame.image[RIGHT_HIP])

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const clampYaw = (yaw: number) => clamp(yaw, -MAX_YAW, MAX_YAW)

/** Body yaw from the world shoulders, clamped to +-45 degrees. Zero when the world landmarks are missing. */
export function yawOf(frame: PoseFrame) {
  const l = frame.world[LEFT_SHOULDER]
  const r = frame.world[RIGHT_SHOULDER]
  return l && r ? clampYaw(Math.atan2(r.z - l.z, l.x - r.x)) : 0
}

/** Roll of the shoulder line on the canvas, counter-clockwise positive (a shoulder dropping on the left of the screen is positive). */
export const shoulderRoll = (screenLeft: Point, screenRight: Point) => Math.atan2(screenLeft.y - screenRight.y, screenRight.x - screenLeft.x)
/** Tilt of the torso axis (hip midpoint to shoulder midpoint) from vertical, counter-clockwise positive. */
export const torsoRoll = (shoulderMid: Point, hipMid: Point) => Math.atan2(hipMid.x - shoulderMid.x, hipMid.y - shoulderMid.y)

/** Pixels per cm on the body's plane: the shoulder span, corrected for a turned body, over the joint-to-joint share of the shoulder width. */
export const pxPerCmOf = (spanPx: number, yaw: number, shoulderCm: number) => spanPx / Math.cos(clampYaw(yaw)) / (SHOULDER_JOINT_K * shoulderCm)

export type FollowState = 'tracking' | 'lost' | 'too-close' | 'too-far'
/** What the stage tells the page: off (camera off), loading the model, following the body, or why it is not ('slow' device, 'failed' to load). */
export type TrackStatus = FollowState | 'off' | 'loading' | 'slow' | 'failed'
/** Where the shoulder seam point is on the canvas (px, y down) and how the garment is turned and sized there. */
export interface Pose {
  x: number
  y: number
  roll: number
  yaw: number
  pxPerCm: number
}
export interface Follow {
  state: FollowState
  /** 1 while tracked and for 300 ms after, then fades to 0 over 300 ms. */
  opacity: number
  /** Null once the body has been lost for good. */
  pose: Pose | null
  /** True when there were no measurements to size from, so an average shoulder width was used. */
  averageBuild: boolean
}

const LANDMARK_FILTER = { minCutoff: 1, beta: 0.007, dCutoff: 1 }

/** Smooths landmarks into a pose frame by frame, and decides what to show when the body is lost, too close or too far. */
export class PoseFollower {
  private readonly left = new OneEuroPoint(LANDMARK_FILTER)
  private readonly right = new OneEuroPoint(LANDMARK_FILTER)
  private readonly hipLeft = new OneEuroPoint(LANDMARK_FILTER)
  private readonly hipRight = new OneEuroPoint(LANDMARK_FILTER)
  private readonly scale = new OneEuro({ minCutoff: 0.4, beta: 0 })
  private readonly turn = new OneEuro({ minCutoff: 0.5, beta: 0.3 })
  private last: { follow: Follow; t: number } | null = null

  private reset() {
    for (const f of [this.left, this.right, this.hipLeft, this.hipRight, this.scale, this.turn]) f.reset()
    this.last = null
  }

  /** `tMs` is the video frame's time. A null frame is a frame with no body in it. */
  update(frame: PoseFrame | null, tMs: number, view: View, shoulderCm?: number): Follow {
    if (!frame || !shouldersTracked(frame)) return this.missing(tMs)
    if (this.last && tMs - this.last.t > HOLD_MS + FADE_MS) this.reset()

    const l = this.left.filter(toStage(frame.image[LEFT_SHOULDER], view), tMs)
    const r = this.right.filter(toStage(frame.image[RIGHT_SHOULDER], view), tMs)
    const yaw = this.turn.filter(yawOf(frame), tMs)
    const mid = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 }
    let roll = shoulderRoll(l, r)
    if (hipsTracked(frame)) {
      const hl = this.hipLeft.filter(toStage(frame.image[LEFT_HIP], view), tMs)
      const hr = this.hipRight.filter(toStage(frame.image[RIGHT_HIP], view), tMs)
      roll = (roll + torsoRoll(mid, { x: (hl.x + hr.x) / 2, y: (hl.y + hr.y) / 2 })) / 2
    }
    const span = Math.hypot(l.x - r.x, l.y - r.y)
    const averageBuild = !shoulderCm
    const pxPerCm = this.scale.filter(pxPerCmOf(span, yaw, shoulderCm || DEFAULT_SHOULDER_CM), tMs)
    // The seam is above the landmarks, along the (rolled) up direction of the body.
    const lift = LANDMARK_TO_SEAM_CM * pxPerCm
    const pose: Pose = { x: mid.x - lift * Math.sin(roll), y: mid.y - lift * Math.cos(roll), roll, yaw, pxPerCm }

    const tooClose = span > TOO_CLOSE_SPAN * view.width || Math.min(l.y, r.y) < 0
    const state: FollowState = tooClose ? 'too-close' : span < TOO_FAR_SPAN * view.width ? 'too-far' : 'tracking'
    const follow: Follow = { state, opacity: 1, pose, averageBuild }
    this.last = { follow, t: tMs }
    return follow
  }

  /** No body this frame: hold the last pose for 300 ms, fade it out over 300 ms more, then it is lost and the filters start afresh. */
  private missing(tMs: number): Follow {
    const last = this.last
    if (!last) return { state: 'lost', opacity: 0, pose: null, averageBuild: false }
    const gone = tMs - last.t
    if (gone <= HOLD_MS) return last.follow
    if (gone >= HOLD_MS + FADE_MS) {
      const { averageBuild } = last.follow
      this.reset()
      return { state: 'lost', opacity: 0, pose: null, averageBuild }
    }
    return { ...last.follow, state: 'lost', opacity: 1 - (gone - HOLD_MS) / FADE_MS }
  }
}

/** The shirt mesh's placement on the canvas (three.js units are pixels, y up, origin at the top-left corner of the stage). */
export function garmentTransform(pose: Pose, size: ReturnType<typeof garmentScale>) {
  const scale = { x: size.x * pose.pxPerCm, y: size.y * pose.pxPerCm, z: size.z * pose.pxPerCm }
  // The mesh origin is at the hem and the shoulder point is SEAM_HEIGHT above it, so the origin is that far down the rolled axis from the seam.
  const drop = SEAM_HEIGHT * scale.y
  return {
    x: pose.x + drop * Math.sin(pose.roll),
    y: -pose.y - drop * Math.cos(pose.roll),
    rotationY: pose.yaw,
    rotationZ: pose.roll,
    scale,
    /** The drawn width in px, sleeves included. */
    widthPx: GARMENT_BASE.drawnWidth * scale.x,
  }
}

export const MAX_RATE = 30
export const MAX_RATE_COARSE = 20
export const DEGRADED_RATE = 15
export const SLOW_BELOW = 10
const BUSY_SHARE = 0.6
const BUSY_MS = 2000
const SLOW_MS = 3000

/**
 * How often to detect. Starts at 30 a second (20 on a coarse pointer); if detecting itself takes over 60% of that frame budget for 2 s it
 * drops to 15; if fewer than 10 detections a second keep up for 3 s the device is too slow for tracking.
 */
export class RateHealth {
  rate: number
  slow = false
  private readonly budgetMs: number
  private readonly times: number[] = []
  private readonly durations: number[] = []
  private firstT: number | null = null
  private busySince: number | null = null
  private slowSince: number | null = null

  constructor(coarse: boolean) {
    this.rate = coarse ? MAX_RATE_COARSE : MAX_RATE
    this.budgetMs = 1000 / this.rate
  }

  get intervalMs() {
    return 1000 / this.rate
  }

  /** Call after each detection with the time it finished and how long it took. */
  record(tMs: number, detectMs: number) {
    this.firstT ??= tMs
    this.times.push(tMs)
    this.durations.push(detectMs)
    if (this.durations.length > 15) this.durations.shift()
    while (this.times[0] < tMs - 1000) this.times.shift()

    const sorted = [...this.durations].sort((a, b) => a - b)
    if (sorted[Math.floor(sorted.length / 2)] > BUSY_SHARE * this.budgetMs) this.busySince ??= tMs
    else this.busySince = null
    if (this.busySince !== null && tMs - this.busySince >= BUSY_MS) this.rate = Math.min(this.rate, DEGRADED_RATE)

    // The first second is a warm-up: the window is not full yet.
    if (tMs - this.firstT < 1000) return
    if (this.times.length < SLOW_BELOW) this.slowSince ??= tMs
    else this.slowSince = null
    if (this.slowSince !== null && tMs - this.slowSince >= SLOW_MS) this.slow = true
  }
}
