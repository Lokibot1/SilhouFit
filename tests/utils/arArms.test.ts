import { describe, expect, it } from 'vitest'
import { ARMS_DOWN, armAngle, SLEEVE_MAX, SLEEVE_MIN, SLEEVE_REST, sleeveAngle, sleeveRotation, sleevesOnBones, SleeveTracker } from '../../src/utils/arArms'
import { GARMENT_BASE } from '../../src/utils/arGarment'

const deg = (rad: number) => (rad * 180) / Math.PI
const rad = (d: number) => (d * Math.PI) / 180
const SHOULDER = { x: 300, y: 200 }
/** An elbow 100 px from the shoulder, `d` degrees from hanging, out to the given screen side (stage pixels, y down). */
const elbow = (d: number, side: -1 | 1) => ({ x: SHOULDER.x + side * 100 * Math.sin(rad(d)), y: SHOULDER.y + 100 * Math.cos(rad(d)) })

describe('arm angle', () => {
  it('is 0 hanging and 90 degrees straight out, on both sides of the screen', () => {
    for (const side of [-1, 1] as const) {
      expect(deg(armAngle(SHOULDER, elbow(0, side), 0, side))).toBeCloseTo(0)
      expect(deg(armAngle(SHOULDER, elbow(90, side), 0, side))).toBeCloseTo(90)
      expect(deg(armAngle(SHOULDER, elbow(45, side), 0, side))).toBeCloseTo(45)
    }
  })
  it('is negative across the body and past 90 for an elbow above the shoulder', () => {
    expect(deg(armAngle(SHOULDER, elbow(-30, 1), 0, 1))).toBeCloseTo(-30)
    expect(deg(armAngle(SHOULDER, elbow(135, -1), 0, -1))).toBeCloseTo(135)
    expect(deg(armAngle(SHOULDER, { x: SHOULDER.x, y: SHOULDER.y - 100 }, 0, 1))).toBeCloseTo(180)
  })
  it('stays raised, not lowest, for an arm up and slightly across the head', () => {
    expect(deg(armAngle(SHOULDER, { x: SHOULDER.x - 5, y: SHOULDER.y - 100 }, 0, 1))).toBeGreaterThan(180)
    expect(sleeveAngle(SHOULDER, { x: SHOULDER.x - 5, y: SHOULDER.y - 100 }, 0, 1)).toBe(SLEEVE_MAX)
  })
  it('is the same when the whole body rolls, whichever way', () => {
    // Roll is counter-clockwise on the canvas (y up); the arm vector turns with the body, so the angle is unchanged.
    for (const roll of [0.3, -0.5]) {
      for (const side of [-1, 1] as const) {
        const v = { x: elbow(60, side).x - SHOULDER.x, y: SHOULDER.y - elbow(60, side).y }
        const x = v.x * Math.cos(roll) - v.y * Math.sin(roll)
        const y = v.x * Math.sin(roll) + v.y * Math.cos(roll)
        const turned = { x: SHOULDER.x + x, y: SHOULDER.y - y }
        expect(deg(armAngle(SHOULDER, turned, roll, side))).toBeCloseTo(60)
      }
    }
  })
  it('reads a body that rolled with the arm hanging as hanging', () => {
    // Left shoulder down on screen is a positive roll; an arm hanging from the rolled body points along (sin roll, -cos roll) in y up.
    const roll = 0.4
    const e = { x: SHOULDER.x + 100 * Math.sin(roll), y: SHOULDER.y + 100 * Math.cos(roll) }
    expect(armAngle(SHOULDER, e, roll, 1)).toBeCloseTo(0)
  })
})

describe('clamping', () => {
  it('keeps a hanging arm at 10 degrees and a raised one at the rest angle plus 40', () => {
    expect(sleeveAngle(SHOULDER, elbow(0, 1), 0, 1)).toBeCloseTo(SLEEVE_MIN)
    expect(deg(SLEEVE_MIN)).toBeCloseTo(10)
    expect(sleeveAngle(SHOULDER, elbow(-40, -1), 0, -1)).toBeCloseTo(SLEEVE_MIN)
    expect(sleeveAngle(SHOULDER, elbow(90, 1), 0, 1)).toBeCloseTo(SLEEVE_MAX)
    expect(deg(SLEEVE_MAX)).toBeCloseTo(GARMENT_BASE.sleeveRestDeg + 40)
    expect(sleeveAngle(SHOULDER, elbow(60, -1), 0, -1)).toBeCloseTo(rad(60))
  })
})

describe('sleeve rotation from the A-pose', () => {
  it('is zero at the rest angle, and turns the +x sleeve counter-clockwise and the -x sleeve clockwise as the arm lifts', () => {
    expect(sleeveRotation(SLEEVE_REST, 1)).toBe(0)
    expect(sleeveRotation(SLEEVE_REST, -1)).toBeCloseTo(0)
    expect(sleeveRotation(rad(60), 1)).toBeCloseTo(rad(60) - SLEEVE_REST)
    expect(sleeveRotation(rad(60), -1)).toBeCloseTo(-(rad(60) - SLEEVE_REST))
    // Lowering the arm to the lowest angle turns the +x sleeve clockwise (negative), the -x sleeve counter-clockwise.
    expect(sleeveRotation(SLEEVE_MIN, 1)).toBeLessThan(0)
    expect(sleeveRotation(SLEEVE_MIN, -1)).toBeGreaterThan(0)
  })
  it('puts the cuff of each sleeve where the arm points (rotation about z, counter-clockwise positive)', () => {
    // The sleeve axis in the model at rest: from the pivot, rest degrees from straight down, outward on its side.
    for (const side of [-1, 1] as const) {
      const axis = { x: side * Math.sin(SLEEVE_REST), y: -Math.cos(SLEEVE_REST) }
      const a = sleeveRotation(rad(90), side)
      const turned = { x: axis.x * Math.cos(a) - axis.y * Math.sin(a), y: axis.x * Math.sin(a) + axis.y * Math.cos(a) }
      expect(turned.x).toBeCloseTo(side)
      expect(turned.y).toBeCloseTo(0)
    }
  })
})

describe('SleeveTracker', () => {
  const HOLD = 300, FADE = 300
  const make = () => new SleeveTracker(HOLD, FADE)
  it('passes a measured angle straight through', () => {
    expect(make().update(rad(50), 0)).toBe(rad(50))
  })
  it('reads arms-down for an arm never seen', () => {
    expect(make().update(null, 0)).toBe(ARMS_DOWN)
  })
  it('holds the last angle for 300 ms, eases to arms-down over the next 300 ms, then stays there', () => {
    const t = make()
    t.update(rad(60), 1000)
    expect(t.update(null, 1100)).toBe(rad(60))
    expect(t.update(null, 1300)).toBe(rad(60))
    expect(t.update(null, 1450)).toBeCloseTo((rad(60) + ARMS_DOWN) / 2)
    expect(t.update(null, 1600)).toBeCloseTo(ARMS_DOWN)
    expect(t.update(null, 5000)).toBe(ARMS_DOWN)
  })
  it('snaps to arms-down after the hold with reduced motion', () => {
    const t = make()
    t.update(rad(60), 0)
    expect(t.update(null, 300, true)).toBe(rad(60))
    expect(t.update(null, 301, true)).toBe(ARMS_DOWN)
  })
  it('takes the measurement again when the elbow returns mid-ease, and forgets after a reset', () => {
    const t = make()
    t.update(rad(60), 0)
    t.update(null, 450)
    expect(t.update(rad(70), 500)).toBe(rad(70))
    t.reset()
    expect(t.update(null, 600)).toBe(ARMS_DOWN)
  })
})

describe('sleeves on the bones', () => {
  it('give the -x bone the left of the screen and the +x bone the right facing the camera', () => {
    expect(sleevesOnBones([rad(60), rad(20)], false)).toEqual([rad(60), rad(20)])
  })
  it('swap them facing away: the mesh is turned half way round, so the -x sleeve is on the right of the screen', () => {
    expect(sleevesOnBones([rad(60), rad(20)], true)).toEqual([rad(20), rad(60)])
  })
})
