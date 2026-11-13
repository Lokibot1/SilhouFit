import { sleeveAngle, SleeveTracker, type Side } from './arArms'
import { BodyFitter, FRONT_ON_ENTER, FRONT_ON_LEAVE, hipFactor, leanOf, torsoFactor, type BodyFit, type BodyMeasure } from './arFitBody'
import { garmentScale, GARMENT_BASE, SEAM_HEIGHT } from './arGarment'
import { OneEuro, OneEuroPoint } from './oneEuro'
import { faceEllipse, forearmCapsule, forearmInFront, FRAME_MARGIN, WRIST_SEEN, wristTrusted, type Ellipse, type ForearmCall } from './arOcclude'
import { TurnDetector, type FlipReason } from './arTurn'

// From pose landmarks to where the shirt goes on the stage, for the AR try-on. Pure TypeScript with no rendering. The camera feed is shown
// mirrored (a selfie) but the canvas is not, so landmarks are mirrored into canvas pixels here (x' = 1 - x). Angles are for the canvas, in
// radians, counter-clockwise positive with y up (the way three.js rotates), so a shoulder that drops on the left of the screen gives a
// positive roll. The raw world-landmark yaw formula already comes out in that canvas convention, so mirroring does not flip it a second
// time (checked in the tests).

export const NOSE = 0
export const LEFT_EYE = 2
export const RIGHT_EYE = 5
export const LEFT_SHOULDER = 11
export const RIGHT_SHOULDER = 12
export const LEFT_ELBOW = 13
export const RIGHT_ELBOW = 14
export const LEFT_WRIST = 15
export const RIGHT_WRIST = 16
export const LEFT_HIP = 23
export const RIGHT_HIP = 24

export const MIN_VISIBILITY = 0.5
/**
 * A landmark comes on at MIN_VISIBILITY + this and goes off below MIN_VISIBILITY - this (0.55 and 0.45), so a visibility hovering around 0.5
 * cannot toggle a capsule, a sleeve, the chin or the hip fit on and off from frame to frame. While it is off its filter is held, not fed.
 */
export const HYSTERESIS = 0.05
/** The face landmarks that must be seen for the chin ellipse (nose, ears, mouth corners); the eyes are used as they come, as before. */
const FACE_GATED = [NOSE, 7, 8, 9, 10]
/** The landmarks the follower gates, for the "held" count of the ?debug=ar overlay: those of the face, shoulders, elbows, wrists, hips. */
const TRACKED = [...FACE_GATED, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP]
/**
 * How much wider than the tracked shoulder-joint span the reference size's shoulder seams are drawn. The landmarks sit on the joints, a bit
 * inside the seams, so a little over 1 puts the seams just outside the joints. Tunable: raise it if the shirt still looks too narrow, lower it if too wide.
 */
export const FIT_EASE = 1.05
/** The seam sits about this far above the shoulder-joint landmarks (cm). */
export const LANDMARK_TO_SEAM_CM = 4
/**
 * The shoulder span only tells the scale while the body is turned less than about 60 degrees (cos above 0.5): past that it collapses, noise
 * dominates and dividing by cos would blow the shirt up. Beyond it the follower holds its last good placement and size.
 */
export const RELIABLE_COS = 0.5
/**
 * Nose and both eyes at least this visible: the person faces the camera. A secondary cue only: MediaPipe still reports them visible from behind
 * (see arTurn.ts), so it can say "away" when a head is turned away but never proves "front" on its own after the turn detector said back.
 */
export const FACE_SEEN = 0.5
/** Nose and both eyes all below this while the shoulders are visible: the person faces away. In between, the facing is left as it was. */
export const FACE_GONE = 0.3
/** Consecutive frames that must agree before the face cue changes its mind (about 200 ms at 30 detections a second), so noise cannot flicker it. */
export const FACING_FRAMES = 6
/** How fast the shirt turns to the other side after a flip that has no turn behind it (radians a second: a half turn in half a second). */
export const SPIN_RATE = 2 * Math.PI

export const HOLD_MS = 300
export const FADE_MS = 300
/** Shoulder span as a share of the stage width, below which the customer is too far. */
export const TOO_FAR_SPAN = 0.18
/** Too close is when the drawn shirt (sleeves included) would be wider than the stage: the reference size's drawn width is this many times the shoulder span (about 1.65). */
const DRAWN_PER_SPAN = (GARMENT_BASE.drawnWidth / GARMENT_BASE.shoulder) * FIT_EASE
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
  /** The person silhouette of this detection, if asked for: 0..255 per pixel, row 0 on top, not mirrored. The buffer is reused by the next detection. */
  mask?: MaskFrame
}
export interface MaskFrame {
  data: Uint8Array
  width: number
  height: number
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

/**
 * Turns a fragment position of the drawing buffer (gl_FragCoord, pixels, y up) into a coordinate of the person mask (0..1, row 0 on top, the
 * raw unmirrored video frame): u = x * fragX + z, v = y * fragY + w. The inverse of toStage, so the mask lines up with the video as shown.
 * `drawW` and `drawH` are the drawing buffer's size, which is the stage size times the pixel ratio.
 */
export function maskTransform(view: View, drawW: number, drawH: number): [number, number, number, number] {
  const { scale, offsetX, offsetY } = coverMap(view)
  const [w, h] = [view.videoW * scale, view.videoH * scale]
  return [-view.width / drawW / w, -view.height / drawH / h, 1 + offsetX / w, (view.height - offsetY) / h]
}

const seen = (p: Landmark | null | undefined): p is Landmark => !!p && (p.visibility ?? 1) >= MIN_VISIBILITY
export const shouldersTracked = (frame: PoseFrame) => seen(frame.image[LEFT_SHOULDER]) && seen(frame.image[RIGHT_SHOULDER])
/** A hip to fit the shirt by: inside the video frame by FRAME_MARGIN (an out-of-frame hip comes back at the edge with a visibility that still passes). Seen is the follower's gate. */
const hipTrusted = (p: Landmark | undefined) => !!p && p.x >= FRAME_MARGIN && p.x <= 1 - FRAME_MARGIN && p.y >= FRAME_MARGIN && p.y <= 1 - FRAME_MARGIN

export type Facing = 'front' | 'back'

/**
 * Body yaw from the world shoulders on the left and right of the screen, in (-180, 180] degrees. MediaPipe labels the shoulders by image side
 * (checked on a real back view), so for a body past side-on this is the mirrored yaw of a front view: add a half turn when facing away.
 * Zero when the world landmarks are missing.
 */
export function yawOf(l: WorldLandmark | undefined, r: WorldLandmark | undefined) {
  return l && r ? Math.atan2(r.z - l.z, l.x - r.x) : 0
}

/** `angle` plus whole turns so it lies within half a turn of `near`: the yaw stays continuous through a full turn. */
const unwrap = (angle: number, near: number) => angle + 2 * Math.PI * Math.round((near - angle) / (2 * Math.PI))

/** Which way the person faces by the face landmarks, or null when they do not say (missing, or visibility in between). */
export function facingVote(frame: PoseFrame): Facing | null {
  const face = [NOSE, LEFT_EYE, RIGHT_EYE].map((i) => frame.image[i]?.visibility)
  if (face.some((v) => v === undefined)) return null
  if (face.every((v) => v! >= FACE_SEEN)) return 'front'
  return face.every((v) => v! < FACE_GONE) ? 'back' : null
}

/** The least visible of nose and both eyes, or null without them: what the face cue reads. */
export const faceVisibility = (frame: PoseFrame) => {
  const face = [NOSE, LEFT_EYE, RIGHT_EYE].map((i) => frame.image[i]?.visibility)
  return face.some((v) => v === undefined) ? null : Math.min(...(face as number[]))
}

/** Roll of the shoulder line on the canvas, counter-clockwise positive (a shoulder dropping on the left of the screen is positive). */
export const shoulderRoll = (screenLeft: Point, screenRight: Point) => Math.atan2(screenLeft.y - screenRight.y, screenRight.x - screenLeft.x)
/** Tilt of the torso axis (hip midpoint to shoulder midpoint) from vertical, counter-clockwise positive. */
export const torsoRoll = (shoulderMid: Point, hipMid: Point) => Math.atan2(hipMid.x - shoulderMid.x, hipMid.y - shoulderMid.y)

/**
 * Pixels per cm of the drawing, not of the body: chosen so the reference size (its scale x, see garmentScale) draws its shoulder seams
 * FIT_EASE times the shoulder span, corrected for a turned body. Other sizes are then drawn at their own cm, so they differ from the
 * reference by the size chart's ratios however accurately the customer measured their shoulders.
 */
export const pxPerCmOf = (spanPx: number, yaw: number, refScaleX: number) =>
  (spanPx / Math.max(Math.cos(yaw), RELIABLE_COS)) * FIT_EASE / (GARMENT_BASE.shoulder * refScaleX)

/**
 * Each visible elbow goes with the nearer shoulder on the screen (stage pixels), not by its label: [left of the screen, right of the screen].
 * If both elbows are nearest the same shoulder, the closer one keeps it and the other is dropped.
 */
export function pairElbows(elbows: (Landmark | undefined)[], left: Point, right: Point, view: View): [Landmark | null, Landmark | null] {
  const picked: [Landmark | null, Landmark | null] = [null, null]
  const gap: [number, number] = [Infinity, Infinity]
  for (const e of elbows) {
    if (!seen(e)) continue
    const p = toStage(e, view)
    const dl = Math.hypot(p.x - left.x, p.y - left.y)
    const dr = Math.hypot(p.x - right.x, p.y - right.y)
    const side = dl <= dr ? 0 : 1
    if (Math.min(dl, dr) < gap[side]) {
      picked[side] = e
      gap[side] = Math.min(dl, dr)
    }
  }
  return picked
}

export type FollowState = 'tracking' | 'lost' | 'too-close' | 'too-far'
/** What the stage tells the page: off (camera off), loading the model, following the body, or why it is not ('slow' device, 'failed' to load). */
export type TrackStatus = FollowState | 'off' | 'loading' | 'slow' | 'failed'
/** What the facing is decided from, for the ?debug=ar overlay: the observed yaw, the span over the front-facing one, the face visibility, and the last flip. */
export interface Cues {
  /** The shoulder-joint span in stage px, corrected for the turn (the held one while side-on): what the scale comes from. */
  spanPx: number
  yaw: number
  ratio: number
  face: number | null
  /** How many of the tracked landmarks (face, shoulders, arms, hips) were below the visibility threshold in this frame. */
  held: number
  source: 'auto' | 'manual'
  reason: FlipReason | 'face' | 'manual' | null
}
/** Where the shoulder seam point is on the canvas (px, y down) and how the garment is turned and sized there. */
export interface Pose {
  x: number
  y: number
  roll: number
  /** Unwrapped, so it can pass 180 degrees through a full turn; a half turn more than the shoulders say for each flip of the facing. */
  yaw: number
  facing: Facing
  pxPerCm: number
  /** Each arm's angle from hanging straight down (radians, clamped), the left of the screen first: see sleeveAngle. */
  sleeves: [number, number]
  /** What hides the shirt where a forearm or the chin is in front of it, in stage pixels (y down); see arOcclude.ts. */
  occluders: { forearms: [ForearmCall | null, ForearmCall | null]; face: Ellipse | null }
  /** How the torso, hips and lean adjust the drawing (neutral without trusted hips); see arFitBody.ts. */
  fit: BodyFit
  cues: Cues
}
export interface Follow {
  state: FollowState
  /** 1 while tracked and for 300 ms after, then fades to 0 over 300 ms. */
  opacity: number
  /** Null once the body has been lost for good. */
  pose: Pose | null
}

/**
 * Every landmark's One Euro filter, in stage px at 30 detections a second. Chosen on tests/shared/arSynth.ts (a person with 2 px of landmark
 * noise, the shoulder anchor): minCutoff / beta, still sd at 2 px noise, lag walking at 200 px/s, time to 90% of a 20 px shrug step.
 *   1 / 0.007 (before) 0.49 px, 39 ms, 200 ms     0.5 / 0.007 0.39 px, 43 ms, 233 ms     2 / 0.007 0.62 px, 33 ms, 133 ms
 *   0.5 / 0.02 (now)   0.47 px, 22 ms, 133 ms     1 / 0.02 0.54 px, 21 ms, 100 ms         0.5 / 0.05 0.60 px, 11 ms, 67 ms
 * The real model's noise on a still photo (video mode, 1 px shifts and sensor-like noise) was 0.4 to 1.9% of the shoulder span for the shoulders
 * (about 1.3 px at a 140 px span), so 2 px is the pessimistic case. Exported and mutable only so those tests can try other values.
 */
export const LANDMARK_FILTER = { minCutoff: 0.5, beta: 0.02, dCutoff: 1 }

/** Smooths landmarks into a pose frame by frame, and decides what to show when the body is lost, too close or too far. */
export class PoseFollower {
  private readonly left = new OneEuroPoint(LANDMARK_FILTER)
  private readonly right = new OneEuroPoint(LANDMARK_FILTER)
  private readonly hipLeft = new OneEuroPoint(LANDMARK_FILTER)
  private readonly hipRight = new OneEuroPoint(LANDMARK_FILTER)
  private readonly elbowLeft = new OneEuroPoint(LANDMARK_FILTER)
  private readonly elbowRight = new OneEuroPoint(LANDMARK_FILTER)
  private readonly wristLeft = new OneEuroPoint(LANDMARK_FILTER)
  private readonly wristRight = new OneEuroPoint(LANDMARK_FILTER)
  private readonly armLeft = new SleeveTracker(HOLD_MS, FADE_MS)
  private readonly armRight = new SleeveTracker(HOLD_MS, FADE_MS)
  /** The face points the chin ellipse is built from (0..10, the unused ones are never fed): filtered like the shoulders, or it would jitter on its own. */
  private readonly facePoints = Array.from({ length: 11 }, () => new OneEuroPoint(LANDMARK_FILTER))
  /** px/cm: 0.7 Hz gives 0.5% noise at 2 px of landmark noise and 90% of a 20% step in 0.5 s (0.4 Hz took 0.9 s). */
  private readonly scale = new OneEuro({ minCutoff: 0.7, beta: 0 })
  /** How much the hips bend the roll (0 or 1, eased), so the roll does not step when they appear or go; `hipMid` is the last smoothed hip midpoint it uses meanwhile. */
  private readonly hipWeight = new OneEuro({ minCutoff: 0.4, beta: 0 })
  private hipMid: Point | null = null
  /** Whether each landmark (by index plus the threshold it is judged by) is on; see HYSTERESIS. */
  private readonly on = new Map<number, boolean>()
  private readonly body = new BodyFitter()
  /** Whether the body is front-on enough to measure the torso and hips (with hysteresis, see FRONT_ON_ENTER). */
  private frontOn = false
  private readonly turn = new OneEuro({ minCutoff: 0.5, beta: 0.3 })
  private last: { follow: Follow; t: number } | null = null
  /** Placement from the last frame whose shoulder span was reliable (see RELIABLE_COS): held while the body is side-on. */
  private good: { x: number; y: number; roll: number; pxPerCm: number; span: number; minY: number } | null = null
  private readonly turns = new TurnDetector()
  private facing: Facing = 'front'
  /** Half turns added to the shoulders' yaw: one for each flip, in the direction the person was turning, so the shirt turns on through it. */
  private spin = 0
  /** The part of `spin` applied so far. A flip with no turn behind it (the face cue, a dwell, the button) eases in at SPIN_RATE instead of snapping; a handover is already continuous. */
  private shownSpin = 0
  private spinT: number | null = null
  /** What the face cue last settled on; it only acts when it changes, so a face MediaPipe still sees from behind cannot undo a turn or a manual flip. */
  private faceState: Facing = 'front'
  private votes = 0
  private source: Cues['source'] = 'auto'
  private reason: Cues['reason'] = null
  private rawYaw: number | null = null

  private reset() {
    for (const f of [this.left, this.right, this.hipLeft, this.hipRight, this.elbowLeft, this.elbowRight, this.wristLeft, this.wristRight, this.armLeft, this.armRight, this.scale, this.hipWeight, this.turn, this.body, ...this.facePoints]) f.reset()
    this.on.clear()
    this.hipMid = null
    this.frontOn = false
    this.last = null
    this.good = null
    this.turns.reset()
    this.facing = 'front'
    this.spin = 0
    this.shownSpin = 0
    this.spinT = null
    this.faceState = 'front'
    this.votes = 0
    this.source = 'auto'
    this.reason = null
    this.rawYaw = null
  }

  /** Whether landmark `i` is seen, with hysteresis around `min`. A missing landmark is not seen; one without a visibility is. */
  private seenAt(frame: PoseFrame, i: number, min = MIN_VISIBILITY) {
    const p = frame.image[i]
    const on = !!p && (p.visibility ?? 1) >= (this.on.get(i + min) ? min - HYSTERESIS : min + HYSTERESIS)
    this.on.set(i + min, on)
    return on
  }

  private setFacing(next: Facing, reason: NonNullable<Cues['reason']>) {
    if (next === this.facing) return
    this.facing = next
    const half = this.turns.direction * Math.PI
    this.spin += half
    if (reason === 'handover') this.shownSpin += half
    this.reason = reason
    this.source = reason === 'manual' ? 'manual' : 'auto'
    this.turns.markFlipped()
  }

  /** The customer's correction: the other side, until the next automatic flip (a lost body, 600 ms, starts afresh). */
  flip() {
    this.setFacing(this.facing === 'front' ? 'back' : 'front', 'manual')
  }

  /**
   * The facing from two cues. The turn: a pass through side-on (see arTurn.ts) toggles it. The face: after FACING_FRAMES frames in a row that
   * differ from what it last settled on it sets it; a frame that does not say, or says the same, starts the count over.
   */
  private decide(frame: PoseFrame, yaw: number, ratio: number, tMs: number) {
    const vote = facingVote(frame)
    this.votes = vote && vote !== this.faceState ? this.votes + 1 : 0
    if (this.votes >= FACING_FRAMES) {
      this.faceState = vote!
      this.votes = 0
      this.setFacing(vote!, 'face')
    }
    const why = this.turns.update(yaw, ratio, tMs)
    if (why) this.setFacing(this.facing === 'front' ? 'back' : 'front', why)
  }

  /**
   * `tMs` is the video frame's time. A null frame is a frame with no body in it. `refScaleX` is the scale x of the reference size (the
   * recommended one, else the middle one) that the drawing is sized by. `reduceMotion` makes a lost arm drop at once instead of easing.
   */
  update(frame: PoseFrame | null, tMs: number, view: View, refScaleX: number, reduceMotion = false): Follow {
    if (!frame || ![LEFT_SHOULDER, RIGHT_SHOULDER].map((i) => this.seenAt(frame, i)).every(Boolean)) return this.missing(tMs)
    if (this.last && tMs - this.last.t > HOLD_MS + FADE_MS) this.reset()
    const held = TRACKED.filter((i) => !this.seenAt(frame, i)).length

    // Screen sides by where the shoulders are in the image, not by label, so a label swap cannot turn the roll upside down.
    const [rawL, rawR] = [LEFT_SHOULDER, RIGHT_SHOULDER].sort((a, b) => toStage(frame.image[a], view).x - toStage(frame.image[b], view).x)
    const rawLeft = toStage(frame.image[rawL], view)
    const rawRight = toStage(frame.image[rawR], view)
    const l = this.left.filter(rawLeft, tMs)
    const r = this.right.filter(rawRight, tMs)
    // The yaw of the shoulders as seen (within +-90 degrees).
    const seenYaw = yawOf(frame.world[rawL], frame.world[rawR])
    // The unsmoothed span goes with the unsmoothed yaw: the two filters lag differently and would not cancel in the division by cos.
    const span = Math.hypot(rawLeft.x - rawRight.x, rawLeft.y - rawRight.y)
    const hips = this.seenAt(frame, LEFT_HIP) && this.seenAt(frame, RIGHT_HIP) ? [this.hipLeft.filter(toStage(frame.image[LEFT_HIP], view), tMs), this.hipRight.filter(toStage(frame.image[RIGHT_HIP], view), tMs)] : null
    if (hips) this.hipMid = { x: (hips[0].x + hips[1].x) / 2, y: (hips[0].y + hips[1].y) / 2 }
    const hipWeight = this.hipWeight.filter(hips ? 1 : 0, tMs)
    if (Math.cos(seenYaw) >= RELIABLE_COS || !this.good) {
      const mid = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 }
      let roll = shoulderRoll(l, r)
      if (this.hipMid) roll += (hipWeight * (torsoRoll(mid, this.hipMid) - roll)) / 2
      const pxPerCm = this.scale.filter(pxPerCmOf(span, seenYaw, refScaleX), tMs)
      // The seam is above the landmarks, along the (rolled) up direction of the body.
      const lift = LANDMARK_TO_SEAM_CM * pxPerCm
      this.good = { x: mid.x - lift * Math.sin(roll), y: mid.y - lift * Math.cos(roll), roll, pxPerCm, span: span / Math.max(Math.cos(seenYaw), RELIABLE_COS), minY: Math.min(l.y, r.y) }
    }
    const { x, y, roll, pxPerCm } = this.good
    const ratio = span / this.good.span
    this.decide(frame, seenYaw, ratio, tMs)
    // A half turn more for each flip, and while a handover waits for its frames, so the yaw stays continuous; continued from the last one.
    const step = (SPIN_RATE * (tMs - (this.spinT ?? tMs))) / 1000
    this.spinT = tMs
    this.shownSpin += Math.max(-step, Math.min(step, this.spin - this.shownSpin))
    const turned = unwrap(seenYaw + this.shownSpin + this.turns.unfold, this.rawYaw ?? 0)
    this.rawYaw = turned
    const yaw = this.turn.filter(turned, tMs)
    // Only elbows the hysteresis lets through (marked fully visible, so pairElbows' own 0.5 does not second-guess it).
    const elbowIn = [LEFT_ELBOW, RIGHT_ELBOW].map((i) => (this.seenAt(frame, i) ? { ...frame.image[i], visibility: 1 } : undefined))
    const pair = pairElbows(elbowIn, rawLeft, rawRight, view)
    // The wrist goes with its own elbow (13 with 15, 14 with 16), so each arm keeps its side.
    const arm = pair.map((e) => {
      const wrist = e === elbowIn[0] ? LEFT_WRIST : RIGHT_WRIST
      return { elbow: e, wrist: frame.image[wrist], wristAt: wrist, wristZ: frame.world[wrist]?.z }
    })
    const elbows = [this.elbowLeft, this.elbowRight].map((f, i) => (arm[i].elbow ? f.filter(toStage(arm[i].elbow, view), tMs) : null))
    const sleeves: [number, number] = [
      this.sleeve(elbows[0], l, roll, -1, this.armLeft, tMs, reduceMotion),
      this.sleeve(elbows[1], r, roll, 1, this.armRight, tMs, reduceMotion),
    ]
    const shoulderZ = frame.world[rawL] && frame.world[rawR] ? (frame.world[rawL].z + frame.world[rawR].z) / 2 : undefined
    const forearms = [this.wristLeft, this.wristRight].map((f, i) => {
      const wrist = arm[i].wrist
      const capsule = elbows[i] && wrist && this.seenAt(frame, arm[i].wristAt) ? forearmCapsule(elbows[i], f.filter(toStage(wrist, view), tMs), pxPerCm) : null
      if (!capsule) return null
      const gapM = arm[i].wristZ !== undefined && shoulderZ !== undefined ? arm[i].wristZ - shoulderZ : undefined
      if (!wristTrusted({ ...wrist!, visibility: this.seenAt(frame, arm[i].wristAt, WRIST_SEEN) ? 1 : 0 })) return { capsule, cut: false, why: 'unsure wrist', gapM }
      return forearmInFront(arm[i].wristZ, shoulderZ, this.facing) ? { capsule, cut: true, gapM } : { capsule, cut: false, why: 'behind', gapM }
    }) as [ForearmCall | null, ForearmCall | null]
    const face = faceEllipse(
      Array.from({ length: 11 }, (_, i) => ((FACE_GATED.includes(i) ? this.seenAt(frame, i) : frame.image[i]) ? { ...this.facePoints[i].filter(toStage(frame.image[i], view), tMs), visibility: 1 } : undefined)),
      this.facing,
    )
    const fit = this.fitBody(frame, [rawL, rawR], hips, l, r, seenYaw, tMs)
    const cues: Cues = { spanPx: this.good.span, yaw: seenYaw, ratio, face: faceVisibility(frame), held, source: this.source, reason: this.reason }
    const pose: Pose = { x, y, roll, yaw, facing: this.facing, pxPerCm, sleeves, occluders: { forearms, face }, fit, cues }

    // Distance is judged by the span corrected for the turn, and by the last reliable one while side-on.
    const tooClose = this.good.span > TOO_CLOSE_SPAN * view.width || this.good.minY < 0
    const state: FollowState = tooClose ? 'too-close' : this.good.span < TOO_FAR_SPAN * view.width ? 'too-far' : 'tracking'
    const follow: Follow = { state, opacity: 1, pose }
    this.last = { follow, t: tMs }
    return follow
  }

  /**
   * The torso length, hip width and lean for this frame, eased. Measured only with both hips trusted and the body front-on (the hips hide and the
   * widths foreshorten otherwise); otherwise the factors ease back to neutral, never snap. The lean also waits for the front view: facing
   * away the depth is not trustworthy (see forearmInFront).
   */
  private fitBody(frame: PoseFrame, shoulders: number[], hips: Point[] | null, l: Point, r: Point, seenYaw: number, tMs: number): BodyFit {
    const trusted = hips !== null && hipTrusted(frame.image[LEFT_HIP]) && hipTrusted(frame.image[RIGHT_HIP])
    const angle = Math.abs(seenYaw)
    this.frontOn = angle < FRONT_ON_ENTER || (this.frontOn && angle < FRONT_ON_LEAVE)
    const measuring = trusted && this.frontOn
    let measure: BodyMeasure | null = null
    let torsoPx: number | null = null
    if (measuring) {
      const shoulderSpan = Math.hypot(l.x - r.x, l.y - r.y)
      const [sx, sy] = [(l.x + r.x) / 2, (l.y + r.y) / 2]
      torsoPx = Math.hypot((hips![0].x + hips![1].x) / 2 - sx, (hips![0].y + hips![1].y) / 2 - sy)
      // The torso is not foreshortened by a turn, the span is: compare it with the span as if front-on.
      measure = {
        vy: torsoFactor(torsoPx, shoulderSpan / Math.max(Math.cos(seenYaw), RELIABLE_COS)),
        hip: hipFactor(Math.hypot(hips![0].x - hips![1].x, hips![0].y - hips![1].y), shoulderSpan),
      }
      const world = [...shoulders, LEFT_HIP, RIGHT_HIP].map((i) => frame.world[i])
      if (this.facing === 'front' && world.every(Boolean)) measure.pitch = leanOf(world.slice(0, 2), world.slice(2))
    }
    return {
      ...this.body.update(measure, tMs),
      hips: measuring ? 'tracked' : trusted ? 'side-on' : 'missing',
      torsoPx,
      hipY: hips && (hips[0].y + hips[1].y) / 2,
    }
  }

  /** One arm from its smoothed elbow (null when not visible; the shoulder is, or there would be no frame): else the tracker's hold and ease. */
  private sleeve(elbow: Point | null, shoulder: Point, roll: number, side: Side, tracker: SleeveTracker, tMs: number, snap: boolean) {
    return tracker.update(elbow ? sleeveAngle(shoulder, elbow, roll, side) : null, tMs, snap)
  }

  /** No body this frame: hold the last pose for 300 ms, fade it out over 300 ms more, then it is lost and the filters start afresh. */
  private missing(tMs: number): Follow {
    const last = this.last
    if (!last) return { state: 'lost', opacity: 0, pose: null }
    const gone = tMs - last.t
    if (gone <= HOLD_MS) return last.follow
    if (gone >= HOLD_MS + FADE_MS) {
      this.reset()
      return { state: 'lost', opacity: 0, pose: null }
    }
    return { ...last.follow, state: 'lost', opacity: 1 - (gone - HOLD_MS) / FADE_MS }
  }
}

/** The shirt mesh's placement on the canvas (three.js units are pixels, y up, origin at the top-left corner of the stage). */
export function garmentTransform(pose: Pose, size: ReturnType<typeof garmentScale>) {
  // The vertical scale is also the torso's: a longer torso draws a longer shirt, the width keeps following the shoulders.
  const scale = { x: size.x * pose.pxPerCm, y: size.y * pose.pxPerCm * pose.fit.vy, z: size.z * pose.pxPerCm }
  // The mesh origin is at the hem and the shoulder point is SEAM_HEIGHT above it, so the origin is that far down the rolled axis from the seam;
  // leaning toward the camera shortens that on the screen by cos(pitch).
  const drop = SEAM_HEIGHT * scale.y * Math.cos(pose.fit.pitch)
  return {
    x: pose.x + drop * Math.sin(pose.roll),
    y: -pose.y - drop * Math.cos(pose.roll),
    rotationX: pose.fit.pitch,
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
 * drops to 15; if fewer than 10 detections a second keep up for 3 s the device is too slow for tracking. With `mask` on (reading the person
 * mask costs the most) the mask is dropped first, on the first busy period or the first slow one; only the next one lowers the rate or gives up.
 */
export class RateHealth {
  rate: number
  slow = false
  mask: boolean
  private readonly budgetMs: number
  private readonly times: number[] = []
  private readonly durations: number[] = []
  private firstT: number | null = null
  private busySince: number | null = null
  private slowSince: number | null = null

  constructor(coarse: boolean, mask = false) {
    this.mask = mask
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
    if (this.busySince !== null && tMs - this.busySince >= BUSY_MS) {
      if (this.mask) {
        this.mask = false
        this.busySince = null
      } else this.rate = Math.min(this.rate, DEGRADED_RATE)
    }

    // The first second is a warm-up: the window is not full yet.
    if (tMs - this.firstT < 1000) return
    if (this.times.length < SLOW_BELOW) this.slowSince ??= tMs
    else this.slowSince = null
    if (this.slowSince !== null && tMs - this.slowSince >= SLOW_MS) {
      if (this.mask) {
        this.mask = false
        this.slowSince = null
      } else this.slow = true
    }
  }
}
