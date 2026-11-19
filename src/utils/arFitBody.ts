import { OneEuro } from './oneEuro'

// Fitting the AR try-on shirt to the whole torso, not only the shoulders: its length from the shoulder-to-hip distance, a gentle taper of the
// body below the chest from the hip width, and a lean toward or away from the camera from the world landmarks. Pure maths, no rendering.
// Everything here is a factor around neutral (1, 1, 0 rad), and every filter eases back to neutral when the hips cannot be trusted, so the
// shoulders-only fit is the fallback and nothing ever snaps.

/**
 * Shoulder-joint-to-hip-joint distance over the shoulder-joint span (image px, front-on) at which the shirt keeps its natural length. Not the
 * average of MediaPipe's output: the real pose_landmarker_lite on this repo's 4 usable product photos (all four joints seen, in frame, within
 * 35 degrees of front-on) read 1.56, 1.69, 1.74 and 1.79 (mean 1.70, sd 0.08), and its world landmarks 1.31 to 1.54 (the 5th, an oversized hoodie
 * with 23 cm world shoulders, 2.08). The drawn hem sits about 1.5 spans below the shoulder landmarks at its natural length, so a constant at the
 * measured average would leave the hem on the hip joints. 1.3 (also the anatomical ratio, about 52 cm over 40 cm) puts it about 0.2 spans
 * (8 cm) below them, and a longer torso lengthens the shirt up to VY_MAX. Tune it with the "torso" line of ?debug=ar on a real person.
 */
export const TORSO_TO_SPAN = 1.3
/** Hip-joint span over shoulder-joint span, front-on: 0.57 on the same photos (0.54 to 0.61, sd 0.02). Only the deviation from it tapers the shirt. */
export const HIP_TO_SPAN = 0.57
/** The vertical factor and the hem taper factor stay within these, so a bad landmark cannot reshape the shirt; the taper is a few percent on purpose. */
export const VY_MIN = 0.85
export const VY_MAX = 1.2
export const HIP_MIN = 0.9
export const HIP_MAX = 1.1
/** The lean toward or away from the camera is limited to this (radians, 20 degrees): the world z is the weakest of MediaPipe's outputs. */
export const PITCH_MAX = (20 * Math.PI) / 180
/**
 * The torso and hip measures are trusted while the body is within this of front-on (observed yaw, radians): past it the hips hide behind the
 * body and the widths foreshorten. Entering needs the smaller angle and leaving the larger, so a body hovering at the edge does not flicker.
 */
export const FRONT_ON_ENTER = (30 * Math.PI) / 180
export const FRONT_ON_LEAVE = (40 * Math.PI) / 180
/** Easing of every factor, in Hz: about 0.4 s to settle, slow enough that the hem does not bob with landmark noise. */
const EASE = { minCutoff: 0.4, beta: 0 }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Multiplier of the shirt's vertical scale: the torso's length against what the shoulder span says it should be. */
export const torsoFactor = (torsoPx: number, spanPx: number) => clamp(torsoPx / (TORSO_TO_SPAN * spanPx), VY_MIN, VY_MAX)
/** Width factor of the shirt at its hem: the hip span against what the shoulder span says it should be. */
export const hipFactor = (hipSpanPx: number, spanPx: number) => clamp(hipSpanPx / (HIP_TO_SPAN * spanPx), HIP_MIN, HIP_MAX)

/**
 * Lean of the torso from the world landmarks (radians, positive = the top toward the camera, the way rotation about x brings +y toward +z in
 * three.js). MediaPipe's world z grows away from the camera, so shoulders nearer than the hips lean toward it.
 */
export function leanOf(shoulders: { x: number; y: number; z: number }[], hips: { x: number; y: number; z: number }[]) {
  const mid = (p: { x: number; y: number; z: number }[], axis: 'x' | 'y' | 'z') => (p[0][axis] + p[1][axis]) / 2
  const along = Math.hypot(mid(hips, 'x') - mid(shoulders, 'x'), mid(hips, 'y') - mid(shoulders, 'y'))
  return clamp(Math.atan2(mid(hips, 'z') - mid(shoulders, 'z'), along), -PITCH_MAX, PITCH_MAX)
}

/** What the follower hands on: the factors to draw with, and what they came from (for the ?debug=ar overlay). */
export interface BodyFit {
  /** Multiplies the shirt's vertical scale. */
  vy: number
  /** Width factor of the hem (1 at the underarm). */
  hip: number
  /** Radians, positive = the top of the shirt toward the camera. */
  pitch: number
  /** 'tracked': measuring; 'side-on': hips seen but the body is turned; 'missing': hips out of frame or not seen. The factors ease to neutral unless tracked. */
  hips: 'tracked' | 'side-on' | 'missing'
  /** The measured shoulder-to-hip distance in stage px, null unless tracked. */
  torsoPx: number | null
  /** Stage y of the hip midpoint (px, down), null unless the hips are seen. */
  hipY: number | null
}

/** What one frame measured; a field left out is not measured and eases to neutral. */
export interface BodyMeasure {
  vy?: number
  hip?: number
  pitch?: number
}

/** Low-pass filters for the three factors. A frame with nothing measured pulls them back to neutral at the same pace, so nothing jumps. */
export class BodyFitter {
  private readonly vy = new OneEuro(EASE)
  private readonly hip = new OneEuro(EASE)
  private readonly pitch = new OneEuro(EASE)

  update(measure: BodyMeasure | null, tMs: number) {
    return {
      vy: this.vy.filter(measure?.vy ?? 1, tMs),
      hip: this.hip.filter(measure?.hip ?? 1, tMs),
      pitch: this.pitch.filter(measure?.pitch ?? 0, tMs),
    }
  }

  reset() {
    this.vy.reset()
    this.hip.reset()
    this.pitch.reset()
  }
}
