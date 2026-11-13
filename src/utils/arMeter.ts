import type { OneEuroParams } from './oneEuro'

// Numbers for the ?debug=ar overlay (and the jitter tests): how much the shirt anchor shakes, how fast it moves, and how far the smoothing lags.

export interface Sample {
  /** Milliseconds. */
  t: number
  x: number
  y: number
}

/**
 * Jitter in px: the standard deviation, per axis, of the samples around their own slow trend (a centred moving average over `windowMs`, so a
 * steady walk or a slow sway does not count as jitter). 0 without 3 samples that have a full window (a 2 s log gives 1 s of them).
 */
export function jitterPx(samples: Sample[], windowMs = 1000) {
  // Only samples with a full window on both sides: a window cut short at either end would leave the trend itself in the residual.
  const inner = samples.filter((s) => s.t - windowMs / 2 >= samples[0].t && s.t + windowMs / 2 <= samples[samples.length - 1].t)
  if (inner.length < 3) return 0
  let sum = 0
  for (const s of inner) {
    const near = samples.filter((o) => Math.abs(o.t - s.t) <= windowMs / 2 + 1e-6)
    const mean = { x: near.reduce((a, o) => a + o.x, 0) / near.length, y: near.reduce((a, o) => a + o.y, 0) / near.length }
    sum += (s.x - mean.x) ** 2 + (s.y - mean.y) ** 2
  }
  return Math.sqrt(sum / (2 * inner.length))
}

/** Speed in px a second from the first to the last of the samples. */
export function speedPxS(samples: Sample[]) {
  const [a, b] = [samples[0], samples[samples.length - 1]]
  return samples.length < 2 || b.t <= a.t ? 0 : (Math.hypot(b.x - a.x, b.y - a.y) * 1000) / (b.t - a.t)
}

/** The delay of a One Euro filter on a steady move at `speedPxS`: one time constant of its cutoff, 1 / (2 pi (minCutoff + beta speed)), in ms. */
export const lagMs = ({ minCutoff, beta }: OneEuroParams, speed: number) => 1000 / (2 * Math.PI * (minCutoff + beta * speed))
