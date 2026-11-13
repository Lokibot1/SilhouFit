// Telling that the customer has turned their back on the camera, for the AR try-on. Pure TypeScript.
//
// From behind MediaPipe still reports the nose and eyes as visible (about 0.9), labels the shoulders by image side as if the person faced the
// camera, and its world-z yaw does not read a half turn, so the pose from behind cannot say "back". The turn itself can be seen instead: a
// person turning round passes through side-on, where the shoulder span collapses and re-expands, and MediaPipe then reports a front-like pose.
//
// Assumption (the model the tests sweep, not yet verified on a real person): with the labels following image side, the observed yaw is the
// actual yaw folded to a front-like one (|obs| <= 90 degrees). Two folds are possible:
//   - sawtooth (depth ordering true to the body): obs = actual up to 90, then jumps to the other sign and rises to 0 at 180. Only a clear,
//     held turn flips the facing ("handover"): the span collapsed and the yaw reached TURN_PEAK, then it reads the OTHER sign and has come
//     round to HANDOVER_MAX or less (the person is at about 130 degrees or more) for HANDOVER_FRAMES frames, or it ends the excursion in the
//     front region on that other sign (a fast turn). Standing side-on, however long, and a peek that crosses 90 degrees but not about 130,
//     never flip: at side-on the sign chatters at |obs| near 90, far from HANDOVER_MAX.
//   - A flip that was wrong (a peek past 130 degrees that then goes back) is undone by itself ("retrace"): the yaw comes back through side-on
//     to the SAME sign it left, for HANDOVER_FRAMES frames at HANDOVER_MIN or more, or the excursion ends on that sign.
//   - triangle (depth mirrored too): obs = 180 - actual past 90, the same sign all through. A turn to the back and a side-on pose that returns
//     (or a deep peek) then give identical numbers, because the shoulder line projects the same at angles a and 180 - a, so nothing is flipped
//     on its own; the customer uses the flip button. (The old "dwell" rule, which flipped after 1.5 s out, also flipped a side-on pose held that long.)
// A flip by the face cue or the button stops the detector flipping again during the same excursion, so a manual choice wins until the next one.

const rad = (deg: number) => (deg * Math.PI) / 180

/** The observed yaw must have reached this (about side-on) with the span collapsed for a turn to count. */
export const TURN_PEAK = rad(65)
/** Shoulder span as a share of the span facing front (the last reliable one), below which the body counts as side-on. cos 63 degrees. */
export const SIDE_SPAN = 0.45
/** An excursion starts when the observed yaw passes this, and ends when it is back inside it (the front region). */
export const EXCURSION = rad(35)
/** The sign only counts (the shirt's half turn unfolds, a retrace is read) at this size or more, so jitter near zero cannot flip it. */
export const HANDOVER_MIN = rad(40)
/** A handover needs the other sign at this size or less: the person is past side-on by 40 degrees. Far from the +-90 where the sign chatters. */
export const HANDOVER_MAX = rad(50)
/** Frames in a row a handover or retrace must read (about 100 ms at 30 detections a second). */
export const HANDOVER_FRAMES = 3

export type FlipReason = 'handover' | 'retrace'

interface Excursion {
  side: 1 | -1
  peak: number
  minRatio: number
  /** The yaw last read the other sign than `side` (at HANDOVER_MIN or more). */
  opposite: boolean
  streak: number
  /** This detector flipped the facing in this excursion (a handover), and it can still be undone. */
  crossed: boolean
  /** Another cue flipped the facing during this excursion: the detector leaves it alone. */
  other: boolean
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

  /**
   * A half turn to add to the yaw while the sign and the facing disagree: the sign has flipped but the facing has not yet (waiting for a
   * handover), or the sign has come back after a handover (waiting for the retrace). Keeps the shirt's yaw continuous.
   */
  get unfold() {
    const e = this.exc
    if (!e || e.other || e.opposite === e.crossed) return 0
    return (e.crossed ? -e.side : e.side) * Math.PI
  }

  /** Another cue (the face or the button) flipped the facing during this excursion: the same turn must not flip it again or undo it. */
  markFlipped() {
    if (!this.exc) return
    this.exc.other = true
    this.exc.crossed = false
  }

  /** `yaw` is the observed one (radians, signed, +-90 degrees), `ratio` the span over the span facing front. Returns why to flip, if now. */
  update(yaw: number, ratio: number): FlipReason | null {
    const a = Math.abs(yaw)
    const sign = yaw < 0 ? -1 : 1
    if (!this.exc) {
      if (a < EXCURSION) return null
      this.exc = { side: sign, peak: a, minRatio: ratio, opposite: false, streak: 0, crossed: false, other: false }
    }
    const e = this.exc
    if (a < EXCURSION) {
      this.exc = null
      this.last = e.side
      if (e.other) return null
      if (e.crossed) return e.opposite ? null : 'retrace'
      return e.opposite && turned(e) ? 'handover' : null
    }
    e.minRatio = Math.min(e.minRatio, ratio)
    if (sign === e.side) e.peak = Math.max(e.peak, a)
    if (a >= HANDOVER_MIN) e.opposite = sign !== e.side
    const reads = e.crossed ? sign === e.side && a >= HANDOVER_MIN : sign !== e.side && a <= HANDOVER_MAX && turned(e)
    e.streak = !e.other && reads ? e.streak + 1 : 0
    if (e.streak < HANDOVER_FRAMES) return null
    e.streak = 0
    e.crossed = !e.crossed
    return e.crossed ? 'handover' : 'retrace'
  }
}

/** The span collapsed and the yaw reached side-on: a turn, not a wobble. */
const turned = (e: Excursion) => e.peak >= TURN_PEAK && e.minRatio < SIDE_SPAN
