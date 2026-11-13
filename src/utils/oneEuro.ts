// One Euro filter (Casiez et al. 2012): heavy smoothing while a value is steady, little lag while it moves fast. Pure TypeScript.

const alphaOf = (cutoffHz: number, dtSeconds: number) => 1 / (1 + 1 / (2 * Math.PI * cutoffHz) / dtSeconds)

/** A gap between samples longer than this (4 frames at 30 detections a second, still under 10 a second), and the frame it is treated as. */
const GAP_S = 0.15
const FRAME_S = 1 / 30

export interface OneEuroParams {
  /** Smoothing of a steady value, in Hz: lower is smoother. */
  minCutoff: number
  /** How fast the cutoff rises with speed: higher follows quick moves more closely. */
  beta: number
  /** Cutoff of the speed estimate itself, in Hz. */
  dCutoff?: number
}

export class OneEuro {
  private readonly params: OneEuroParams
  private last: { x: number; dx: number; t: number } | null = null

  constructor(params: OneEuroParams) {
    this.params = params
  }

  /** The filtered value for a sample at `tMs` (the video frame's time). A sample that is not newer than the last is ignored. */
  filter(x: number, tMs: number): number {
    const last = this.last
    if (!last) {
      this.last = { x, dx: 0, t: tMs }
      return x
    }
    let dt = (tMs - last.t) / 1000
    if (dt <= 0) return last.x
    // After a gap (a landmark that was not seen) the old value is stale: treat the sample as one ordinary frame with no speed, so the
    // filter eases toward it at its steady pace instead of jumping most of the way because dt was big.
    const gap = dt > GAP_S
    if (gap) dt = FRAME_S
    const { minCutoff, beta, dCutoff = 1 } = this.params
    const dx = gap ? 0 : last.dx + alphaOf(dCutoff, dt) * ((x - last.x) / dt - last.dx)
    const smoothed = last.x + alphaOf(minCutoff + beta * Math.abs(dx), dt) * (x - last.x)
    this.last = { x: smoothed, dx, t: tMs }
    return smoothed
  }

  /** Forget the history: the next sample passes through unchanged. Use after the body was lost. */
  reset() {
    this.last = null
  }
}

export class OneEuroPoint {
  private readonly fx: OneEuro
  private readonly fy: OneEuro

  constructor(params: OneEuroParams) {
    this.fx = new OneEuro(params)
    this.fy = new OneEuro(params)
  }

  filter(p: { x: number; y: number }, tMs: number) {
    return { x: this.fx.filter(p.x, tMs), y: this.fy.filter(p.y, tMs) }
  }

  reset() {
    this.fx.reset()
    this.fy.reset()
  }
}
