import { describe, expect, it } from 'vitest'
import { jitterPx, lagMs, speedPxS, type Sample } from '../../src/utils/arMeter'
import { faceEllipse } from '../../src/utils/arOcclude'
import { OneEuro } from '../../src/utils/oneEuro'
import { LANDMARK_FILTER, PoseFollower, toStage, type PoseFrame } from '../../src/utils/arPose'
import { gaussian, personFrame, scaleStepMs, seeded, simulate, STEP_MS, stepMs, still, stillSd, VIEW, walkJitter, walkLag } from '../shared/arSynth'

// Smoothing of the AR try-on: the visibility hysteresis, how a landmark that comes back eases in, the face landmarks' filter, the jitter and lag
// of the whole chain on synthetic people, and the numbers the ?debug=ar meter shows.

/** A landmark that comes back this far away may move at most this share of the distance on its first frame (a One Euro frame at 0.5 Hz is about 10%). */
const FIRST_FRAME = 0.2

const run = (visibility: (i: number) => Record<number, number>, count: number, read: (f: PoseFollower, frame: PoseFrame, i: number) => unknown) => {
  const f = new PoseFollower()
  return Array.from({ length: count }, (_, i) => read(f, personFrame(still(), undefined, visibility(i)), i))
}
const forearm = (f: PoseFollower, frame: PoseFrame, i: number) => f.update(frame, i * STEP_MS, VIEW, 1).pose!.occluders.forearms[0]

describe('visibility hysteresis', () => {
  it('comes on at 0.55 and goes off below 0.45, so a landmark hovering around 0.5 does not toggle', () => {
    const elbow = [0.52, 0.56, 0.5, 0.47, 0.52, 0.44, 0.5, 0.52, 0.56]
    const present = run((i) => ({ 13: elbow[i] }), elbow.length, (f, frame, i) => forearm(f, frame, i) !== null)
    expect(present).toEqual([false, true, true, true, true, false, false, false, true])
  })

  it('judges the wrist that cuts the shirt the same way around 0.7 (on from 0.75, off below 0.65)', () => {
    const wrist = [0.7, 0.8, 0.7, 0.66, 0.64, 0.7, 0.76]
    const cut = run((i) => ({ 15: wrist[i] }), wrist.length, (f, frame, i) => forearm(f, frame, i)?.cut)
    expect(cut).toEqual([false, true, true, true, false, false, true])
  })

  it('keeps following a shoulder down to 0.45, then holds the last pose', () => {
    const f = new PoseFollower()
    const at = (x: number, v: number, i: number) => f.update(personFrame({ ...still(), x }, undefined, { 11: v }), i * STEP_MS, VIEW, 1)
    const first = at(320, 1, 0)
    const [a, b, held] = [at(340, 0.5, 1), at(360, 0.47, 2), at(380, 0.44, 3)]
    expect(a.pose!.x).toBeGreaterThan(first.pose!.x)
    expect(b.pose!.x).toBeGreaterThan(a.pose!.x)
    expect(held).toBe(b)
  })

  it('keeps the chin ellipse through a mouth corner that dips to 0.47 and drops it below 0.45', () => {
    const mouth = [1, 0.5, 0.47, 0.44, 0.5, 0.56]
    const chin = run((i) => ({ 9: mouth[i] }), mouth.length, (f, frame, i) => f.update(frame, i * STEP_MS, VIEW, 1).pose!.occluders.face !== null)
    expect(chin).toEqual([true, true, true, false, false, true])
  })

  it('does not step the roll when the hips go (the torso tilt leaves the roll over about half a second)', () => {
    const f = new PoseFollower()
    const rolls: number[] = []
    for (let i = 0; i < 90; i++) {
      const frame = personFrame(still(), undefined, { 23: i < 30 ? 1 : 0.2, 24: i < 30 ? 1 : 0.2 })
      // A torso tilted away from the shoulders' line: the hips 64 px to one side, so the roll is half of about 18 degrees.
      frame.image[23].x += 0.1
      frame.image[24].x += 0.1
      rolls.push((f.update(frame, i * STEP_MS, VIEW, 1).pose!.roll * 180) / Math.PI)
    }
    expect(Math.abs(rolls[29])).toBeGreaterThan(8)
    expect(Math.max(...rolls.slice(30).map((r, i) => Math.abs(r - rolls[29 + i])))).toBeLessThan(1)
    expect(Math.abs(rolls[89])).toBeLessThan(0.5)
  })

  it('counts the landmarks under the threshold for the overlay', () => {
    const pose = new PoseFollower().update(personFrame(still(), undefined, { 23: 0.2, 24: 0.2, 15: 0.3 }), 0, VIEW, 1).pose!
    expect(pose.cues.held).toBe(3)
  })
})

describe('a landmark that returns', () => {
  it('eases in: the first sample after a gap moves a fraction of the way, then converges without overshoot', () => {
    const f = new OneEuro(LANDMARK_FILTER)
    for (let i = 0; i < 30; i++) f.filter(0, i * STEP_MS)
    const t0 = 30 * STEP_MS + 1000
    let y = f.filter(200, t0)
    expect(y).toBeGreaterThan(0)
    expect(y).toBeLessThanOrEqual(FIRST_FRAME * 200)
    for (let i = 1; i <= 30; i++) {
      const next = f.filter(200, t0 + i * STEP_MS)
      expect(next).toBeGreaterThanOrEqual(y)
      expect(next).toBeLessThanOrEqual(200)
      y = next
    }
    expect(200 - y).toBeLessThan(10)
  })

  it('does not treat a few missed frames as a gap', () => {
    const f = new OneEuro({ minCutoff: 1, beta: 0 })
    f.filter(0, 0)
    // 100 ms is under the gap limit: a real time step, so a 200 px move gets a real share of it (alpha at 1 Hz and 100 ms is 0.39).
    expect(f.filter(200, 100)).toBeGreaterThan(70)
  })

  it('moves an elbow lost for a second no more than 20% of a 200 px jump on its first frame back', () => {
    const f = new PoseFollower()
    const arm = (v: number, down: number, i: number) => {
      const frame = personFrame(still(), undefined, { 13: v })
      frame.image[13].y += down / VIEW.height
      return f.update(frame, i * STEP_MS, VIEW, 1).pose!.occluders.forearms[0]
    }
    for (let i = 0; i < 30; i++) arm(1, 0, i)
    const before = arm(1, 0, 30)!.capsule.a
    for (let i = 31; i < 61; i++) expect(arm(0.2, 0, i)).toBeNull()
    const back = arm(1, 200, 61)!.capsule.a
    expect(Math.hypot(back.x - before.x, back.y - before.y)).toBeLessThanOrEqual(FIRST_FRAME * 200)
    let last = back
    for (let i = 62; i < 92; i++) last = arm(1, 200, i)!.capsule.a
    expect(Math.abs(last.y - (before.y + 200))).toBeLessThan(10)
  })

  it('moves the pose no more than 20% of a 200 px jump on its first frame when the body comes back during the fade', () => {
    const f = new PoseFollower()
    let held = f.update(personFrame(still(), undefined), 0, VIEW, 1)
    for (let i = 1; i < 30; i++) held = f.update(personFrame(still(), undefined), i * STEP_MS, VIEW, 1)
    const gone = 29 * STEP_MS + 450
    expect(f.update(null, gone, VIEW, 1).opacity).toBeCloseTo(0.5)
    const back = f.update(personFrame({ ...still(), x: 320 + 200 }), gone + STEP_MS, VIEW, 1)
    expect(back.opacity).toBe(1)
    expect(Math.abs(back.pose!.x - held.pose!.x)).toBeLessThanOrEqual(FIRST_FRAME * 200)
  })
})

describe('face landmarks', () => {
  it('are filtered: the chin ellipse jitters well under what the raw landmarks give', () => {
    const rand = seeded(5)
    const noise = () => 2 * gaussian(rand)
    const f = new PoseFollower()
    const raw: number[] = []
    const smooth: number[] = []
    for (let i = 0; i < 300; i++) {
      const frame = personFrame(still(), noise)
      const ellipse = faceEllipse(Array.from({ length: 11 }, (_, k) => frame.image[k] && { ...toStage(frame.image[k], VIEW), visibility: 1 }), 'front')!
      const out = f.update(frame, i * STEP_MS, VIEW, 1).pose!.occluders.face!
      if (i >= 60) {
        raw.push(ellipse.y)
        smooth.push(out.y)
      }
    }
    const sd = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + (v - a.reduce((t, w) => t + w, 0) / a.length) ** 2, 0) / a.length)
    expect(sd(smooth)).toBeLessThan(0.6 * sd(raw))
  })
})

describe('jitter and lag of the whole chain', () => {
  it('a still person with 2 px of landmark noise: the anchor moves under 0.5 px, the roll under 0.35 degrees, px/cm under 0.7%', () => {
    const s = stillSd(2)
    expect(s.anchor).toBeLessThan(0.5)
    expect(s.roll).toBeLessThan(0.35)
    expect(s.scalePct).toBeLessThan(0.7)
  })

  it('1 px of noise (the real model on a still photo is about that) stays under 0.3 px', () => {
    expect(stillSd(1).anchor).toBeLessThan(0.3)
  })

  it('walking sideways at 200 px/s lags under 80 ms, and a 20 px shrug reaches 90% within 160 ms', () => {
    expect(walkLag(200)).toBeLessThan(80)
    expect(stepMs('y', -20)).toBeLessThanOrEqual(160)
  })

  it('draws the size up to a 20% change of the shoulder span within 0.6 s', () => {
    expect(scaleStepMs()).toBeLessThanOrEqual(600)
  })

  it('does not drift: the anchor of a still person stays on the truth', () => {
    const out = simulate(still, { sd: 2 }).filter((o) => o.t >= 2000)
    const mean = out.reduce((a, o) => a + o.x, 0) / out.length
    expect(Math.abs(mean - still().x)).toBeLessThan(0.3)
  })

  it('shows more jitter walking than standing (the cutoff rises with speed) but below the raw 1.4 px per axis of the midpoint', () => {
    expect(walkJitter(200, 2)).toBeLessThan(1.4)
  })
})

describe('the overlay meter', () => {
  const series = (f: (t: number) => { x: number; y: number }): Sample[] => Array.from({ length: 60 }, (_, i) => ({ t: i * STEP_MS, ...f(i * STEP_MS) }))

  it('reads a steady walk as no jitter, and white noise as about its sd', () => {
    expect(jitterPx(series((t) => ({ x: 0.2 * t, y: 100 })))).toBeLessThan(0.01)
    const rand = seeded(9)
    const noisy = series(() => ({ x: 2 * gaussian(rand), y: 2 * gaussian(rand) }))
    expect(jitterPx(noisy)).toBeGreaterThan(1.6)
    expect(jitterPx(noisy)).toBeLessThan(2.2)
  })

  it('reads the output of a still person at roughly the real sd of the anchor', () => {
    const out = simulate(still, { sd: 2, seconds: 6 }).filter((o) => o.t >= 2000 && o.t <= 4000)
    const metered = jitterPx(out.map((o) => ({ t: o.t, x: o.x, y: o.y })))
    expect(metered).toBeGreaterThan(0.1)
    expect(metered).toBeLessThan(0.6)
  })

  it('has no number without samples that have a full window', () => {
    expect(jitterPx([])).toBe(0)
    expect(jitterPx(series(() => ({ x: 0, y: 0 })).slice(0, 20))).toBe(0)
  })

  it('reads the speed, and the group delay of the filter at that speed', () => {
    expect(speedPxS(series((t) => ({ x: 0.3 * t, y: 0 })))).toBeCloseTo(300)
    expect(speedPxS([])).toBe(0)
    expect(lagMs({ minCutoff: 1, beta: 0 }, 500)).toBeCloseTo(159.2, 0)
    expect(lagMs({ minCutoff: 0.5, beta: 0.02 }, 200)).toBeCloseTo(1000 / (2 * Math.PI * 4.5), 3)
  })
})
