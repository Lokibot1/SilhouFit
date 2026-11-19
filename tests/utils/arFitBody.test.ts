import { describe, expect, it } from 'vitest'
import { BodyFitter, FRONT_ON_ENTER, FRONT_ON_LEAVE, HIP_MAX, HIP_MIN, HIP_TO_SPAN, hipFactor, leanOf, PITCH_MAX, TORSO_TO_SPAN, torsoFactor, VY_MAX, VY_MIN } from '../../src/utils/arFitBody'
import { garmentScale, SEAM_HEIGHT } from '../../src/utils/arGarment'
import { garmentTransform, LEFT_HIP, LEFT_SHOULDER, PoseFollower, RIGHT_HIP, RIGHT_SHOULDER, type Landmark, type PoseFrame, type View } from '../../src/utils/arPose'

const VIEW: View = { videoW: 640, videoH: 480, width: 640, height: 480 }
const STEP = 1000 / 30
const rad = (deg: number) => (deg * Math.PI) / 180
const SPAN = 128 // shoulders 0.2 of the 640 px frame apart
const at = (ratio: number) => Math.round(ratio * SPAN)

interface Body {
  /** Raw video px from the shoulder line to the hips. */
  down?: number
  /** Hip half-width in raw units (the shoulders' is 0.1). */
  half?: number
  v?: number
  hipY?: number
  /** World z of the hips (shoulder midpoint is 0); positive = hips farther than the shoulders = leaning toward the camera. */
  hipZ?: number
  /** Degrees round from facing the camera. */
  yaw?: number
}
/** A person `yaw` degrees round (labels true to the body, as in turned() of arPose.test.ts) with both hips, or no hips when `down` is absent. */
function body({ down, half = HIP_TO_SPAN * 0.1, v = 1, hipY, hipZ = 0, yaw = 0 }: Body = {}): PoseFrame {
  const [cos, sin] = [Math.cos(rad(yaw)), Math.sin(rad(yaw))]
  const image: Landmark[] = []
  image[LEFT_SHOULDER] = { x: 0.5 + 0.1 * cos, y: 0.4, visibility: 1 }
  image[RIGHT_SHOULDER] = { x: 0.5 - 0.1 * cos, y: 0.4, visibility: 1 }
  for (const i of [0, 2, 5]) image[i] = { x: 0.5, y: 0.3, visibility: Math.abs(yaw) < 90 ? 1 : 0.1 }
  const world = []
  world[LEFT_SHOULDER] = { x: 0.2 * cos, y: 0, z: -0.2 * sin }
  world[RIGHT_SHOULDER] = { x: -0.2 * cos, y: 0, z: 0.2 * sin }
  if (down !== undefined || hipY !== undefined) {
    const y = hipY ?? 0.4 + down! / 480
    image[LEFT_HIP] = { x: 0.5 + half * cos, y, visibility: v }
    image[RIGHT_HIP] = { x: 0.5 - half * cos, y, visibility: v }
    world[LEFT_HIP] = { x: 0.1 * cos, y: 0.5, z: hipZ - 0.1 * sin }
    world[RIGHT_HIP] = { x: -0.1 * cos, y: 0.5, z: hipZ + 0.1 * sin }
  }
  return { image, world }
}
const fitOf = (b: Body) => new PoseFollower().update(body(b), 0, VIEW, 1).pose!.fit
/** Runs `frames` frames of `b` from `t0` (ms) and returns each frame's fit. */
function run(f: PoseFollower, b: Body, frames: number, t0 = 0) {
  return Array.from({ length: frames }, (_, i) => f.update(body(b), t0 + i * STEP, VIEW, 1).pose!.fit)
}

describe('torso factor', () => {
  it('is 1 when the torso matches the average ratio, longer for a longer torso, shorter for a shorter one', () => {
    expect(torsoFactor(TORSO_TO_SPAN * SPAN, SPAN)).toBeCloseTo(1)
    expect(torsoFactor(1.5 * SPAN, SPAN)).toBeGreaterThan(1)
    expect(torsoFactor(1.15 * SPAN, SPAN)).toBeLessThan(1)
    expect(torsoFactor(1.5 * SPAN, SPAN)).toBeCloseTo(1.5 / TORSO_TO_SPAN)
  })
  it('is clamped', () => {
    expect(torsoFactor(3 * SPAN, SPAN)).toBe(VY_MAX)
    expect(torsoFactor(0.4 * SPAN, SPAN)).toBe(VY_MIN)
  })
})

describe('hip factor', () => {
  it('is 1 at the average hip to shoulder ratio, and clamps to a few percent', () => {
    expect(hipFactor(HIP_TO_SPAN * SPAN, SPAN)).toBeCloseTo(1)
    expect(hipFactor(0.6 * SPAN, SPAN)).toBeCloseTo(0.6 / HIP_TO_SPAN)
    expect(hipFactor(1.2 * SPAN, SPAN)).toBe(HIP_MAX)
    expect(hipFactor(0.2 * SPAN, SPAN)).toBe(HIP_MIN)
  })
})

describe('lean', () => {
  const pair = (z: number, y = 0) => [{ x: -0.2, y, z }, { x: 0.2, y, z }]
  it('is positive when the shoulders are nearer the camera than the hips (the top comes toward the viewer), negative the other way, 0 when level', () => {
    expect(leanOf(pair(0), pair(0.3, 0.5))).toBeGreaterThan(0)
    expect(leanOf(pair(0.3), pair(0, 0.5))).toBeLessThan(0)
    expect(leanOf(pair(0), pair(0, 0.5))).toBeCloseTo(0)
    expect(leanOf(pair(0), pair(0.18, 0.5))).toBeCloseTo(Math.atan2(0.18, 0.5))
  })
  it('is clamped to 20 degrees', () => {
    expect(leanOf(pair(0), pair(2, 0.5))).toBe(PITCH_MAX)
    expect(leanOf(pair(2), pair(0, 0.5))).toBe(-PITCH_MAX)
  })
})

describe('the follower fit', () => {
  it('is neutral without hips, so the shoulders-only fit is the fallback', () => {
    expect(fitOf({})).toEqual({ vy: 1, hip: 1, pitch: 0, hips: 'missing', torsoPx: null, hipY: null })
  })
  it('measures an average torso as 1, a long one longer and a short one shorter, with the torso length in px', () => {
    expect(fitOf({ down: at(TORSO_TO_SPAN) })).toMatchObject({ hips: 'tracked', vy: expect.closeTo(1, 2), hip: expect.closeTo(1, 2), pitch: 0 })
    expect(fitOf({ down: at(1.52) }).vy).toBeGreaterThan(1.1)
    expect(fitOf({ down: at(1.1) }).vy).toBeLessThan(0.9)
    expect(fitOf({ down: at(1.52) }).torsoPx).toBeCloseTo(at(1.52))
    expect(fitOf({ down: at(2) }).vy).toBe(VY_MAX)
    expect(fitOf({ down: at(0.7) }).vy).toBe(VY_MIN)
  })
  it('tapers the hem with the hip width, within a few percent', () => {
    expect(fitOf({ down: at(1.3), half: 0.075 }).hip).toBeGreaterThan(1)
    expect(fitOf({ down: at(1.3), half: 0.045 }).hip).toBeLessThan(1)
    expect(fitOf({ down: at(1.3), half: 0.2 }).hip).toBe(HIP_MAX)
    expect(fitOf({ down: at(1.3), half: 0.01 }).hip).toBe(HIP_MIN)
  })
  it('leans with the world z: toward the camera is positive', () => {
    expect(fitOf({ down: at(1.3), hipZ: 0.15 }).pitch).toBeGreaterThan(0)
    expect(fitOf({ down: at(1.3), hipZ: -0.15 }).pitch).toBeLessThan(0)
    expect(Math.abs(fitOf({ down: at(1.3), hipZ: 5 }).pitch)).toBe(PITCH_MAX)
  })
  it('does not measure hips that are not seen, only barely seen, or at the edge of the frame', () => {
    for (const b of [{ v: 0.3 }, { hipY: 0.98 }, { hipY: 0.03 }]) expect(fitOf({ down: at(1.52), ...b })).toMatchObject({ vy: 1, hip: 1, pitch: 0, hips: 'missing' })
  })
  it('eases back to neutral without a jump when the hips go missing', () => {
    const f = new PoseFollower()
    const before = run(f, { down: at(1.52), hipZ: 0.15 }, 90)
    expect(before.at(-1)!.vy).toBeGreaterThan(1.15)
    const after = run(f, { v: 0.2, down: at(1.52) }, 150, 90 * STEP)
    const track = [before.at(-1)!, ...after]
    for (let i = 1; i < track.length; i++) {
      expect(Math.abs(track[i].vy - track[i - 1].vy)).toBeLessThan(0.02)
      expect(Math.abs(track[i].pitch - track[i - 1].pitch)).toBeLessThan(rad(1.5))
    }
    expect(after[0].vy).toBeGreaterThan(1.1)
    expect(after.at(-1)!.vy).toBeCloseTo(1, 1)
    expect(after.at(-1)!.pitch).toBeCloseTo(0, 1)
    expect(after.at(-1)!.hips).toBe('missing')
  })
  it('eases to neutral when the body turns side-on, and measures again when it is back', () => {
    const f = new PoseFollower()
    run(f, { down: at(1.52), yaw: 0 }, 90)
    const side = run(f, { down: at(1.52), yaw: 60 }, 150, 90 * STEP)
    expect(side[0].hips).toBe('side-on')
    expect(side[0].vy).toBeGreaterThan(1.1)
    expect(side.at(-1)!.vy).toBeCloseTo(1, 1)
    const back = run(f, { down: at(1.52), yaw: 0 }, 150, 240 * STEP)
    expect(back.at(-1)!.hips).toBe('tracked')
    expect(back.at(-1)!.vy).toBeGreaterThan(1.1)
  })
  it('has hysteresis at the edge of front-on: between the two angles it keeps what it was doing', () => {
    const mid = (FRONT_ON_ENTER + FRONT_ON_LEAVE) / 2
    const midDeg = (mid * 180) / Math.PI
    const f = new PoseFollower()
    expect(run(f, { down: at(1.3), yaw: 0 }, 3)[2].hips).toBe('tracked')
    expect(run(f, { down: at(1.3), yaw: midDeg }, 3, 3 * STEP)[2].hips).toBe('tracked')
    expect(run(f, { down: at(1.3), yaw: 50 }, 3, 6 * STEP)[2].hips).toBe('side-on')
    expect(run(f, { down: at(1.3), yaw: midDeg }, 3, 9 * STEP)[2].hips).toBe('side-on')
    expect(run(f, { down: at(1.3), yaw: 10 }, 3, 12 * STEP)[2].hips).toBe('tracked')
  })
  it('stays finite and inside the clamps through a 360 degree sweep, easing from one frame to the next', () => {
    const f = new PoseFollower()
    let last: ReturnType<typeof fitOf> | null = null
    for (let deg = 0; deg <= 360; deg += 4) {
      const fit = f.update(body({ down: at(1.45), hipZ: 0.1, yaw: deg }), (deg / 4) * 70, VIEW, 1).pose!.fit
      for (const v of [fit.vy, fit.hip, fit.pitch, fit.hipY ?? 0, fit.torsoPx ?? 0]) expect(Number.isFinite(v)).toBe(true)
      expect(fit.vy).toBeGreaterThanOrEqual(VY_MIN)
      expect(fit.vy).toBeLessThanOrEqual(VY_MAX)
      expect(fit.hip).toBeGreaterThanOrEqual(HIP_MIN)
      expect(fit.hip).toBeLessThanOrEqual(HIP_MAX)
      expect(Math.abs(fit.pitch)).toBeLessThanOrEqual(PITCH_MAX)
      if (last) expect(Math.abs(fit.vy - last.vy)).toBeLessThan(0.08)
      last = fit
    }
  })
})

describe('the filters', () => {
  it('start at the first measure and ease to neutral when nothing is measured', () => {
    const b = new BodyFitter()
    expect(b.update({ vy: 1.2, hip: 1.1, pitch: 0.3 }, 0)).toEqual({ vy: 1.2, hip: 1.1, pitch: 0.3 })
    const next = b.update(null, STEP)
    expect(next.vy).toBeLessThan(1.2)
    expect(next.vy).toBeGreaterThan(1.15)
  })
})

describe('the shirt with the fit', () => {
  const m = garmentScale({ chestWidthCm: 52, totalLengthCm: 70 })
  const pose = (b: Body) => new PoseFollower().update(body(b), 0, VIEW, m.x).pose!

  it('scales the length by the torso factor and leaves the width alone', () => {
    const [plain, long] = [pose({}), pose({ down: at(1.52) })]
    const [a, c] = [garmentTransform(plain, m), garmentTransform(long, m)]
    expect(c.scale.y / a.scale.y).toBeCloseTo(long.fit.vy)
    expect(c.scale.x).toBeCloseTo(a.scale.x)
    expect(c.scale.z).toBeCloseTo(a.scale.z)
    expect(c.widthPx).toBeCloseTo(a.widthPx)
  })
  it('keeps the seam on the shoulders when leaning: the hem origin is cos(pitch) of the way down', () => {
    const p = pose({ down: at(1.3), hipZ: 0.15 })
    const t = garmentTransform(p, m)
    expect(t.rotationX).toBeCloseTo(p.fit.pitch)
    expect(t.rotationX).toBeGreaterThan(0)
    expect(-p.y - t.y).toBeCloseTo(SEAM_HEIGHT * t.scale.y * Math.cos(p.fit.pitch) * Math.cos(p.roll))
  })
  it('lands the hem below the hips for the size, short, average or long in the torso', () => {
    for (const ratio of [1.1, 1.3, 1.52]) {
      const p = pose({ down: at(ratio) })
      const hem = -garmentTransform(p, m).y
      expect(hem - p.fit.hipY!).toBeGreaterThan(15)
      expect(hem - p.fit.hipY!).toBeLessThan(50)
    }
  })
})
