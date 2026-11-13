import { describe, expect, it } from 'vitest'
import { ARMS_DOWN, SLEEVE_MAX, SLEEVE_MIN } from '../../src/utils/arArms'
import { recommendSize } from '../../src/utils/arFit'
import { garmentScale, GARMENT_BASE, SEAM_HEIGHT } from '../../src/utils/arGarment'
import {
  coverMap,
  FACING_FRAMES,
  FIT_EASE,
  facingVote,
  garmentTransform,
  maskTransform,
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
  const sizeOf = (chest: number, length = 70) => garmentScale({ chestWidthCm: chest, totalLengthCm: length })
  const [xs, m, l] = [sizeOf(46), sizeOf(52), sizeOf(56)]

  it('draws the reference size with its shoulder seams at the joint span times FIT_EASE', () => {
    const pose = new PoseFollower().update(frame(), 0, VIEW, m.x).pose!
    expect(GARMENT_BASE.shoulder * garmentTransform(pose, m).scale.x).toBeCloseTo(128 * FIT_EASE)
    expect(garmentTransform(pose, m).widthPx).toBeCloseTo((128 * FIT_EASE * GARMENT_BASE.drawnWidth) / GARMENT_BASE.shoulder)
  })
  it('draws other sizes from the reference by the chart ratios at the same px per cm', () => {
    const pose = new PoseFollower().update(frame(), 0, VIEW, m.x).pose!
    const [tXs, tM, tL] = [xs, m, l].map((s) => garmentTransform(pose, s))
    expect(tL.widthPx / tM.widthPx).toBeCloseTo(56 / 52)
    expect(tXs.widthPx / tM.widthPx).toBeCloseTo(46 / 52)
    expect(tXs.widthPx).toBeLessThan(tM.widthPx)
  })
  it('draws the recommended size the same whatever shoulder width the profile says', () => {
    const sizes = [46, 52, 56].map((chest, i) => ({ size: ['XS', 'M', 'L'][i], values: { chestWidthCm: chest } }))
    const refX = (shoulders: number) => {
      const size = recommendSize({ chest: 100, shoulders }, sizes)
      return garmentScale(sizes.find((s) => s.size === size)!.values).x
    }
    const drawn = (shoulders: number) => garmentTransform(new PoseFollower().update(frame(), 0, VIEW, refX(shoulders)).pose!, m).widthPx
    expect(drawn(55)).toBeCloseTo(drawn(44))
    expect(drawn(55 * 1.2)).toBeCloseTo(drawn(44))
  })
  it('divides by cos(yaw) for a turned body, but never by less than cos 60 degrees', () => {
    const base = (yaw: number) => (100 / Math.max(Math.cos(yaw), RELIABLE_COS)) * FIT_EASE / (GARMENT_BASE.shoulder * 1.2)
    expect(pxPerCmOf(100, 0.3, 1.2)).toBeCloseTo(base(0.3))
    expect(pxPerCmOf(100, Math.PI / 3, 1.2)).toBeCloseTo(base(Math.PI / 3))
    expect(pxPerCmOf(100, Math.PI / 2, 1.2)).toBeCloseTo(pxPerCmOf(100, Math.PI / 3, 1.2))
    expect(pxPerCmOf(100, Math.PI, 1.2)).toBeCloseTo(pxPerCmOf(100, Math.PI / 3, 1.2))
  })
})

describe('yaw', () => {
  it('is zero facing the camera, and negative when the person\'s left shoulder turns away (the left of the mirrored screen)', () => {
    expect(new PoseFollower().update(frame(), 0, VIEW, 1).pose!.yaw).toBeCloseTo(0)
    expect(new PoseFollower().update(frame({ zL: 0.2, zR: -0.2 }), 0, VIEW, 1).pose!.yaw).toBeCloseTo(-Math.PI / 4)
    expect(new PoseFollower().update(frame({ zL: -0.1, zR: 0.1 }), 0, VIEW, 1).pose!.yaw).toBeCloseTo(Math.atan2(0.2, 0.4))
  })
  it('is not clamped: shoulders turned past 45 degrees read as they are', () => {
    expect(new PoseFollower().update(frame({ zL: -1, zR: 1 }), 0, VIEW, 1).pose!.yaw).toBeCloseTo(Math.atan2(2, 0.4))
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
    const front = f.update(turned(0), 0, VIEW, 1).pose!
    let prev = front.yaw
    let facing = front.facing
    let flips = 0
    let t = 0
    let last = front
    for (let deg = 2; deg <= 360; deg += 2) {
      t += STEP
      const out = f.update(turned(deg), t, VIEW, 1)
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
    let out = f.update(turned(180), 0, VIEW, 1)
    // The facing holds until it has been seen for FACING_FRAMES frames.
    for (let i = 1; i < FACING_FRAMES - 1; i++) out = f.update(turned(180), i * STEP, VIEW, 1)
    expect(out.pose!.facing).toBe('front')
    for (let i = FACING_FRAMES - 1; i < 60; i++) out = f.update(turned(180), i * STEP, VIEW, 1)
    expect(out.pose!.facing).toBe('back')
    expect(Math.abs(out.pose!.yaw)).toBeCloseTo(Math.PI, 1)
  })
  it('holds the placement and the size while side-on, and does not call it too far', () => {
    const f = new PoseFollower()
    const before = f.update(turned(40), 0, VIEW, 1)
    const side = f.update(turned(85), STEP, VIEW, 1)
    expect(side.state).toBe('tracking')
    expect(side.pose!.x).toBe(before.pose!.x)
    expect(side.pose!.y).toBe(before.pose!.y)
    expect(side.pose!.pxPerCm).toBe(before.pose!.pxPerCm)
    expect(side.pose!.yaw).toBeGreaterThan(before.pose!.yaw)
  })
  it('sizes from a first frame that is side-on without blowing up', () => {
    const out = new PoseFollower().update(turned(88), 0, VIEW, 1)
    expect(out.pose!.pxPerCm).toBeLessThan((128 / RELIABLE_COS) * FIT_EASE / GARMENT_BASE.shoulder + 1e-6)
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
      const a = new PoseFollower().update(fr, 0, VIEW, 1).pose!
      const b = new PoseFollower().update(swap(fr), 0, VIEW, 1).pose!
      expect(b).toEqual(a)
    }
  })
})

/**
 * A body `deg` round from facing the camera (0 front, 90 side-on, 180 back), seen the way MediaPipe is assumed to report it (see arTurn.ts):
 * landmark 11 always on the raw image's right as if the person faced the camera, and the yaw folded to +-90. 'saw' keeps the depth true to the
 * body, so the observed sign flips at side-on; 'tri' mirrors the depth as well (obs = 180 - actual), so the sign never flips. `jitter` is in
 * degrees on the yaw, and 5% on the span. By default the face reads 0.9 all round, as MediaPipe does even from behind.
 */
interface Look {
  fold?: 'saw' | 'tri'
  face?: number | ((deg: number) => number)
  jitter?: number
  rand?: () => number
  swap?: boolean
}
const rad = (deg: number) => (deg * Math.PI) / 180
function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function look(deg: number, { fold = 'saw', face = 0.9, jitter = 0, rand = Math.random, swap = false }: Look = {}): PoseFrame {
  const s = (((deg + 180) % 360) + 360) % 360 - 180
  const folded = fold === 'saw' ? ((s + 270) % 180) - 90 : (Math.asin(Math.sin(rad(s))) * 180) / Math.PI
  const noisy = rad(folded + (rand() * 2 - 1) * jitter)
  const [cos, sin] = [Math.cos(noisy), Math.sin(noisy)]
  const span = 1 + (jitter ? (rand() * 2 - 1) * 0.05 : 0)
  const image: Landmark[] = []
  image[LEFT_SHOULDER] = { x: 0.5 + 0.1 * cos * span, y: 0.4, visibility: 1 }
  image[RIGHT_SHOULDER] = { x: 0.5 - 0.1 * cos * span, y: 0.4, visibility: 1 }
  const v = typeof face === 'function' ? face(s) : face
  for (const i of [0, 2, 5]) image[i] = { x: 0.5, y: 0.3, visibility: v }
  const world = []
  world[LEFT_SHOULDER] = { x: 0.2 * cos, y: 0, z: -0.2 * sin }
  world[RIGHT_SHOULDER] = { x: -0.2 * cos, y: 0, z: 0.2 * sin }
  if (swap) {
    ;[image[LEFT_SHOULDER], image[RIGHT_SHOULDER]] = [image[RIGHT_SHOULDER], image[LEFT_SHOULDER]]
    ;[world[LEFT_SHOULDER], world[RIGHT_SHOULDER]] = [world[RIGHT_SHOULDER], world[LEFT_SHOULDER]]
  }
  return { image, world }
}

/** Feeds `ms` of frames from `t0`, the body at `path(ms since t0)` degrees, and records each change of facing with the angle it happened at. */
function drive(f: PoseFollower, t0: number, ms: number, path: (ms: number) => number, opts: Look = {}) {
  const frames: { deg: number; yaw: number; facing: string; source: string; reason: string | null }[] = []
  const flips: { deg: number; facing: string }[] = []
  let facing: string | null = null
  let t = t0
  for (let i = 0; i * STEP <= ms; i++) {
    t = t0 + i * STEP
    const deg = path(i * STEP)
    const pose = f.update(look(deg, opts), t, VIEW, 1).pose!
    frames.push({ deg, yaw: pose.yaw, facing: pose.facing, source: pose.cues.source, reason: pose.cues.reason })
    if (facing !== null && pose.facing !== facing) flips.push({ deg, facing: pose.facing })
    facing = pose.facing
  }
  return { frames, flips, end: t + STEP }
}
/** A constant turn of `rate` degrees a second from `from`, for `deg` degrees. */
const turnBy = (rate: number, deg: number, from = 0) => ({ path: (ms: number) => from + Math.min((rate * ms) / 1000, deg), ms: (deg / rate) * 1000 })
/** Out to `peak` degrees at `rate`, held for `hold` ms, and back the same way. */
const peekTo = (peak: number, outMs: number, hold: number) => ({
  path: (ms: number) => (ms < outMs ? (peak * ms) / outMs : ms < outMs + hold ? peak : Math.max(0, (peak * (2 * outMs + hold - ms)) / outMs)),
  ms: 2 * outMs + hold,
})

describe('facing from the turn', () => {
  for (const [name, rate] of [['slow', 45], ['fast', 180]] as const) {
    it(`flips to the back once the person is past side-on and to the front once they are round again, on a ${name} full turn`, () => {
      const { path, ms } = turnBy(rate, 360)
      for (const jitter of [0, 4]) {
        const { flips, frames } = drive(new PoseFollower(), 0, ms, path, { jitter, rand: seeded(7) })
        expect(flips.map((x) => x.facing)).toEqual(['back', 'front'])
        expect(flips[0].deg).toBeGreaterThan(85)
        expect(flips[0].deg).toBeLessThan(140)
        expect(flips[1].deg).toBeGreaterThan(265)
        expect(flips[1].deg).toBeLessThan(320)
        // The shirt's yaw follows the person all the way round: continuous, close to the real angle (a filter lag aside), no jump at a flip.
        frames.forEach((fr, i) => {
          expect(Number.isFinite(fr.yaw)).toBe(true)
          expect(Math.abs(fr.yaw - rad(fr.deg))).toBeLessThan(rad(45))
          if (i) expect(Math.abs(fr.yaw - frames[i - 1].yaw)).toBeLessThan(0.4)
        })
      }
    })
  }

  it('does not flip on a peek out to the side and back, either side, but a peek is not told from a turn once it stays out', () => {
    for (const sign of [1, -1]) {
      for (const [peak, outMs, hold] of [[80, 700, 0], [80, 500, 300], [60, 1000, 3000], [50, 300, 0]]) {
        const { path, ms } = peekTo(peak, outMs, hold)
        const { flips } = drive(new PoseFollower(), 0, ms + 500, (t) => sign * path(t))
        expect(flips).toEqual([])
      }
    }
  })

  it('flips on a pass-through even when it is fast, because the observed sign changes at side-on', () => {
    // 360 degrees a second: 12 degrees a frame.
    const { path, ms } = turnBy(360, 180)
    expect(drive(new PoseFollower(), 0, ms, path).flips.map((x) => x.facing)).toEqual(['back'])
  })

  it('reads a turn with the depth mirrored too only when it takes over 1.5 s; a faster one cannot be told from a peek', () => {
    const slow = turnBy(45, 360)
    expect(drive(new PoseFollower(), 0, slow.ms, slow.path, { fold: 'tri' }).flips.map((x) => x.facing)).toEqual(['back', 'front'])
    const fast = turnBy(180, 360)
    expect(drive(new PoseFollower(), 0, fast.ms, fast.path, { fold: 'tri' }).flips).toEqual([])
  })

  it('does not flicker: a person standing still, front or back, with jittery yaw and span never flips', () => {
    for (const deg of [0, 180]) {
      for (const seed of [1, 2, 3]) expect(drive(new PoseFollower(), 0, 20000, () => deg, { jitter: 5, rand: seeded(seed) }).flips).toEqual([])
    }
  })

  it('does not flicker: jitter on the yaw and span through a full turn still gives exactly two flips', () => {
    const { path, ms } = turnBy(60, 360)
    for (const seed of [11, 12, 13, 14, 15]) {
      expect(drive(new PoseFollower(), 0, ms, path, { jitter: 5, rand: seeded(seed) }).flips.map((x) => x.facing)).toEqual(['back', 'front'])
    }
  })

  it('does not flicker: a sign that chatters while the person hovers side-on flips at most once, and never back', () => {
    const rand = seeded(3)
    const hover = (t: number) => (t < 1000 ? (88 * t) / 1000 : t < 4000 ? 88 + (rand() < 0.5 ? 4 : 0) : Math.max(0, 88 - (88 * (t - 4000)) / 1000))
    const { flips } = drive(new PoseFollower(), 0, 5200, hover)
    expect(flips.length).toBeLessThanOrEqual(1)
  })

  it('gives the same flips when the shoulder labels are swapped', () => {
    const { path, ms } = turnBy(60, 360)
    const a = drive(new PoseFollower(), 0, ms, path, { jitter: 3, rand: seeded(5) }).flips
    const b = drive(new PoseFollower(), 0, ms, path, { jitter: 3, rand: seeded(5), swap: true }).flips
    expect(a).toHaveLength(2)
    expect(b).toEqual(a)
  })

  it('has the face cue agree rather than flip twice, when the face does hide while turned away', () => {
    const { path, ms } = turnBy(60, 360)
    const hidden = (s: number) => (Math.abs(s) > 100 ? 0.1 : 0.9)
    expect(drive(new PoseFollower(), 0, ms, path, { face: hidden }).flips.map((x) => x.facing)).toEqual(['back', 'front'])
  })

  it('stays on the back after the turn although MediaPipe still sees the face from behind', () => {
    const turn = turnBy(90, 180)
    const f = new PoseFollower()
    const first = drive(f, 0, turn.ms, turn.path)
    const held = drive(f, first.end, 4000, () => 180)
    expect(first.flips.map((x) => x.facing)).toEqual(['back'])
    expect(held.flips).toEqual([])
    expect(held.frames.at(-1)!.facing).toBe('back')
    expect(Math.abs(held.frames.at(-1)!.yaw - Math.PI)).toBeLessThan(0.1)
  })

  it('lets the customer flip it by hand, which holds until the next automatic flip', () => {
    const f = new PoseFollower()
    const still = drive(f, 0, 500, () => 0)
    expect(still.frames.at(-1)).toMatchObject({ facing: 'front', source: 'auto' })
    f.flip()
    const held = drive(f, still.end, 3000, () => 0)
    // It turns on smoothly, the way it was going (positive), to a half turn, not in one jump.
    expect(held.frames[0]).toMatchObject({ facing: 'back', source: 'manual', reason: 'manual' })
    held.frames.forEach((fr, i) => {
      if (i) expect(fr.yaw - held.frames[i - 1].yaw).toBeGreaterThanOrEqual(-1e-9)
      if (i) expect(fr.yaw - held.frames[i - 1].yaw).toBeLessThan(0.5)
    })
    expect(held.frames.at(-1)!.yaw).toBeCloseTo(Math.PI, 1)
    expect(held.frames.at(-1)).toMatchObject({ facing: 'back', source: 'manual' })
    // The next automatic flip (here the person turns round through side-on) takes it over.
    const turn = turnBy(60, 180)
    const after = drive(f, held.end, turn.ms, turn.path)
    expect(after.flips.map((x) => x.facing)).toEqual(['front'])
    expect(after.frames.at(-1)).toMatchObject({ facing: 'front', source: 'auto', reason: 'handover' })
    f.flip()
    expect(drive(f, after.end, 100, () => 180).frames[0]).toMatchObject({ facing: 'back', source: 'manual' })
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
    const facing = (v: number, n: number) => f.update(face(v), at(n), VIEW, 1).pose!.facing
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
    expect(new PoseFollower().update(frame({ l: { y: 0.45 } }), 0, VIEW, 1).pose!.roll).toBeGreaterThan(0)
    expect(new PoseFollower().update(frame({ r: { y: 0.45 } }), 0, VIEW, 1).pose!.roll).toBeLessThan(0)
    expect(new PoseFollower().update(frame(), 0, VIEW, 1).pose!.roll).toBeCloseTo(0)
  })
  it('averages the shoulder line with the torso axis when the hips are tracked', () => {
    const shoulderOnly = new PoseFollower().update(frame({ l: { y: 0.45 } }), 0, VIEW, 1).pose!.roll
    const upright = new PoseFollower().update(frame({ l: { y: 0.45 }, hips: { x: 0.5, y: 0.8 } }), 0, VIEW, 1).pose!.roll
    // Hips straight below the shoulder midpoint: the torso axis is 0, so the average is half the shoulder roll.
    expect(upright).toBeGreaterThan(0)
    expect(upright).toBeLessThan(shoulderOnly)
    // Hips shifted right in the raw image are shifted left on screen, under a body leaning right: negative.
    expect(new PoseFollower().update(frame({ hips: { x: 0.6, y: 0.8 } }), 0, VIEW, 1).pose!.roll).toBeLessThan(0)
  })
})

describe('sleeves', () => {
  it('read arms-down without elbow landmarks', () => {
    expect(new PoseFollower().update(frame(), 0, VIEW, 1).pose!.sleeves).toEqual([ARMS_DOWN, ARMS_DOWN])
  })
  it('read the lowest angle for elbows straight below the shoulders', () => {
    expect(new PoseFollower().update(frame({ elL: {}, elR: {} }), 0, VIEW, 1).pose!.sleeves).toEqual([SLEEVE_MIN, SLEEVE_MIN])
  })
  it('put the left of the mirrored screen first and the right second', () => {
    // The left elbow 0.1 further out in raw x (to the screen left) and level with the shoulder: straight out.
    const out = new PoseFollower().update(frame({ elL: { x: 0.7, y: 0.4 }, elR: {} }), 0, VIEW, 1).pose!.sleeves
    expect(out).toEqual([SLEEVE_MAX, SLEEVE_MIN])
    const mirror = new PoseFollower().update(frame({ elL: {}, elR: { x: 0.3, y: 0.4 } }), 0, VIEW, 1).pose!.sleeves
    expect(mirror).toEqual([SLEEVE_MIN, SLEEVE_MAX])
  })
  it('hold a lost elbow, then ease to arms-down, but snap with reduced motion', () => {
    const f = new PoseFollower()
    f.update(frame({ elL: { x: 0.7, y: 0.4 }, elR: { x: 0.3, y: 0.4 } }), 0, VIEW, 1)
    const lost = { elL: { visibility: 0.2 }, elR: { x: 0.3, y: 0.4 } }
    expect(f.update(frame(lost), 200, VIEW, 1).pose!.sleeves[0]).toBe(SLEEVE_MAX)
    const easing = f.update(frame(lost), 450, VIEW, 1).pose!.sleeves
    expect(easing[0]).toBeGreaterThan(ARMS_DOWN)
    expect(easing[0]).toBeLessThan(SLEEVE_MAX)
    expect(easing[1]).toBe(SLEEVE_MAX)
    expect(f.update(frame(lost), 700, VIEW, 1).pose!.sleeves[0]).toBe(ARMS_DOWN)
    const g = new PoseFollower()
    g.update(frame({ elL: { x: 0.7, y: 0.4 } }), 0, VIEW, 1)
    expect(g.update(frame({ elL: { visibility: 0.2 } }), 400, VIEW, 1, true).pose!.sleeves[0]).toBe(ARMS_DOWN)
  })
  it('are carried through the body-lost hold and start afresh once it is lost', () => {
    const f = new PoseFollower()
    const seen = f.update(frame({ elL: { x: 0.7, y: 0.4 } }), 0, VIEW, 1)
    expect(f.update(null, 200, VIEW, 1).pose!.sleeves).toEqual(seen.pose!.sleeves)
    expect(f.update(null, 450, VIEW, 1).pose!.sleeves).toEqual(seen.pose!.sleeves)
    f.update(null, 700, VIEW, 1)
    expect(f.update(frame(), 900, VIEW, 1).pose!.sleeves).toEqual([ARMS_DOWN, ARMS_DOWN])
  })
})

describe('garment transform', () => {
  const pose = new PoseFollower().update(frame(), 0, VIEW, 1).pose!
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
    const seen = f.update(frame(), 0, VIEW, 1)
    expect(seen.state).toBe('tracking')
    const held = f.update(null, 300, VIEW, 1)
    expect(held).toEqual({ ...seen })
    const fading = f.update(null, 450, VIEW, 1)
    expect(fading.opacity).toBeCloseTo(0.5)
    expect(fading.state).toBe('lost')
    expect(fading.pose).toEqual(seen.pose)
    const gone = f.update(null, 600, VIEW, 1)
    expect(gone).toMatchObject({ state: 'lost', opacity: 0, pose: null })
    // Smoothing was reset: the first sample after a loss is not dragged towards the old position.
    const back = f.update(frame({ l: { x: 0.8 }, r: { x: 0.6 } }), 900, VIEW, 1)
    expect(back.pose!.x).toBeCloseTo(640 * (1 - 0.7))
    expect(back.opacity).toBe(1)
  })
  it('is lost with nothing to hold when the body was never seen, and when a shoulder is not visible', () => {
    const f = new PoseFollower()
    expect(f.update(null, 0, VIEW, 1)).toMatchObject({ state: 'lost', opacity: 0, pose: null })
    expect(f.update(frame({ l: { visibility: 0.2 } }), STEP, VIEW, 1)).toMatchObject({ state: 'lost', pose: null })
  })
  it('recovers at full opacity when the body returns while fading', () => {
    const f = new PoseFollower()
    f.update(frame(), 0, VIEW, 1)
    expect(f.update(null, 450, VIEW, 1).opacity).toBeCloseTo(0.5)
    expect(f.update(frame(), 500, VIEW, 1)).toMatchObject({ state: 'tracking', opacity: 1 })
  })
  it('is too close above 60% of the width (the drawn shirt would not fit), or with a shoulder above the top edge', () => {
    expect(new PoseFollower().update(frame({ l: { x: 0.95 }, r: { x: 0.15 } }), 0, VIEW, 1).state).toBe('too-close')
    expect(new PoseFollower().update(frame({ l: { y: -0.05 }, r: { y: 0.1 } }), 0, VIEW, 1).state).toBe('too-close')
    expect(new PoseFollower().update(frame({ l: { x: 0.7 }, r: { x: 0.3 } }), 0, VIEW, 1).state).toBe('tracking')
    expect(new PoseFollower().update(frame({ l: { x: 0.8 }, r: { x: 0.25 } }), 0, VIEW, 1).state).toBe('tracking')
    expect(new PoseFollower().update(frame({ l: { x: 0.85 }, r: { x: 0.2 } }), 0, VIEW, 1).state).toBe('too-close')
  })
  it('is too far below 18% of the width', () => {
    expect(new PoseFollower().update(frame({ l: { x: 0.56 }, r: { x: 0.44 } }), 0, VIEW, 1).state).toBe('too-far')
    expect(new PoseFollower().update(frame({ l: { x: 0.6 }, r: { x: 0.4 } }), 0, VIEW, 1).state).toBe('tracking')
  })
})

describe('maskTransform', () => {
  const views: [string, View][] = [
    ['landscape video in a landscape box', { videoW: 640, videoH: 480, width: 400, height: 300 }],
    ['landscape video in a portrait box (crops the sides a lot)', { videoW: 640, videoH: 480, width: 300, height: 600 }],
    ['portrait video in a landscape box (crops top and bottom)', { videoW: 480, videoH: 640, width: 600, height: 300 }],
    ['portrait video in a portrait box', { videoW: 480, videoH: 640, width: 390, height: 500 }],
  ]
  for (const [name, view] of views)
    for (const ratio of [1, 1.5, 2])
      it(`maps a fragment back to the landmark it came from: ${name}, pixel ratio ${ratio}`, () => {
        const [drawW, drawH] = [view.width * ratio, view.height * ratio]
        const [su, sv, ou, ov] = maskTransform(view, drawW, drawH)
        for (const p of [{ x: 0.5, y: 0.5 }, { x: 0.1, y: 0.8 }, { x: 0.93, y: 0.07 }]) {
          // The landmark on the stage, then the fragment of the drawing buffer there (pixels, y up), then back to the mask.
          const stage = toStage(p, view)
          const [fx, fy] = [stage.x * ratio, drawH - stage.y * ratio]
          expect(su * fx + ou).toBeCloseTo(p.x, 6)
          expect(sv * fy + ov).toBeCloseTo(p.y, 6)
        }
      })
  it('mirrors: the left of the stage reads the right of the raw frame', () => {
    const [su, , ou] = maskTransform({ videoW: 640, videoH: 480, width: 640, height: 480 }, 640, 480)
    expect(ou).toBeCloseTo(1)
    expect(su * 640 + ou).toBeCloseTo(0)
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
  it('with the mask on, drops the mask first and only a second busy period lowers the rate', () => {
    const h = run(new RateHealth(false, true), 33, 25, 2.1)
    expect(h.mask).toBe(false)
    expect(h.rate).toBe(30)
    run(h, 33, 25, 1.5)
    expect(h.rate).toBe(30)
    run(h, 33, 25, 1)
    expect(h.rate).toBe(15)
    expect(h.slow).toBe(false)
  })
  it('with the mask on, drops the mask before it reports slow', () => {
    const h = run(new RateHealth(false, true), 200, 5, 4.5)
    expect(h.mask).toBe(false)
    expect(h.slow).toBe(false)
    run(h, 200, 5, 4)
    expect(h.slow).toBe(true)
  })
  it('keeps the mask while quick, and starts without one unless asked', () => {
    expect(run(new RateHealth(false, true), 33, 8, 6).mask).toBe(true)
    expect(new RateHealth(false).mask).toBe(false)
  })
  it('is not slow at 15 a second', () => {
    expect(run(new RateHealth(false), 66, 40, 10).slow).toBe(false)
  })
})
