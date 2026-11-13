import { describe, expect, it } from 'vitest'
import { ARMS_DOWN, SLEEVE_MAX, SLEEVE_MIN } from '../../src/utils/arArms'
import { garmentScale, GARMENT_BASE, SEAM_HEIGHT } from '../../src/utils/arGarment'
import {
  coverMap,
  DEFAULT_SHOULDER_CM,
  FACING_FRAMES,
  facingVote,
  garmentTransform,
  LANDMARK_TO_SEAM_CM,
  LEFT_ELBOW,
  LEFT_HIP,
  LEFT_SHOULDER,
  pairElbows,
  PoseFollower,
  pxPerCmOf,
  RateHealth,
  RELIABLE_COS,
  RIGHT_ELBOW,
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
  elL?: Partial<Landmark>
  elR?: Partial<Landmark>
  zL?: number
  zR?: number
}
/** A frame: the person's left shoulder (11) has the larger raw x, as in an unmirrored camera image. World shoulders are 0.4 m apart. */
function frame({ l, r, hips, elL, elR, zL = 0, zR = 0 }: Spec = {}): PoseFrame {
  const image: Landmark[] = []
  image[LEFT_SHOULDER] = { x: 0.6, y: 0.4, visibility: 1, ...l }
  image[RIGHT_SHOULDER] = { x: 0.4, y: 0.4, visibility: 1, ...r }
  if (elL) image[LEFT_ELBOW] = { x: 0.6, y: 0.55, visibility: 1, ...elL }
  if (elR) image[RIGHT_ELBOW] = { x: 0.4, y: 0.55, visibility: 1, ...elR }
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
  it('divides by cos(yaw) for a turned body, but never by less than cos 60 degrees', () => {
    expect(pxPerCmOf(100, 0.3, 42)).toBeCloseTo(100 / Math.cos(0.3) / (SHOULDER_JOINT_K * 42))
    expect(pxPerCmOf(100, Math.PI / 3, 42)).toBeCloseTo(100 / RELIABLE_COS / (SHOULDER_JOINT_K * 42))
    expect(pxPerCmOf(100, Math.PI / 2, 42)).toBeCloseTo(pxPerCmOf(100, Math.PI / 3, 42))
    expect(pxPerCmOf(100, Math.PI, 42)).toBeCloseTo(pxPerCmOf(100, Math.PI / 3, 42))
  })
})

describe('yaw', () => {
  it('is zero facing the camera, and negative when the person\'s left shoulder turns away (the left of the mirrored screen)', () => {
    expect(new PoseFollower().update(frame(), 0, VIEW, 44).pose!.yaw).toBeCloseTo(0)
    expect(new PoseFollower().update(frame({ zL: 0.2, zR: -0.2 }), 0, VIEW, 44).pose!.yaw).toBeCloseTo(-Math.PI / 4)
    expect(new PoseFollower().update(frame({ zL: -0.1, zR: 0.1 }), 0, VIEW, 44).pose!.yaw).toBeCloseTo(Math.atan2(0.2, 0.4))
  })
  it('is not clamped: shoulders turned past 45 degrees read as they are', () => {
    expect(new PoseFollower().update(frame({ zL: -1, zR: 1 }), 0, VIEW, 44).pose!.yaw).toBeCloseTo(Math.atan2(2, 0.4))
  })
})

/** A person `deg` degrees round from facing the camera (labels true to the body: their left shoulder is 11), 0.4 m between the shoulders. */
function turned(deg: number, face = deg < 90 || deg > 270 ? 1 : 0.1): PoseFrame {
  const a = (deg * Math.PI) / 180
  const image: Landmark[] = []
  image[LEFT_SHOULDER] = { x: 0.5 + 0.1 * Math.cos(a), y: 0.4, visibility: 1 }
  image[RIGHT_SHOULDER] = { x: 0.5 - 0.1 * Math.cos(a), y: 0.4, visibility: 1 }
  for (const i of [0, 2, 5]) image[i] = { x: 0.5, y: 0.3, visibility: face }
  const world = []
  world[LEFT_SHOULDER] = { x: 0.2 * Math.cos(a), y: 0, z: -0.2 * Math.sin(a) }
  world[RIGHT_SHOULDER] = { x: -0.2 * Math.cos(a), y: 0, z: 0.2 * Math.sin(a) }
  return { image, world }
}

describe('a full turn', () => {
  it('keeps the yaw finite and continuous, the scale within 0.5x to 1.5x of the front one, and flips the facing once each way', () => {
    const f = new PoseFollower()
    const front = f.update(turned(0), 0, VIEW, 44).pose!
    let prev = front.yaw
    let facing = front.facing
    let flips = 0
    let t = 0
    let last = front
    for (let deg = 2; deg <= 360; deg += 2) {
      t += STEP
      const out = f.update(turned(deg), t, VIEW, 44)
      const pose = out.pose!
      last = pose
      for (const v of [pose.x, pose.y, pose.roll, pose.yaw, pose.pxPerCm, ...pose.sleeves]) expect(Number.isFinite(v)).toBe(true)
      expect(pose.pxPerCm / front.pxPerCm).toBeGreaterThan(0.5)
      expect(pose.pxPerCm / front.pxPerCm).toBeLessThan(1.5)
      expect(Math.abs(pose.yaw - prev)).toBeLessThan(Math.PI)
      expect(out.state).toBe('tracking')
      prev = pose.yaw
      if (pose.facing !== facing) flips++
      facing = pose.facing
    }
    expect(flips).toBe(2)
    expect(last.facing).toBe('front')
  })
  it('turns the shirt to its back once the person faces away, with the yaw a half turn further', () => {
    const f = new PoseFollower()
    let out = f.update(turned(180), 0, VIEW, 44)
    // The facing holds until it has been seen for FACING_FRAMES frames.
    for (let i = 1; i < FACING_FRAMES - 1; i++) out = f.update(turned(180), i * STEP, VIEW, 44)
    expect(out.pose!.facing).toBe('front')
    for (let i = FACING_FRAMES - 1; i < 60; i++) out = f.update(turned(180), i * STEP, VIEW, 44)
    expect(out.pose!.facing).toBe('back')
    expect(Math.abs(out.pose!.yaw)).toBeCloseTo(Math.PI, 1)
  })
  it('holds the placement and the size while side-on, and does not call it too far', () => {
    const f = new PoseFollower()
    const before = f.update(turned(40), 0, VIEW, 44)
    const side = f.update(turned(85), STEP, VIEW, 44)
    expect(side.state).toBe('tracking')
    expect(side.pose!.x).toBe(before.pose!.x)
    expect(side.pose!.y).toBe(before.pose!.y)
    expect(side.pose!.pxPerCm).toBe(before.pose!.pxPerCm)
    expect(side.pose!.yaw).toBeGreaterThan(before.pose!.yaw)
  })
  it('sizes from a first frame that is side-on without blowing up', () => {
    const out = new PoseFollower().update(turned(88), 0, VIEW, 44)
    expect(out.pose!.pxPerCm).toBeLessThan(128 / RELIABLE_COS / (SHOULDER_JOINT_K * 44) + 1e-6)
  })
})

describe('label-swapped shoulders', () => {
  /** The same body with landmarks 11 and 12 exchanged everywhere. */
  const swap = (fr: PoseFrame): PoseFrame => {
    const image = [...fr.image]
    const world = [...fr.world]
    ;[image[LEFT_SHOULDER], image[RIGHT_SHOULDER]] = [image[RIGHT_SHOULDER], image[LEFT_SHOULDER]]
    ;[world[LEFT_SHOULDER], world[RIGHT_SHOULDER]] = [world[RIGHT_SHOULDER], world[LEFT_SHOULDER]]
    return { image, world }
  }
  it('give the same roll, position, size and yaw', () => {
    for (const fr of [frame({ l: { y: 0.45 }, hips: { x: 0.5, y: 0.8 } }), turned(30)]) {
      const a = new PoseFollower().update(fr, 0, VIEW, 44).pose!
      const b = new PoseFollower().update(swap(fr), 0, VIEW, 44).pose!
      expect(b).toEqual(a)
    }
  })
})

describe('facing from the face landmarks', () => {
  const face = (v: number | undefined): PoseFrame => {
    const fr = frame()
    for (const i of [0, 2, 5]) fr.image[i] = { x: 0.5, y: 0.3, visibility: v }
    return fr
  }
  it('is front when nose and eyes are visible, back when all are nearly gone, and no vote between or without landmarks', () => {
    expect(facingVote(face(0.5))).toBe('front')
    expect(facingVote(face(0.29))).toBe('back')
    expect(facingVote(face(0.4))).toBeNull()
    expect(facingVote(face(undefined))).toBeNull()
    expect(facingVote(frame())).toBeNull()
  })
  it('flips only after FACING_FRAMES agreeing frames in a row, and a doubtful frame starts the count over', () => {
    const f = new PoseFollower()
    const at = (n: number) => n * STEP
    const facing = (v: number, n: number) => f.update(face(v), at(n), VIEW, 44).pose!.facing
    expect(facing(1, 0)).toBe('front')
    for (let i = 1; i < FACING_FRAMES; i++) expect(facing(0, i)).toBe('front')
    // A front frame in the middle starts the count over.
    facing(1, 10)
    for (let i = 1; i < FACING_FRAMES; i++) expect(facing(0, 10 + i)).toBe('front')
    // So does a doubtful one.
    expect(facing(0.4, 20)).toBe('front')
    for (let i = 1; i < FACING_FRAMES; i++) expect(facing(0, 20 + i)).toBe('front')
    expect(facing(0, 20 + FACING_FRAMES)).toBe('back')
    // A doubtful frame keeps the back view.
    expect(facing(0.4, 40)).toBe('back')
  })
})

describe('elbows paired with the nearer shoulder', () => {
  const left = { x: 400, y: 200 }
  const right = { x: 240, y: 200 }
  // Raw image x of a stage x, 640 wide (mirrored).
  const at = (stageX: number): Landmark => ({ x: 1 - stageX / 640, y: 0.55, visibility: 1 })

  it('ignore the labels: the elbow on the left of the screen goes to the left sleeve either way', () => {
    const l = at(420)
    const r = at(220)
    expect(pairElbows([l, r], left, right, VIEW)).toEqual([l, r])
    expect(pairElbows([r, l], left, right, VIEW)).toEqual([l, r])
  })
  it('skip an elbow that is not visible, and drop the farther of two nearest the same shoulder', () => {
    const a = at(420)
    const b = at(395)
    expect(pairElbows([{ ...a, visibility: 0.2 }, undefined], left, right, VIEW)).toEqual([null, null])
    expect(pairElbows([a, b], left, right, VIEW)).toEqual([b, null])
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

describe('sleeves', () => {
  it('read arms-down without elbow landmarks', () => {
    expect(new PoseFollower().update(frame(), 0, VIEW, 44).pose!.sleeves).toEqual([ARMS_DOWN, ARMS_DOWN])
  })
  it('read the lowest angle for elbows straight below the shoulders', () => {
    expect(new PoseFollower().update(frame({ elL: {}, elR: {} }), 0, VIEW, 44).pose!.sleeves).toEqual([SLEEVE_MIN, SLEEVE_MIN])
  })
  it('put the left of the mirrored screen first and the right second', () => {
    // The left elbow 0.1 further out in raw x (to the screen left) and level with the shoulder: straight out.
    const out = new PoseFollower().update(frame({ elL: { x: 0.7, y: 0.4 }, elR: {} }), 0, VIEW, 44).pose!.sleeves
    expect(out).toEqual([SLEEVE_MAX, SLEEVE_MIN])
    const mirror = new PoseFollower().update(frame({ elL: {}, elR: { x: 0.3, y: 0.4 } }), 0, VIEW, 44).pose!.sleeves
    expect(mirror).toEqual([SLEEVE_MIN, SLEEVE_MAX])
  })
  it('hold a lost elbow, then ease to arms-down, but snap with reduced motion', () => {
    const f = new PoseFollower()
    f.update(frame({ elL: { x: 0.7, y: 0.4 }, elR: { x: 0.3, y: 0.4 } }), 0, VIEW, 44)
    const lost = { elL: { visibility: 0.2 }, elR: { x: 0.3, y: 0.4 } }
    expect(f.update(frame(lost), 200, VIEW, 44).pose!.sleeves[0]).toBe(SLEEVE_MAX)
    const easing = f.update(frame(lost), 450, VIEW, 44).pose!.sleeves
    expect(easing[0]).toBeGreaterThan(ARMS_DOWN)
    expect(easing[0]).toBeLessThan(SLEEVE_MAX)
    expect(easing[1]).toBe(SLEEVE_MAX)
    expect(f.update(frame(lost), 700, VIEW, 44).pose!.sleeves[0]).toBe(ARMS_DOWN)
    const g = new PoseFollower()
    g.update(frame({ elL: { x: 0.7, y: 0.4 } }), 0, VIEW, 44)
    expect(g.update(frame({ elL: { visibility: 0.2 } }), 400, VIEW, 44, true).pose!.sleeves[0]).toBe(ARMS_DOWN)
  })
  it('are carried through the body-lost hold and start afresh once it is lost', () => {
    const f = new PoseFollower()
    const seen = f.update(frame({ elL: { x: 0.7, y: 0.4 } }), 0, VIEW, 44)
    expect(f.update(null, 200, VIEW, 44).pose!.sleeves).toEqual(seen.pose!.sleeves)
    expect(f.update(null, 450, VIEW, 44).pose!.sleeves).toEqual(seen.pose!.sleeves)
    f.update(null, 700, VIEW, 44)
    expect(f.update(frame(), 900, VIEW, 44).pose!.sleeves).toEqual([ARMS_DOWN, ARMS_DOWN])
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
