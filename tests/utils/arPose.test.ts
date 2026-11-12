import { describe, expect, it } from 'vitest'
import { garmentScale, GARMENT_BASE, SEAM_HEIGHT } from '../../src/utils/arGarment'
import {
  clampYaw,
  coverMap,
  DEFAULT_SHOULDER_CM,
  garmentTransform,
  LANDMARK_TO_SEAM_CM,
  LEFT_HIP,
  LEFT_SHOULDER,
  MAX_YAW,
  PoseFollower,
  pxPerCmOf,
  RateHealth,
  RIGHT_HIP,
  RIGHT_SHOULDER,
  shouldersTracked,
  SHOULDER_JOINT_K,
  toStage,
  type Landmark,
  type PoseFrame,
  type View,
} from '../../src/utils/arPose'

const VIEW: View = { videoW: 640, videoH: 480, width: 640, height: 480 }
const STEP = 1000 / 30

interface Spec {
  l?: Partial<Landmark>
  r?: Partial<Landmark>
  hips?: { x: number; y: number }
  zL?: number
  zR?: number
}
/** A frame: the person's left shoulder (11) has the larger raw x, as in an unmirrored camera image. World shoulders are 0.4 m apart. */
function frame({ l, r, hips, zL = 0, zR = 0 }: Spec = {}): PoseFrame {
  const image: Landmark[] = []
  image[LEFT_SHOULDER] = { x: 0.6, y: 0.4, visibility: 1, ...l }
  image[RIGHT_SHOULDER] = { x: 0.4, y: 0.4, visibility: 1, ...r }
  if (hips) {
    image[LEFT_HIP] = { x: hips.x + 0.08, y: hips.y, visibility: 1 }
    image[RIGHT_HIP] = { x: hips.x - 0.08, y: hips.y, visibility: 1 }
  }
  const world = []
  world[LEFT_SHOULDER] = { x: 0.2, y: 0, z: zL }
  world[RIGHT_SHOULDER] = { x: -0.2, y: 0, z: zR }
  return { image, world }
}

describe('cover mapping and mirroring', () => {
  it('crops the top and bottom of a 4:3 feed in a wider box', () => {
    const { scale, offsetX, offsetY } = coverMap({ videoW: 640, videoH: 480, width: 800, height: 400 })
    expect(scale).toBeCloseTo(1.25)
    expect(offsetX).toBeCloseTo(0)
    expect(offsetY).toBeCloseTo(-100)
  })
  it('crops the sides of a 4:3 feed in a portrait box', () => {
    const { scale, offsetX, offsetY } = coverMap({ videoW: 640, videoH: 480, width: 300, height: 500 })
    expect(scale).toBeCloseTo(500 / 480)
    expect(offsetX).toBeCloseTo((300 - 640 * (500 / 480)) / 2)
    expect(offsetY).toBeCloseTo(0)
  })
  it('mirrors x so a landmark on the right of the raw image lands on the left of the canvas', () => {
    expect(toStage({ x: 0.3, y: 0.5 }, VIEW)).toEqual({ x: 448, y: 240 })
    const portrait: View = { videoW: 640, videoH: 480, width: 300, height: 500 }
    const { scale, offsetX } = coverMap(portrait)
    expect(toStage({ x: 0.25, y: 1 }, portrait)).toEqual({ x: 0.75 * 640 * scale + offsetX, y: 500 })
  })
})

describe('tracked shoulders', () => {
  it('needs both shoulders at 0.5 visibility or more', () => {
    expect(shouldersTracked(frame())).toBe(true)
    expect(shouldersTracked(frame({ l: { visibility: 0.5 } }))).toBe(true)
    expect(shouldersTracked(frame({ r: { visibility: 0.49 } }))).toBe(false)
    expect(shouldersTracked({ image: [], world: [] })).toBe(false)
  })
})

describe('pixels per cm', () => {
  it('is the shoulder span over the joint share of the profile shoulder width', () => {
    const out = new PoseFollower().update(frame(), 0, VIEW, 44)
    expect(out.pose!.pxPerCm).toBeCloseTo(128 / (SHOULDER_JOINT_K * 44))
    expect(out.averageBuild).toBe(false)
  })
  it('assumes an average shoulder width without a profile and says so', () => {
    const out = new PoseFollower().update(frame(), 0, VIEW)
    expect(out.pose!.pxPerCm).toBeCloseTo(128 / (SHOULDER_JOINT_K * DEFAULT_SHOULDER_CM))
    expect(out.averageBuild).toBe(true)
  })
  it('divides by cos(yaw) for a turned body', () => {
    // Past 45 degrees the correction stops at cos(45), so a body turned side-on does not blow the scale up.
    expect(pxPerCmOf(100, Math.PI / 3, 42)).toBeCloseTo(pxPerCmOf(100, MAX_YAW, 42))
    expect(pxPerCmOf(100, MAX_YAW, 42)).toBeCloseTo(100 / Math.cos(MAX_YAW) / (SHOULDER_JOINT_K * 42))
    expect(pxPerCmOf(100, 0.3, 42)).toBeCloseTo(100 / Math.cos(0.3) / (SHOULDER_JOINT_K * 42))
  })
})

describe('yaw', () => {
  it('is zero facing the camera, and negative when the person\'s left shoulder turns away (the left of the mirrored screen)', () => {
    expect(new PoseFollower().update(frame(), 0, VIEW, 44).pose!.yaw).toBeCloseTo(0)
    expect(new PoseFollower().update(frame({ zL: 0.2, zR: -0.2 }), 0, VIEW, 44).pose!.yaw).toBeCloseTo(-Math.PI / 4)
    expect(new PoseFollower().update(frame({ zL: -0.1, zR: 0.1 }), 0, VIEW, 44).pose!.yaw).toBeCloseTo(Math.atan2(0.2, 0.4))
  })
  it('is clamped to 45 degrees', () => {
    expect(clampYaw(2)).toBe(MAX_YAW)
    expect(clampYaw(-2)).toBe(-MAX_YAW)
    expect(new PoseFollower().update(frame({ zL: -1, zR: 1 }), 0, VIEW, 44).pose!.yaw).toBeCloseTo(MAX_YAW)
  })
})

describe('roll', () => {
  it('is positive when the shoulder on the left of the screen drops', () => {
    // The person's left shoulder (raw x larger) is on the left of the mirrored canvas.
    expect(new PoseFollower().update(frame({ l: { y: 0.45 } }), 0, VIEW, 44).pose!.roll).toBeGreaterThan(0)
    expect(new PoseFollower().update(frame({ r: { y: 0.45 } }), 0, VIEW, 44).pose!.roll).toBeLessThan(0)
    expect(new PoseFollower().update(frame(), 0, VIEW, 44).pose!.roll).toBeCloseTo(0)
  })
  it('averages the shoulder line with the torso axis when the hips are tracked', () => {
    const shoulderOnly = new PoseFollower().update(frame({ l: { y: 0.45 } }), 0, VIEW, 44).pose!.roll
    const upright = new PoseFollower().update(frame({ l: { y: 0.45 }, hips: { x: 0.5, y: 0.8 } }), 0, VIEW, 44).pose!.roll
    // Hips straight below the shoulder midpoint: the torso axis is 0, so the average is half the shoulder roll.
    expect(upright).toBeGreaterThan(0)
    expect(upright).toBeLessThan(shoulderOnly)
    // Hips shifted right in the raw image are shifted left on screen, under a body leaning right: negative.
    expect(new PoseFollower().update(frame({ hips: { x: 0.6, y: 0.8 } }), 0, VIEW, 44).pose!.roll).toBeLessThan(0)
  })
})

describe('garment transform', () => {
  const pose = new PoseFollower().update(frame(), 0, VIEW, 44).pose!
  const sizeOf = (chest: number, length: number) => garmentScale({ chestWidthCm: chest, totalLengthCm: length })

  it('puts the seam point at the shoulder midpoint raised by 4 cm', () => {
    expect(pose.x).toBeCloseTo(320)
    expect(pose.y).toBeCloseTo(192 - LANDMARK_TO_SEAM_CM * pose.pxPerCm)
  })
  it('draws a bigger size wider at the same px per cm, by the chart ratio', () => {
    const m = garmentTransform(pose, sizeOf(52, 70))
    const l = garmentTransform(pose, sizeOf(56, 72))
    expect(l.widthPx / m.widthPx).toBeCloseTo(56 / 52)
    expect(l.scale.x / pose.pxPerCm).toBeCloseTo(56 / GARMENT_BASE.chest)
  })
  it('lets the hem fall in proportion to the size length', () => {
    const t = garmentTransform(pose, sizeOf(52, 70))
    const seamY = -pose.y
    // The mesh origin is the hem: SEAM_HEIGHT of model, scaled by the length, below the seam.
    expect(seamY - t.y).toBeCloseTo(SEAM_HEIGHT * (70 / GARMENT_BASE.length) * pose.pxPerCm)
  })
  it('keeps the shoulder point on the seam when rolled', () => {
    const rolled = { ...pose, roll: 0.3 }
    const t = garmentTransform(rolled, sizeOf(52, 70))
    const drop = SEAM_HEIGHT * t.scale.y
    // The model point (0, SEAM_HEIGHT) rotated by the roll about the hem lands back on the seam.
    expect(t.x - drop * Math.sin(0.3)).toBeCloseTo(rolled.x)
    expect(t.y + drop * Math.cos(0.3)).toBeCloseTo(-rolled.y)
    expect(t.rotationZ).toBe(0.3)
  })
})

describe('lost, too close and too far', () => {
  it('holds the pose for 300 ms, fades over the next 300 ms, then is lost and starts afresh', () => {
    const f = new PoseFollower()
    const seen = f.update(frame(), 0, VIEW, 44)
    expect(seen.state).toBe('tracking')
    const held = f.update(null, 300, VIEW, 44)
    expect(held).toEqual({ ...seen })
    const fading = f.update(null, 450, VIEW, 44)
    expect(fading.opacity).toBeCloseTo(0.5)
    expect(fading.state).toBe('lost')
    expect(fading.pose).toEqual(seen.pose)
    const gone = f.update(null, 600, VIEW, 44)
    expect(gone).toMatchObject({ state: 'lost', opacity: 0, pose: null })
    // Smoothing was reset: the first sample after a loss is not dragged towards the old position.
    const back = f.update(frame({ l: { x: 0.8 }, r: { x: 0.6 } }), 900, VIEW, 44)
    expect(back.pose!.x).toBeCloseTo(640 * (1 - 0.7))
    expect(back.opacity).toBe(1)
  })
  it('is lost with nothing to hold when the body was never seen, and when a shoulder is not visible', () => {
    const f = new PoseFollower()
    expect(f.update(null, 0, VIEW, 44)).toMatchObject({ state: 'lost', opacity: 0, pose: null })
    expect(f.update(frame({ l: { visibility: 0.2 } }), STEP, VIEW, 44)).toMatchObject({ state: 'lost', pose: null })
  })
  it('recovers at full opacity when the body returns while fading', () => {
    const f = new PoseFollower()
    f.update(frame(), 0, VIEW, 44)
    expect(f.update(null, 450, VIEW, 44).opacity).toBeCloseTo(0.5)
    expect(f.update(frame(), 500, VIEW, 44)).toMatchObject({ state: 'tracking', opacity: 1 })
  })
  it('is too close above 52% of the width (the drawn shirt would not fit), or with a shoulder above the top edge', () => {
    expect(new PoseFollower().update(frame({ l: { x: 0.95 }, r: { x: 0.15 } }), 0, VIEW, 44).state).toBe('too-close')
    expect(new PoseFollower().update(frame({ l: { y: -0.05 }, r: { y: 0.1 } }), 0, VIEW, 44).state).toBe('too-close')
    expect(new PoseFollower().update(frame({ l: { x: 0.7 }, r: { x: 0.3 } }), 0, VIEW, 44).state).toBe('tracking')
    expect(new PoseFollower().update(frame({ l: { x: 0.8 }, r: { x: 0.25 } }), 0, VIEW, 44).state).toBe('too-close')
  })
  it('is too far below 18% of the width', () => {
    expect(new PoseFollower().update(frame({ l: { x: 0.56 }, r: { x: 0.44 } }), 0, VIEW, 44).state).toBe('too-far')
    expect(new PoseFollower().update(frame({ l: { x: 0.6 }, r: { x: 0.4 } }), 0, VIEW, 44).state).toBe('tracking')
  })
})

describe('RateHealth', () => {
  const clock = new WeakMap<RateHealth, number>()
  /** Detections every `gap` ms for `seconds` more, each taking `detectMs`. */
  function run(health: RateHealth, gap: number, detectMs: number, seconds: number) {
    const end = (clock.get(health) ?? 0) + seconds * 1000
    for (let t = clock.get(health) ?? 0; t <= end; t += gap) {
      health.record(t, detectMs)
      clock.set(health, t + gap)
    }
    return health
  }

  it('starts at 30 a second, and at 20 on a coarse pointer', () => {
    expect(new RateHealth(false).intervalMs).toBeCloseTo(1000 / 30)
    expect(new RateHealth(true).intervalMs).toBe(50)
  })
  it('stays put while detecting is quick and keeping up', () => {
    const h = run(new RateHealth(false), 33, 8, 6)
    expect(h.rate).toBe(30)
    expect(h.slow).toBe(false)
  })
  it('drops to 15 a second once the median detect time is over 60% of the frame budget for 2 s', () => {
    const h = run(new RateHealth(false), 33, 25, 1.9)
    expect(h.rate).toBe(30)
    run(h, 33, 25, 6)
    expect(h.rate).toBe(15)
    expect(h.slow).toBe(false)
  })
  it('does not drop for a single slow detection', () => {
    const h = new RateHealth(false)
    run(h, 33, 8, 3)
    h.record(clock.get(h)!, 90)
    expect(h.rate).toBe(30)
  })
  it('reports slow after 3 s under 10 detections a second', () => {
    const h = run(new RateHealth(false), 200, 150, 3.5)
    expect(h.slow).toBe(false)
    run(h, 200, 150, 12)
    expect(h.slow).toBe(true)
  })
  it('is not slow at 15 a second', () => {
    expect(run(new RateHealth(false), 66, 40, 10).slow).toBe(false)
  })
})
