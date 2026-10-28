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
    ankle: 0.04, knee: 0.28, crotch: 0.49, thigh: 0.42, hips: 0.52, waist: 0.655, chest: 0.755, bust: 0.735, shoulder: 0.77, neck: 0.84,
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

const MAX_RATIO_SLOPE = 8 // the most a leg ratio may change per body height, between neighbouring stations

/** Monotone cubic (Fritsch-Carlson/PCHIP) through ascending `xs`: never overshoots its points, flat beyond the ends. */
export function monotoneCubic(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length
  const h = xs.slice(1).map((x, i) => x - xs[i])
  const delta = h.map((hi, i) => (ys[i + 1] - ys[i]) / hi)
  const d = ys.map((_, i) => {
    if (i === 0 || i === n - 1 || delta[i - 1] * delta[i] <= 0) return 0
    const w1 = 2 * h[i] + h[i - 1]
    const w2 = h[i] + 2 * h[i - 1]
    return (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
  })
  return (x) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 1
    while (x > xs[i]) i++
    const t = (x - xs[i - 1]) / h[i - 1]
    const t2 = t * t
    const t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[i - 1] + (t3 - 2 * t2 + t) * h[i - 1] * d[i - 1] + (-2 * t3 + 3 * t2) * ys[i] + (t3 - t2) * h[i - 1] * d[i]
  }
}

/** Identity on [0.8, 1.3]; beyond that eases toward a bound (0.5 / 1.7), so an extreme girth fattens a limb without a spike. */
export function softClampRatio(r: number): number {
  if (r > 1.3) return 1.3 + 0.4 * (1 - Math.exp(-(r - 1.3) / 0.4))
  if (r < 0.8) return 0.8 - 0.3 * (1 - Math.exp(-(0.8 - r) / 0.3))
  return r
}

/** Slope-limits `ratio` between neighbouring stations (change per unit y ≤ maxSlope). Pinned stations (the measured ones) stay put. */
export function limitNeighbourRatios(stations: { y: number; ratio: number; pin?: boolean }[], maxSlope: number): number[] {
  const r = stations.map((s) => s.ratio)
  for (let pass = 0; pass < 50; pass++) {
    let moved = false
    for (let i = 1; i < stations.length; i++) {
      const gap = r[i] - r[i - 1]
      const excess = Math.abs(gap) - maxSlope * (stations[i].y - stations[i - 1].y)
      if (excess <= 1e-9 || (stations[i - 1].pin && stations[i].pin)) continue
      const dir = Math.sign(gap)
      if (stations[i - 1].pin) r[i] -= dir * excess
      else if (stations[i].pin) r[i - 1] += dir * excess
      else {
        r[i] -= (dir * excess) / 2
        r[i - 1] += (dir * excess) / 2
      }
      moved = true
    }
    if (!moved) break
  }
  return r
}

/** How much of the body at (|x|, y) belongs to an arm: 1 outside the torso's half-width, 0 on the lower legs and fading out toward the neck. */
function armWeight(L: (typeof LANDMARKS)[BodyModelId], minY: number, height: number, ax: number, y: number, z?: number) {
  let half = torsoHalf(L.torsoHalf, (y - minY) / height) * height
  let ramp = 0.025 * height
  // The hand and arm rest against the hips and waist, so the hand-over from torso to arm is short from the hand's height up; a long
  // one would scale the hand with the hips and waist. On the female model the breast bulges beside the arm at the chest, but the arm
  // lies behind the front of the body, so there (z <= 0) the hand-over stays short and the torso also ends sooner, while toward the
  // front (the breast) the full torso width and long hand-over stay, so it scales as one.
  if (z !== undefined) {
    const female = L === LANDMARKS.female
    const behind = female ? 1 - smoothstep(z, 0, 0.03 * height) : 1
    const atChest = smoothstep(y, minY + 0.62 * height, minY + 0.66 * height)
    const short = smoothstep(y, minY + 0.38 * height, minY + 0.42 * height) * (1 - atChest * (1 - behind))
    if (female) half -= behind * smoothstep(y, minY + 0.68 * height, minY + 0.72 * height) * Math.max(0, half - 0.066 * height)
    ramp -= short * 0.017 * height
  }
  return (
    smoothstep(ax, half, half + ramp) *
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
  chest: Slice
  bust: Slice
  waist: Slice
  hips: Slice
  thigh: Slice
  /** One leg at the knee; empty (perimeter 0) when the mesh has no leg there. */
  knee: Slice
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
    chest: slice(L.chest),
    bust: slice(L.bust),
    waist: slice(L.waist),
    hips: slice(L.hips),
    thigh: slice(L.thigh, 1),
    knee: slice(L.knee, 1),
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
  const { height, minY } = rig
  // The mesh stands as tall as the entered height, so a taller body is the whole body scaled (girths and lengths included), not stretched in y only.
  const H = cm.height ?? REF_CM[rig.model]
  const k = H / height // cm per mesh unit
  const u = 1 / k // mesh units per cm
  const at = (f: number) => minY + f * height
  const mult = BUILD_MULT[build ?? 'regular']
  const female = rig.model === 'female'

  // Heights: knots at the base landmarks, remapped piecewise-linearly, so one region grows without stretching the rest.
  const ankleCm = L.ankle * H
  const inseamCm = cm.inseam ?? (L.crotch - L.ankle) * H
  const waistSegCm = cm.outseam !== undefined ? Math.max(cm.outseam - inseamCm, 0.5 * (L.waist - L.crotch) * H) : (L.waist - L.crotch) * H
  const torsoCm = cm.torso ?? (L.neck - L.waist) * H
  const headBase = (1 - L.neck) * H
  const headCm = clamp(H - (ankleCm + inseamCm + waistSegCm + torsoCm), 0.95 * headBase, 1.05 * headBase)
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
  // The thigh eases off for extreme entries, so the leg fattens without a spike. The tape reads the same eased ratio.
  const thighRatio = softClampRatio(ratioFor('thigh', rig.thigh, mult.thigh))
  // A bigger thigh carries the pelvis with it unless the hips were measured, so the legs do not sit as barrels on a normal pelvis.
  const hipsMeasured = measured('hips', rig.hips)
  const hipsRatio = hipsMeasured ?? (thighRatio > 1 ? Math.max(mult.hips, 1 + 0.7 * (thighRatio - 1)) : mult.hips)
  const crotchY = at(L.crotch)
  const stations: Station[] = [
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
  stations.push({ y: at(L.shoulder), ratio: chestRatio, cz: rig.chest.cz })
  stations.push({ y: at(L.neck), ratio: 1, cz: rig.chest.cz })
  // The leg: the whole thigh grows together, fullest at the thigh slice, then it eases out over a long
  // smoothstep that runs past the knee into the upper calf (the knee keeps a share, the calf ends at 1). Above the thigh it
  // eases halfway to the hips ratio at the crotch, then bridges to the hips. Neighbours may not differ too sharply.
  if (rig.thigh.perimeter > 0) {
    const d = thighRatio - 1
    const calfY = at(L.knee - 0.14)
    for (let i = 0; i < 8; i++) {
      const t = i / 8
      stations.push({ y: calfY + (rig.thigh.y - calfY) * t, ratio: 1 + d * t * t * (3 - 2 * t), cz: rig.hips.cz })
    }
    const bridge = [
      { y: rig.thigh.y, ratio: thighRatio, pin: true },
      { y: Math.max(rig.thigh.y + 0.005 * height, crotchY - 0.01 * height), ratio: thighRatio + (hipsRatio - thighRatio) * 0.5 },
      { y: rig.hips.y, ratio: hipsRatio, pin: true },
    ]
    const limited = limitNeighbourRatios(bridge, MAX_RATIO_SLOPE / height)
    for (let i = 0; i < bridge.length - 1; i++) stations.push({ y: bridge[i].y, ratio: limited[i], cz: rig.hips.cz })
  } else stations.push({ y: at(L.knee), ratio: 1, cz: rig.hips.cz })
  stations.sort((a, b) => a.y - b.y)
  const ratioAt = monotoneCubic(stations.map((s) => s.y), stations.map((s) => s.ratio))
  const czAt = monotoneCubic(stations.map((s) => s.y), stations.map((s) => s.cz))

  // Each leg scales about its own axis (knee centre up to the thigh centre), not a vertical line, so the inner thigh grows with
  // the rest. The axis gives way to the body's centre line between the crotch and the hips, where the legs become one torso.
  const legSlice = rig.knee.perimeter > 0 ? rig.knee : rig.thigh
  const legAxis = (y: number) => {
    const t = clamp((y - legSlice.y) / (rig.thigh.y - legSlice.y || 1), 0, 1)
    return [legSlice.cx + (rig.thigh.cx - legSlice.cx) * t, legSlice.cz + (rig.thigh.cz - legSlice.cz) * t]
  }
  const innerEdge = Math.max(rig.thigh.cx - rig.thigh.rx, 0.01 * height) // legs closer to the midline than this blend toward it
  const legOuter = rig.thigh.cx + rig.thigh.rx
  // A leg that would grow across the midline moves outward by half the excess instead (the rest is squeezed against its neighbour), so the legs stay inside the pelvis width. Smooth at the threshold.
  const legShift = (e: number) => {
    const over = (e - 1) * rig.thigh.rx - (rig.thigh.cx - rig.thigh.rx)
    return ((over + Math.sqrt(over * over + (0.005 * height) ** 2)) / 2 - 0.0025 * height) * 0.5
  }
  const clearance = 0.004 * height // legs never reach the midline

  // Shoulders and sleeves move the arm: a vertex counts as arm once it is outside the torso's half-width.
  const shoulderTargetCm = cm.shoulders
  const baseShoulderCm = rig.shoulderHalf * 2 * k
  const shoulderDelta =
    ((shoulderTargetCm !== undefined ? shoulderTargetCm - baseShoulderCm : mult.shoulderCm) / 2) * u
  const wristCm = rig.armLength * k * WRIST_SHARE
  const sleeveRatio = cm.sleeve !== undefined && wristCm > 0 ? clamp(cm.sleeve / wristCm, 0.6, 1.6) : 1
  const [dirX, dirY] = rig.armDir

  const hipsEdge = torsoHalf(L.torsoHalf, (rig.hips.y - minY) / height) * height

  const count = base.length / 3
  for (let i = 0; i < count; i++) {
    const bx = base[i * 3]
    const by = base[i * 3 + 1]
    const bz = base[i * 3 + 2]
    const side = bx < 0 ? -1 : 1
    const ax = Math.abs(bx)

    const arm = armWeight(L, minY, height, ax, by, bz)

    let x = bx
    let y = remap(by)
    let z = bz

    // One scale about an axis: the leg's below the crotch, the body's centre line above the hips, blended between.
    const legWeight = 1 - smoothstep(by, crotchY, rig.hips.y)
    const [legX, legZ] = legAxis(by)
    const cx = side * legX * legWeight * smoothstep(ax, 0, innerEdge)
    const cz = czAt(by) + (legZ - czAt(by)) * legWeight
    // Up to the leg's outer edge below the crotch is leg, not arm, even where the torso's half-width says otherwise.
    const legMask = legWeight * (1 - smoothstep(ax, legOuter, legOuter + 0.02 * height))
    const eff = 1 + (ratioAt(by) - 1) * (1 - arm * (1 - legMask))
    const shift = Math.max(legShift(eff), 0) * legWeight * smoothstep(ax, 0, innerEdge)
    x = cx + (x - cx) * eff + side * shift
    z = cz + (z - cz) * eff
    if (ax > clearance && side * x < clearance) x = side * clearance

    if (arm > 0) {
      // Where the hips and thighs have grown, the hanging arm moves out with the body's edge instead of sinking into it.
      // The whole hand and forearm take the hips' move as one, easing off only up the arm to the shoulder, so the hand keeps its
      // shape instead of bending where the body's ratio changes from one height to the next.
      x += side * (hipsRatio - 1) * hipsEdge * arm * (1 - smoothstep(by, rig.hips.y, rig.jointY))
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

  const thighY = remap(rig.thigh.y)
  const thighEff = ratioAt(rig.thigh.y)
  regions.thigh = {
    y0: thighY - band,
    y1: thighY + band,
    ring: { y: thighY, cx: rig.thigh.cx + Math.max(legShift(thighEff), 0), cz: rig.thigh.cz, rx: rig.thigh.rx * thighEff, rz: rig.thigh.rz * thighEff },
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
