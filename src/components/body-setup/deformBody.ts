import type { BodyBuildId, BodyModelId } from '../../service/bodyProfile'
import type { Entered, Field } from './measurements'

// Reshapes a body mesh to the user's measurements for the preview. Pure: typed arrays in, typed arrays out, no three.
// `out` is always rebuilt from the untouched `base`, so nothing drifts as values change. The result is an approximate
// picture, not a scan: girths scale the body radially by (target / current slice perimeter), heights remap y between
// landmarks, shoulders and sleeves move the arm. Both scans stand relaxed with the arms hanging at the sides.

export interface BodyBounds {
  model: BodyModelId
  minY: number
  maxY: number
}

type Vec3 = [number, number, number]

/** Where the studio draws the tape for a field, in the deformed mesh's units. */
export interface Region {
  /** The vertical span to highlight on the body. */
  y0: number
  y1: number
  /** Girth: an ellipse around the body. */
  ring?: { y: number; cx: number; cz: number; rx: number; rz: number }
  /** Length: a straight tape. */
  line?: { from: Vec3; to: Vec3 }
}

export interface Deformed {
  regions: Partial<Record<Field, Region>>
  /** Top of the deformed body. */
  topY: number
  /** How many mesh units one cm is, so the tape and camera can be sized. */
  unitsPerCm: number
}

/** Blends every number in `a` toward `b` by `p`, so a `Deformed` can ease between two shapes. A part only `b` has appears whole. */
export function lerpValue<T>(a: T, b: T, p: number): T {
  if (typeof a === 'number' && typeof b === 'number') return (a + (b - a) * p) as T
  if (Array.isArray(a) && Array.isArray(b)) return b.map((v, i) => lerpValue(a[i] ?? v, v, p)) as T
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out: Record<string, unknown> = {}
    for (const k in b) out[k] = k in a ? lerpValue((a as Record<string, unknown>)[k], b[k], p) : b[k]
    return out as T
  }
  return b
}

// Reference stature of each mesh: a model unit is REF cm ÷ mesh height. Landmarks are fractions of mesh height,
// read off each scan; torsoHalf is (height fraction, half-width fraction) where the torso ends and an arm begins: the edge of
// the hip or ribcage, just inside the hanging arm (which touches the body from the armpit up).
const REF_CM: Record<BodyModelId, number> = { male: 175, female: 165 }
const LANDMARKS: Record<
  BodyModelId,
  {
    ankle: number
    knee: number
    crotch: number
    thigh: number
    hips: number
    waist: number
    chest: number
    bust: number
    shoulder: number
    neck: number
    torsoHalf: [number, number][]
  }
> = {
  male: {
    ankle: 0.04, knee: 0.28, crotch: 0.41, thigh: 0.385, hips: 0.51, waist: 0.62, chest: 0.73, bust: 0.73, shoulder: 0.775, neck: 0.85,
    torsoHalf: [[0.33, 0.08], [0.41, 0.09], [0.45, 0.093], [0.5, 0.088], [0.55, 0.082], [0.6, 0.08], [0.65, 0.082], [0.7, 0.088], [0.74, 0.095], [0.76, 0.1], [0.8, 0.09], [0.83, 0.1], [1, 0.1]],
  },
  female: {
    ankle: 0.04, knee: 0.28, crotch: 0.49, thigh: 0.42, hips: 0.52, waist: 0.655, chest: 0.69, bust: 0.735, shoulder: 0.77, neck: 0.84,
    torsoHalf: [[0.33, 0.087], [0.37, 0.099], [0.4, 0.107], [0.42, 0.1115], [0.44, 0.1236], [0.45, 0.1285], [0.46, 0.1145], [0.5, 0.1176], [0.54, 0.11], [0.58, 0.098], [0.62, 0.08], [0.64, 0.069], [0.66, 0.063], [0.68, 0.069], [0.7, 0.0758], [0.73, 0.08], [0.76, 0.078], [0.8, 0.088], [0.83, 0.1], [1, 0.1]],
  },
}

// A build only nudges the parts the user has not measured. Measured values always win.
const BUILD_MULT: Record<BodyBuildId, { chest: number; waist: number; hips: number; thigh: number; shoulderCm: number }> = {
  skinny: { chest: 0.92, waist: 0.9, hips: 0.93, thigh: 0.88, shoulderCm: -1.5 },
  lean: { chest: 0.96, waist: 0.94, hips: 0.96, thigh: 0.94, shoulderCm: -0.5 },
  skinny_fat: { chest: 0.98, waist: 1.1, hips: 1.02, thigh: 0.97, shoulderCm: 0 },
  regular: { chest: 1, waist: 1, hips: 1, thigh: 1, shoulderCm: 0 },
  muscular: { chest: 1.07, waist: 0.98, hips: 1.03, thigh: 1.1, shoulderCm: 2 },
  overweight: { chest: 1.14, waist: 1.28, hips: 1.16, thigh: 1.2, shoulderCm: 1 },
}

const WRIST_SHARE = 0.78 // wrist as a share of the shoulder-to-fingertip distance
const SPREAD_FADE = 0.7 // how much of a shoulder-width change has faded by the fingertip: the hand stays beside the hip

const smoothstep = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** How much of the body at (|x|, y) belongs to an arm: 1 outside the torso's half-width, 0 on the lower legs and fading out toward the neck. */
function armWeight(L: (typeof LANDMARKS)[BodyModelId], minY: number, height: number, ax: number, y: number) {
  const half = torsoHalf(L.torsoHalf, (y - minY) / height) * height
  return (
    smoothstep(ax, half, half + 0.025 * height) *
    smoothstep(y, minY + 0.33 * height, minY + 0.38 * height) *
    (1 - smoothstep(y, minY + L.shoulder * height, minY + L.neck * height))
  )
}

/** Perimeter of the convex hull of flat [x, z, x, z, ...] points. 0 for fewer than three distinct points. */
export function hullPerimeter(points: number[]): number {
  const pts: [number, number][] = []
  for (let i = 0; i < points.length; i += 2) pts.push([points[i], points[i + 1]])
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return 0
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: [number, number][]) => {
    const hull: [number, number][] = []
    for (const p of list) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop()
      hull.push(p)
    }
    hull.pop()
    return hull
  }
  const hull = [...half(pts), ...half([...pts].reverse())]
  if (hull.length < 3) return 0
  let length = 0
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    length += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return length
}

interface Slice {
  /** Base y of the station. */
  y: number
  perimeter: number
  cx: number
  cz: number
  rx: number
  rz: number
  front: number
}

interface Rig {
  model: BodyBounds['model']
  minY: number
  height: number
  /** cm per mesh unit. */
  k: number
  chest: Slice
  bust: Slice
  waist: Slice
  hips: Slice
  thigh: Slice
  shoulderHalf: number
  jointY: number
  /** Half of the widest the body gets, the arms included. */
  halfWidth: number
  /** Unit vector from the shoulder joint to the fingertip, in the x-y plane, for the +x arm. */
  armDir: [number, number]
  armLength: number
}

const rigs = new WeakMap<Float32Array, Rig>()

function torsoHalf(table: [number, number][], f: number) {
  if (f <= table[0][0]) return table[0][1]
  for (let i = 1; i < table.length; i++) {
    if (f <= table[i][0]) {
      const [f0, h0] = table[i - 1]
      const [f1, h1] = table[i]
      return h0 + ((h1 - h0) * (f - f0)) / (f1 - f0)
    }
  }
  return table[table.length - 1][1]
}

/** Measures the untouched mesh once: slice perimeters at each station, the shoulder and the arm. */
function buildRig(base: Float32Array, bounds: BodyBounds): Rig {
  const L = LANDMARKS[bounds.model]
  const height = bounds.maxY - bounds.minY
  const at = (f: number) => bounds.minY + f * height
  const count = base.length / 3

  const slice = (f: number, leg: 0 | 1 | -1 = 0): Slice => {
    const y = at(f)
    const band = 0.012 * height
    const limit = torsoHalf(L.torsoHalf, f) * height
    const pts: number[] = []
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < count; i++) {
      const x = base[i * 3]
      if (Math.abs(base[i * 3 + 1] - y) > band) continue
      if (Math.abs(x) > limit || (leg && x * leg <= 0)) continue
      const z = base[i * 3 + 2]
      pts.push(x, z)
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
    }
    if (!pts.length) return { y, perimeter: 0, cx: 0, cz: 0, rx: 0, rz: 0, front: 0 }
    return {
      y,
      perimeter: hullPerimeter(pts),
      cx: leg ? (minX + maxX) / 2 : 0,
      cz: (minZ + maxZ) / 2,
      rx: leg ? (maxX - minX) / 2 : Math.max(Math.abs(minX), Math.abs(maxX)),
      rz: (maxZ - minZ) / 2,
      front: maxZ,
    }
  }

  const shoulderY = at(L.shoulder)
  let shoulderHalf = 0
  let halfWidth = 0
  for (let i = 0; i < count; i++) {
    const x = Math.abs(base[i * 3])
    halfWidth = Math.max(halfWidth, x)
    if (Math.abs(base[i * 3 + 1] - shoulderY) < 0.01 * height) shoulderHalf = Math.max(shoulderHalf, x)
  }
  // The fingertip is the arm vertex furthest from the shoulder, whether the arm is out or hanging.
  let tipX = shoulderHalf
  let tipY = shoulderY
  let reach = 0
  for (let i = 0; i < count; i++) {
    const x = base[i * 3]
    const y = base[i * 3 + 1]
    if (x <= 0 || y >= shoulderY || armWeight(L, bounds.minY, height, x, y) < 0.5) continue
    const d = Math.hypot(x - shoulderHalf, y - shoulderY)
    if (d > reach) {
      reach = d
      tipX = x
      tipY = y
    }
  }
  const dx = tipX - shoulderHalf
  const dy = tipY - shoulderY
  const armLength = Math.hypot(dx, dy)

  return {
    model: bounds.model,
    minY: bounds.minY,
    height,
    k: REF_CM[bounds.model] / height,
    chest: slice(L.chest),
    bust: slice(L.bust),
    waist: slice(L.waist),
    hips: slice(L.hips),
    thigh: slice(L.thigh, 1),
    shoulderHalf,
    halfWidth,
    jointY: shoulderY,
    armDir: armLength > 0 ? [dx / armLength, dy / armLength] : [1, 0],
    armLength,
  }
}

interface Station {
  y: number
  ratio: number
  cz: number
}

/**
 * Reshapes `base` (x, y, z triples) into `out` for the entered measurements (cm, or kg for weight) and build.
 * Returns where the studio should draw the tape. `base` is never written.
 */
export function applyMeasurements(
  base: Float32Array,
  out: Float32Array,
  bounds: BodyBounds,
  cm: Entered,
  build: BodyBuildId | null,
): Deformed {
  let rig = rigs.get(base)
  if (!rig) {
    rig = buildRig(base, bounds)
    rigs.set(base, rig)
  }
  const L = LANDMARKS[rig.model]
  const { height, minY, k } = rig
  const u = 1 / k // mesh units per cm
  const at = (f: number) => minY + f * height
  const mult = BUILD_MULT[build ?? 'regular']
  const female = rig.model === 'female'

  // Heights: knots at the base landmarks, remapped piecewise-linearly, so one region grows without stretching the rest.
  const H = cm.height ?? REF_CM[rig.model]
  const ankleCm = L.ankle * H
  const inseamCm = cm.inseam ?? (L.crotch - L.ankle) * H
  const waistSegCm = cm.outseam !== undefined ? Math.max(cm.outseam - inseamCm, 0.5 * (L.waist - L.crotch) * H) : (L.waist - L.crotch) * H
  const torsoCm = cm.torso ?? (L.neck - L.waist) * H
  const headBase = (1 - L.neck) * H
  const headCm = clamp(H - (ankleCm + inseamCm + waistSegCm + torsoCm), 0.6 * headBase, 1.5 * headBase)
  const fit = (H - headCm) / (ankleCm + inseamCm + waistSegCm + torsoCm)
  const knotsCm = [0, ankleCm * fit, 0, 0, 0, 0]
  knotsCm[2] = knotsCm[1] + inseamCm * fit
  knotsCm[3] = knotsCm[2] + waistSegCm * fit
  knotsCm[4] = knotsCm[3] + torsoCm * fit
  knotsCm[5] = H
  const oldKnots = [bounds.minY, at(L.ankle), at(L.crotch), at(L.waist), at(L.neck), bounds.maxY]
  const newKnots = knotsCm.map((v) => minY + v * u)
  const remap = (y: number) => {
    for (let i = 1; i < oldKnots.length; i++) {
      if (y <= oldKnots[i] || i === oldKnots.length - 1) {
        const t = (y - oldKnots[i - 1]) / (oldKnots[i] - oldKnots[i - 1])
        return newKnots[i - 1] + t * (newKnots[i] - newKnots[i - 1])
      }
    }
    return y
  }

  // Girth stations: the ratio is target ÷ current perimeter when measured, the build's nudge when not.
  const measured = (field: Field, slice: Slice) => {
    const target = cm[field]
    return target === undefined || slice.perimeter <= 0 ? null : clamp(target / (slice.perimeter * k), 0.5, 2)
  }
  const ratioFor = (field: Field, slice: Slice, nudge: number) => measured(field, slice) ?? nudge
  // The chest band and the bust sit a hand apart. With only one measured, the other follows it, or the mesh would step between them.
  const chestMeasured = measured('chest', rig.chest)
  const bustMeasured = female ? measured('bust', rig.bust) : null
  const chestRatio = chestMeasured ?? bustMeasured ?? mult.chest
  const bustRatio = female ? (bustMeasured ?? chestMeasured ?? mult.chest) : 1
  const waistRatio = ratioFor('waist', rig.waist, mult.waist)
  const hipsRatio = ratioFor('hips', rig.hips, mult.hips)
  const thighRatio = ratioFor('thigh', rig.thigh, mult.thigh)
  const stations: Station[] = [
    { y: at(L.knee), ratio: 1, cz: rig.hips.cz },
    { y: rig.hips.y, ratio: hipsRatio, cz: rig.hips.cz },
    { y: rig.waist.y, ratio: waistRatio, cz: rig.waist.cz },
    // Hold the waist ratio until just under the chest, so the chest ramp stays at chest height. A big waist-vs-chest
    // difference gets a longer ramp (up to the whole gap) so the torso tapers instead of forming a shelf.
    {
      y: Math.max(rig.waist.y, rig.chest.y - clamp(0.3 * height * Math.abs(waistRatio - chestRatio), 0.03 * height, rig.chest.y - rig.waist.y)) + 1e-6,
      ratio: waistRatio,
      cz: rig.waist.cz,
    },
    { y: rig.chest.y, ratio: chestRatio, cz: rig.chest.cz },
  ]
  if (female) stations.push({ y: rig.bust.y, ratio: bustRatio, cz: rig.bust.cz })
  // The upper chest, back and traps follow the chest through the shoulder line, then ease back to 1 at the neck.
  stations.push({ y: at(L.shoulder), ratio: female ? bustRatio : chestRatio, cz: rig.chest.cz })
  stations.push({ y: at(L.neck), ratio: 1, cz: rig.chest.cz })
  stations.sort((a, b) => a.y - b.y)
  const radial = (y: number): [number, number] => {
    if (y <= stations[0].y || y >= stations[stations.length - 1].y) return [1, stations[0].cz]
    let i = 1
    while (y > stations[i].y) i++
    const a = stations[i - 1]
    const b = stations[i]
    const t = smoothstep(y, a.y, b.y)
    return [a.ratio + (b.ratio - a.ratio) * t, a.cz + (b.cz - a.cz) * t]
  }

  // Shoulders and sleeves move the arm: a vertex counts as arm once it is outside the torso's half-width.
  const shoulderTargetCm = cm.shoulders
  const baseShoulderCm = rig.shoulderHalf * 2 * k
  const shoulderDelta =
    ((shoulderTargetCm !== undefined ? shoulderTargetCm - baseShoulderCm : mult.shoulderCm) / 2) * u
  const wristCm = rig.armLength * k * WRIST_SHARE
  const sleeveRatio = cm.sleeve !== undefined && wristCm > 0 ? clamp(cm.sleeve / wristCm, 0.6, 1.6) : 1
  const [dirX, dirY] = rig.armDir
  const crotchY = at(L.crotch)

  // Thigh: scaled around each leg's own axis, fading out toward the knee and the crotch.
  const thighLo = at(L.knee + 0.02)
  const thighHi = at(L.thigh + 0.015)

  const count = base.length / 3
  for (let i = 0; i < count; i++) {
    const bx = base[i * 3]
    const by = base[i * 3 + 1]
    const bz = base[i * 3 + 2]
    const side = bx < 0 ? -1 : 1
    const ax = Math.abs(bx)

    const arm = armWeight(L, minY, height, ax, by)

    let x = bx
    let y = remap(by)
    let z = bz

    if (by < crotchY) {
      const w = smoothstep(by, at(L.knee), thighLo) * (1 - smoothstep(by, thighHi, crotchY))
      if (w > 0 && rig.thigh.cx > 0) {
        const cx = side * rig.thigh.cx
        const s = 1 + (thighRatio - 1) * w
        x = cx + (x - cx) * s
        z = rig.thigh.cz + (z - rig.thigh.cz) * s
      }
    }

    const [ratio, cz] = radial(by)
    const eff = 1 + (ratio - 1) * (1 - arm)
    x *= eff
    z = cz + (z - cz) * eff

    if (arm > 0) {
      const reach = (ax - rig.shoulderHalf) * dirX + (by - rig.jointY) * dirY
      const spread = shoulderDelta * (1 - SPREAD_FADE * clamp(reach / (rig.armLength || 1), 0, 1))
      const along = Math.max(reach, 0) * (sleeveRatio - 1)
      x += side * (spread + along * dirX) * arm
      y += along * dirY * arm
    }

    out[i * 3] = x
    out[i * 3 + 1] = y
    out[i * 3 + 2] = z
  }

  // Where the tape goes, in the deformed body.
  const regions: Partial<Record<Field, Region>> = {}
  const band = 0.02 * height
  const ring = (field: Field, slice: Slice, r: number) => {
    const y = remap(slice.y)
    regions[field] = {
      y0: y - band,
      y1: y + band,
      ring: { y, cx: 0, cz: slice.cz, rx: slice.rx * r, rz: slice.rz * r },
    }
  }
  ring('chest', rig.chest, chestRatio)
  if (female) ring('bust', rig.bust, bustRatio)
  ring('waist', rig.waist, waistRatio)
  ring('hips', rig.hips, hipsRatio)

  const [thighBody, thighCz] = radial(rig.thigh.y)
  const thighY = remap(rig.thigh.y)
  regions.thigh = {
    y0: thighY - band,
    y1: thighY + band,
    ring: {
      y: thighY,
      cx: rig.thigh.cx * thighBody,
      cz: thighCz + (rig.thigh.cz - thighCz) * thighBody,
      rx: rig.thigh.rx * thighRatio * thighBody,
      rz: rig.thigh.rz * thighRatio * thighBody,
    },
  }

  const front = Math.max(rig.chest.front, rig.waist.front, rig.hips.front) + 0.015 * height
  const margin = 0.03 * height
  const widest = Math.max(rig.hips.rx * hipsRatio, rig.halfWidth + shoulderDelta)
  const topY = newKnots[5]
  regions.height = { y0: minY, y1: topY, line: { from: [widest + margin * 2, minY, 0], to: [widest + margin * 2, topY, 0] } }

  const jointX = rig.shoulderHalf + shoulderDelta
  const shoulderYNew = remap(rig.jointY)
  regions.shoulders = {
    y0: shoulderYNew - band,
    y1: shoulderYNew + band,
    line: { from: [-jointX, shoulderYNew, rig.chest.cz], to: [jointX, shoulderYNew, rig.chest.cz] },
  }
  const wristLen = rig.armLength * sleeveRatio * WRIST_SHARE
  const wrist: Vec3 = [
    jointX - shoulderDelta * SPREAD_FADE * WRIST_SHARE + dirX * wristLen,
    shoulderYNew + dirY * wristLen,
    rig.chest.cz,
  ]
  regions.sleeve = { y0: wrist[1], y1: shoulderYNew, line: { from: [jointX, shoulderYNew, rig.chest.cz], to: wrist } }

  const neckNew = newKnots[4]
  const waistNew = newKnots[3]
  regions.torso = { y0: waistNew, y1: neckNew, line: { from: [0, neckNew, front], to: [0, waistNew, front] } }

  const ankleNew = newKnots[1]
  regions.inseam = {
    y0: ankleNew,
    y1: newKnots[2],
    line: { from: [rig.thigh.cx * 0.5, newKnots[2], rig.thigh.cz], to: [rig.thigh.cx * 0.5, ankleNew, rig.thigh.cz] },
  }
  const outer = rig.hips.rx * hipsRatio + margin * 0.5
  regions.outseam = { y0: ankleNew, y1: waistNew, line: { from: [outer, waistNew, rig.hips.cz], to: [outer, ankleNew, rig.hips.cz] } }

  return { regions, topY, unitsPerCm: u }
}
