import type { Facing, Point } from './arPose'

// Depth-only occluders for the AR try-on, pure maths: where to put a forearm capsule and a face ellipse (stage pixels) so a hand or the chin
// in front of the shirt hides it. Points are landmarks already in stage pixels (mirrored, y down), keeping their visibility.

/** A stage point with the landmark's visibility; none means fully visible. */
export interface StagePoint extends Point {
  visibility?: number
}

/** Same as MIN_VISIBILITY in arPose, repeated so this file needs nothing from it at run time (arPose imports this one). */
const SEEN = 0.5
const seen = (p: StagePoint | null | undefined): p is StagePoint => !!p && (p.visibility ?? 1) >= SEEN

/** The forearm capsule's radius in cm, and how far past the wrist it reaches as a share of the elbow-to-wrist length (covers the hand). */
export const FOREARM_RADIUS_CM = 5
export const HAND_REACH = 0.7
/** A wrist this far behind the shoulder midpoint (metres of MediaPipe world z, which grows away from the camera) is behind the body. */
export const BEHIND_M = 0.1
/** The chin sits this far below the mouth, as a share of the eye-to-mouth distance. */
export const CHIN_BELOW_MOUTH = 0.9

export interface Capsule {
  a: Point
  b: Point
  radius: number
}

/** From the elbow to the wrist plus 70% of the forearm more (the hand); null unless both are seen. */
export function forearmCapsule(elbow: StagePoint | null | undefined, wrist: StagePoint | null | undefined, pxPerCm: number): Capsule | null {
  if (!seen(elbow) || !seen(wrist)) return null
  const b = { x: wrist.x + HAND_REACH * (wrist.x - elbow.x), y: wrist.y + HAND_REACH * (wrist.y - elbow.y) }
  return { a: { x: elbow.x, y: elbow.y }, b, radius: FOREARM_RADIUS_CM * pxPerCm }
}

/**
 * Whether a forearm counts as in front of the body. 2D cannot tell, so the world z decides: a wrist more than BEHIND_M behind the shoulder
 * midpoint is behind (hide the occluder). No z means in front. Facing away there is no veto: the labels and depth are front-like then, so
 * the world z cannot be trusted, and a forearm is taken as in front.
 */
export const forearmInFront = (wristZ: number | undefined, shoulderMidZ: number | undefined, facing: Facing) =>
  facing === 'back' || wristZ === undefined || shoulderMidZ === undefined || wristZ - shoulderMidZ <= BEHIND_M

export interface Ellipse {
  x: number
  y: number
  /** Half width, along the eye line. */
  rx: number
  /** Half height, from the top of the head to the chin. */
  ry: number
  /** The eye line's angle in stage pixels (y down). */
  tilt: number
}

/**
 * The face from landmarks 0..10 (`face[i]` is landmark i): as wide as ear to ear (7, 8) when both are seen, else twice the outer-eye distance
 * (3, 6); from the chin (below the mouth) up as far above the eyes as the mouth is below them. Null unless the nose and both mouth corners
 * are seen and the person faces the camera: from behind MediaPipe still reports the face seen, but it is hidden hair.
 */
export function faceEllipse(face: (StagePoint | undefined)[], facing: Facing): Ellipse | null {
  const [nose, eyeL, eyeR, outerL, outerR, earL, earR, mouthL, mouthR] = [0, 2, 5, 3, 6, 7, 8, 9, 10].map((i) => face[i])
  if (facing === 'back' || !seen(nose) || !seen(mouthL) || !seen(mouthR) || !eyeL || !eyeR || !outerL || !outerR) return null
  const mid = (p: Point, q: Point) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })
  const eyes = mid(eyeL, eyeR)
  const mouth = mid(mouthL, mouthR)
  const [dx, dy] = [mouth.x - eyes.x, mouth.y - eyes.y]
  const top = { x: eyes.x - dx, y: eyes.y - dy }
  const chin = { x: mouth.x + CHIN_BELOW_MOUTH * dx, y: mouth.y + CHIN_BELOW_MOUTH * dy }
  const width = seen(earL) && seen(earR) ? Math.hypot(earL.x - earR.x, earL.y - earR.y) : 2 * Math.hypot(outerL.x - outerR.x, outerL.y - outerR.y)
  const centre = mid(top, chin)
  return { x: centre.x, y: centre.y, rx: width / 2, ry: Math.hypot(chin.x - top.x, chin.y - top.y) / 2, tilt: Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x) }
}
