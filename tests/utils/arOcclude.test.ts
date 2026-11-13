import { describe, expect, it } from 'vitest'
import { BEHIND_M, FOREARM_RADIUS_CM, FRAME_MARGIN, forearmCapsule, forearmInFront, faceEllipse, HAND_REACH, WRIST_SEEN, wristTrusted, type StagePoint } from '../../src/utils/arOcclude'

describe('forearm capsule', () => {
  it('runs from the elbow to the wrist plus 70% of the forearm more, as wide as 5 cm', () => {
    const c = forearmCapsule({ x: 100, y: 100 }, { x: 100, y: 200 }, 4)!
    expect(c.a).toEqual({ x: 100, y: 100 })
    expect(c.b.x).toBeCloseTo(100)
    expect(c.b.y).toBeCloseTo(200 + HAND_REACH * 100)
    expect(c.radius).toBe(FOREARM_RADIUS_CM * 4)
  })
  it('reaches along a slanted forearm too', () => {
    const c = forearmCapsule({ x: 0, y: 0 }, { x: 30, y: 40 }, 1)!
    expect(c.b.x).toBeCloseTo(30 * 1.7)
    expect(c.b.y).toBeCloseTo(40 * 1.7)
  })
  it('needs both the elbow and the wrist visible (0.5 or more)', () => {
    expect(forearmCapsule({ x: 0, y: 0, visibility: 0.49 }, { x: 1, y: 1 }, 1)).toBeNull()
    expect(forearmCapsule({ x: 0, y: 0 }, { x: 1, y: 1, visibility: 0.2 }, 1)).toBeNull()
    expect(forearmCapsule({ x: 0, y: 0, visibility: 0.5 }, { x: 1, y: 1, visibility: 0.5 }, 1)).not.toBeNull()
    expect(forearmCapsule(null, { x: 1, y: 1 }, 1)).toBeNull()
    expect(forearmCapsule({ x: 0, y: 0 }, undefined, 1)).toBeNull()
  })
})

describe('forearm in front or behind', () => {
  it('is in front up to 0.10 m behind the shoulder midpoint, behind beyond it', () => {
    expect(forearmInFront(-0.2, 0, 'front')).toBe(true)
    expect(forearmInFront(BEHIND_M, 0, 'front')).toBe(true)
    expect(forearmInFront(BEHIND_M + 0.01, 0, 'front')).toBe(false)
    expect(forearmInFront(0.2, 0, 'front')).toBe(false)
  })
  it('is relative to the shoulders, not the camera', () => {
    expect(forearmInFront(0.5, 0.45, 'front')).toBe(true)
    expect(forearmInFront(0.6, 0.45, 'front')).toBe(false)
  })
  it('counts as in front with no depth to judge by', () => {
    expect(forearmInFront(undefined, 0, 'front')).toBe(true)
    expect(forearmInFront(0.5, undefined, 'front')).toBe(true)
  })
  it('has no veto facing away, where the world z cannot be trusted', () => {
    expect(forearmInFront(0.5, 0, 'back')).toBe(true)
  })
})

describe('a wrist to trust', () => {
  it('needs visibility of 0.7, not just the 0.5 an elbow needs', () => {
    expect(wristTrusted({ x: 0.5, y: 0.5, visibility: WRIST_SEEN })).toBe(true)
    expect(wristTrusted({ x: 0.5, y: 0.5, visibility: WRIST_SEEN - 0.01 })).toBe(false)
    expect(wristTrusted({ x: 0.5, y: 0.5 })).toBe(true)
  })
  it('needs to be inside the video frame by a margin on every side', () => {
    const at = (x: number, y: number) => wristTrusted({ x, y, visibility: 1 })
    expect(at(0.5, 1 - FRAME_MARGIN)).toBe(true)
    expect(at(0.5, 1 - FRAME_MARGIN + 0.01)).toBe(false)
    expect(at(0.5, FRAME_MARGIN - 0.01)).toBe(false)
    expect(at(FRAME_MARGIN - 0.01, 0.5)).toBe(false)
    expect(at(1 - FRAME_MARGIN + 0.01, 0.5)).toBe(false)
    expect(at(1.2, 1.2)).toBe(false)
  })
})

describe('face ellipse', () => {
  /** A face looking at the camera: eyes at y 100, mouth at y 140 (eye to mouth 40), centred on x 200. */
  function face(overrides: Record<number, StagePoint | undefined> = {}) {
    const points: (StagePoint | undefined)[] = []
    points[0] = { x: 200, y: 120 }
    points[2] = { x: 190, y: 100 }
    points[5] = { x: 210, y: 100 }
    points[3] = { x: 180, y: 100 }
    points[6] = { x: 220, y: 100 }
    points[7] = { x: 170, y: 110 }
    points[8] = { x: 230, y: 110 }
    points[9] = { x: 192, y: 140 }
    points[10] = { x: 208, y: 140 }
    return Object.assign(points, overrides)
  }

  it('is ear to ear wide, from above the eyes to the chin', () => {
    const e = faceEllipse(face(), 'front')!
    // Top 40 above the eyes (y 60), chin 0.9 x 40 below the mouth (y 176): centre 118, half height 58.
    expect(e.x).toBeCloseTo(200)
    expect(e.y).toBeCloseTo(118)
    expect(e.ry).toBeCloseTo(58)
    expect(e.rx).toBeCloseTo(30)
    expect(e.tilt).toBeCloseTo(0)
  })
  it('falls back to twice the outer-eye distance without both ears', () => {
    const e = faceEllipse(face({ 8: { x: 230, y: 110, visibility: 0.1 } }), 'front')!
    expect(e.rx).toBeCloseTo(40)
  })
  it('tilts with the eye line and follows the face axis', () => {
    // Everything turned 90 degrees about (200, 120): the eyes are now one above the other and the chin points sideways.
    const turn = (p: StagePoint | undefined) => p && { ...p, x: 200 - (p.y - 120), y: 120 + (p.x - 200) }
    const e = faceEllipse(face().map(turn), 'front')!
    expect(e.tilt).toBeCloseTo(Math.PI / 2)
    expect(e.ry).toBeCloseTo(58)
    expect(e.x).toBeCloseTo(200 - (118 - 120))
    expect(e.y).toBeCloseTo(120)
  })
  it('needs the nose and both mouth corners visible', () => {
    expect(faceEllipse(face({ 0: { x: 200, y: 120, visibility: 0.3 } }), 'front')).toBeNull()
    expect(faceEllipse(face({ 9: { x: 192, y: 140, visibility: 0.3 } }), 'front')).toBeNull()
    expect(faceEllipse(face({ 10: undefined }), 'front')).toBeNull()
  })
  it('is not drawn facing away, even though the face still reads visible there', () => {
    expect(faceEllipse(face(), 'back')).toBeNull()
  })
})
