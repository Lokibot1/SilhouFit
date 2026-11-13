// Telling that the customer has turned their back on the camera, for the AR try-on. Pure TypeScript.
//
// From behind MediaPipe still reports the nose and eyes as visible (about 0.9), labels the shoulders by image side as if the person faced the
// camera, and its world-z yaw does not read a half turn, so the pose from behind cannot say "back". The turn itself can be seen instead: a
// person turning round passes through side-on, where the shoulder span collapses and re-expands, and MediaPipe then reports a front-like pose.
//
// Assumption (the model the tests sweep, not yet verified on a real person): with the labels following image side, the observed yaw is the
// actual yaw folded to a front-like one (|obs| <= 90 degrees). Two folds are possible, and the detector reads both:
//   - sawtooth (depth ordering true to the body): obs = actual up to 90, then jumps to the other sign and rises to 0 at 180, so the observed
//     yaw changes sign while the span is collapsed. A peek and return never does that (it comes back through the front region on the same
//     side), so this separates a pass-through from a peek at any speed: "handover".
//   - triangle (depth mirrored too): obs = 180 - actual past 90, the same sign all through. A turn to the back and a deep peek that returns
//     then give identical numbers, because the shoulder line projects the same at angles a and 180 - a. No rule can tell them apart from
//     the observations. The safer choice: a quick out-and-back (under PEEK_MS) is a peek and does not flip; one that took longer, so the
//     person stayed beyond side-on for a while before the span re-expanded, is a turn: "dwell". A fast turn in this fold is missed, and a
//     long deep peek flips by mistake; the customer fixes either with the flip button.

const rad = (deg: number) => (deg * Math.PI) / 180

/** The observed yaw must have reached this (about side-on) with the span collapsed for a turn to count. */
export const TURN_PEAK = rad(65)
/** Shoulder span as a share of the span facing front (the last reliable one), below which the body counts as side-on. cos 63 degrees. */
export const SIDE_SPAN = 0.45
/** An excursion starts when the observed yaw passes this, and ends when it is back inside it (the front region). */
export const EXCURSION = rad(35)
/** The yaw must read the other sign, with at least this size, for HANDOVER_FRAMES frames in a row, to count as a handover. */
export const HANDOVER_MIN = rad(40)
export const HANDOVER_FRAMES = 3
/** An excursion that is back in the front region within this has no handover: it is a peek. */
export const PEEK_MS = 1500

export type FlipReason = 'handover' | 'dwell'

interface Excursion {
  since: number
  side: 1 | -1
  peak: number
  minRatio: number
  against: number
  flipped: boolean
}

export class TurnDetector {
  private exc: Excursion | null = null
  private last: 1 | -1 = 1

  /** The way the person is turning (the sign of the excursion's yaw, else the last one's): the direction of the shirt's half turn. */
  get direction() {
    return this.exc?.side ?? this.last
  }

  reset() {
    this.exc = null
    this.last = 1
  }

  /** A half turn to add to the yaw while a handover is waiting for its frames: the sign has flipped but the person has not turned back. */
  get unfold() {
    const e = this.exc
    return e && !e.flipped && e.against > 0 ? e.side * Math.PI : 0
  }

  /** Another cue flipped the facing during this excursion: the same turn must not flip it again. */
  markFlipped() {
    if (this.exc) this.exc.flipped = true
  }

  /** `yaw` is the observed one (radians, signed, +-90 degrees), `ratio` the span over the span facing front, `tMs` the frame time. Returns why to flip, if now. */
  update(yaw: number, ratio: number, tMs: number): FlipReason | null {
    const a = Math.abs(yaw)
    const sign = yaw < 0 ? -1 : 1
    if (!this.exc) {
      if (a < EXCURSION) return null
      this.exc = { since: tMs, side: sign, peak: a, minRatio: ratio, against: 0, flipped: false }
    }
    const e = this.exc
    if (a < EXCURSION) {
      this.exc = null
      this.last = e.side
      return !e.flipped && e.peak >= TURN_PEAK && e.minRatio < SIDE_SPAN && tMs - e.since >= PEEK_MS ? 'dwell' : null
    }
    e.minRatio = Math.min(e.minRatio, ratio)
    if (sign === e.side) {
      e.peak = Math.max(e.peak, a)
      e.against = 0
    } else e.against = a >= HANDOVER_MIN ? e.against + 1 : 0
    if (!e.flipped && e.against >= HANDOVER_FRAMES && e.peak >= TURN_PEAK && e.minRatio < SIDE_SPAN) {
      e.flipped = true
      return 'handover'
    }
    return null
  }
}
