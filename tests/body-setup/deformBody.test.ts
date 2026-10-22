// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { applyMeasurements, hullPerimeter, type BodyBounds } from '../../src/components/body-setup/deformBody'
import type { Entered } from '../../src/components/body-setup/measurements'

// Reference stature the deformer assumes for each mesh (cm per mesh height): male 175, female 165.
const REF_CM = { male: 175, female: 165 }

/** A body-like mesh: two legs, a tapering torso, a head and two sloping arms. Feet at y = 0. */
function makeBody(height = 1.7) {
  const pts: number[] = []
  const ring = (cx: number, y: number, rx: number, rz: number, n = 48) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      pts.push(cx + rx * Math.cos(a), y, rz * Math.sin(a))
    }
  }
  const steps = 400
  for (let s = 0; s <= steps; s++) {
    const f = s / steps
    const y = f * height
    if (f < 0.45) {
      ring(-0.07, y, 0.05, 0.06)
      ring(0.07, y, 0.05, 0.06)
    } else if (f <= 0.7) {
      ring(0, y, 0.12, 0.09)
    } else if (f <= 0.8) {
      const t = (f - 0.7) / 0.1
      ring(0, y, 0.12 - 0.05 * t, 0.09 - 0.04 * t)
    } else {
      ring(0, y, 0.05, 0.05)
    }
  }
  const shoulderY = 0.79 * height
  for (const side of [-1, 1]) {
    for (let s = 0; s <= 40; s++) {
      const t = s / 40
      const x = side * (0.12 + t * 0.55)
      const y = shoulderY - t * 0.25
      for (const z of [-0.02, 0.02]) pts.push(x, y, z)
    }
  }
  const base = new Float32Array(pts)
  return { base, bounds: { model: 'male', minY: 0, maxY: height } as BodyBounds, height }
}

/** A plain cylinder with none of the body's features. */
function makeCylinder(height = 1.7, radius = 0.1) {
  const pts: number[] = []
  for (let s = 0; s <= 100; s++) {
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2
      pts.push(radius * Math.cos(a), (s / 100) * height, radius * Math.sin(a))
    }
  }
  return { base: new Float32Array(pts), bounds: { model: 'male', minY: 0, maxY: height } as BodyBounds, height }
}

function run(mesh: { base: Float32Array; bounds: BodyBounds }, cm: Entered, build: Parameters<typeof applyMeasurements>[4] = null) {
  const out = new Float32Array(mesh.base.length)
  const deformed = applyMeasurements(mesh.base, out, mesh.bounds, cm, build)
  return { out, deformed }
}

/** Perimeter in cm of the vertices at a base height, restricted to the torso, read from a vertex array. */
function perimeterCm(positions: Float32Array, y: number, half: number, cmPerUnit: number) {
  const flat: number[] = []
  for (let i = 0; i < positions.length; i += 3) {
    if (Math.abs(positions[i + 1] - y) < 1e-4 && Math.abs(positions[i]) <= half) flat.push(positions[i], positions[i + 2])
  }
  return hullPerimeter(flat) * cmPerUnit
}

describe('hullPerimeter', () => {
  it('measures a unit square as 4', () => {
    expect(hullPerimeter([0, 0, 1, 0, 1, 1, 0, 1])).toBeCloseTo(4, 9)
  })

  it('ignores points inside the hull', () => {
    expect(hullPerimeter([0, 0, 2, 0, 2, 2, 0, 2, 1, 1, 0.5, 1.5])).toBeCloseTo(8, 9)
  })

  it('measures a 3-4-5 triangle as 12', () => {
    expect(hullPerimeter([0, 0, 3, 0, 0, 4])).toBeCloseTo(12, 9)
  })

  it('approaches 2 pi r for points on a circle', () => {
    const pts: number[] = []
    for (let i = 0; i < 720; i++) pts.push(10 * Math.cos((i / 720) * Math.PI * 2), 10 * Math.sin((i / 720) * Math.PI * 2))
    expect(hullPerimeter(pts)).toBeCloseTo(62.83, 1)
  })

  it('is 0 for fewer than three points, repeated points, or a straight line', () => {
    expect(hullPerimeter([])).toBe(0)
    expect(hullPerimeter([1, 1, 2, 2])).toBe(0)
    expect(hullPerimeter([1, 1, 1, 1, 1, 1])).toBe(0)
    expect(hullPerimeter([0, 0, 1, 1, 2, 2, 3, 3])).toBe(0)
  })
})

describe('applyMeasurements on a synthetic body', () => {
  it('never writes to the base mesh', () => {
    const { base, bounds } = makeBody()
    const before = base.slice()
    run({ base, bounds }, { height: 190, waist: 100, chest: 110, hips: 120, shoulders: 50, sleeve: 70, inseam: 90, thigh: 70 }, 'muscular')
    expect(Array.from(base)).toEqual(Array.from(before))
  })

  it('reproduces the base mesh when nothing is entered', () => {
    const mesh = makeBody()
    const { out } = run(mesh, {})
    let worst = 0
    for (let i = 0; i < out.length; i++) worst = Math.max(worst, Math.abs(out[i] - mesh.base[i]))
    expect(worst).toBeLessThan(1e-4)
  })

  it('produces no NaN or Infinity for any entry, including extremes', () => {
    const extremes: Entered[] = [
      {},
      { height: 100, weight: 30, shoulders: 25, sleeve: 35, chest: 60, torso: 30, waist: 40, hips: 60, thigh: 30, inseam: 40, outseam: 60 },
      { height: 230, weight: 250, shoulders: 70, sleeve: 100, chest: 180, torso: 80, waist: 200, hips: 200, thigh: 100, inseam: 110, outseam: 140, bust: 180 },
      { inseam: 200, outseam: 1 },
    ]
    for (const build of [null, 'skinny', 'overweight'] as const) {
      for (const cm of extremes) {
        for (const mesh of [makeBody(), makeCylinder()]) {
          const { out, deformed } = run(mesh, cm, build)
          expect(out.every(Number.isFinite)).toBe(true)
          expect(Number.isFinite(deformed.topY)).toBe(true)
          expect(Number.isFinite(deformed.unitsPerCm)).toBe(true)
        }
      }
    }
  })

  it('gives the same result when applied again from the same base (idempotent), even after other values in between', () => {
    const mesh = makeBody()
    const cm: Entered = { height: 182, waist: 85, chest: 100, shoulders: 46 }
    const first = run(mesh, cm).out
    run(mesh, { height: 150, waist: 120, chest: 70, hips: 150, thigh: 80 }, 'overweight')
    const again = run(mesh, cm).out
    expect(Array.from(again)).toEqual(Array.from(first))
  })

  it('overwrites a dirty out buffer completely', () => {
    const mesh = makeBody()
    const clean = run(mesh, { waist: 90 }).out
    const dirty = new Float32Array(mesh.base.length).fill(999)
    applyMeasurements(mesh.base, dirty, mesh.bounds, { waist: 90 }, null)
    expect(Array.from(dirty)).toEqual(Array.from(clean))
  })

  it('makes the body stand exactly as tall as the entered height', () => {
    const mesh = makeBody()
    for (const height of [120, 175, 190, 215]) {
      const { out, deformed } = run(mesh, { height })
      expect((deformed.topY - mesh.bounds.minY) / deformed.unitsPerCm).toBeCloseTo(height, 6)
      let top = -Infinity
      for (let i = 1; i < out.length; i += 3) top = Math.max(top, out[i])
      expect(top).toBeCloseTo(deformed.topY, 4)
    }
  })

  it('reports the reference height when none is entered', () => {
    const { deformed, } = run(makeBody(), {})
    expect(deformed.topY / deformed.unitsPerCm).toBeCloseTo(175, 6)
  })

  it('scales the waist ring by target over current perimeter', () => {
    const mesh = makeBody(1.7)
    const cmPerUnit = REF_CM.male / mesh.height
    const waistY = 0.62 * mesh.height
    const half = 0.13 * mesh.height
    const before = perimeterCm(mesh.base, waistY, half, cmPerUnit)
    expect(before).toBeGreaterThan(60) // sanity: the fixture has a plausible waist
    for (const target of [60, 90, 110]) {
      const { out } = run(mesh, { waist: target })
      expect(perimeterCm(out, waistY, half, cmPerUnit)).toBeCloseTo(target, 0)
    }
  })

  it('scales the hips and chest rings to their targets', () => {
    const mesh = makeBody(1.7)
    const cmPerUnit = REF_CM.male / mesh.height
    const { out } = run(mesh, { hips: 105, chest: 98 })
    expect(perimeterCm(out, 0.51 * mesh.height, 0.13 * mesh.height, cmPerUnit)).toBeCloseTo(105, 0)
    // The chest sits where the fixture tapers, so (like the deformer) read the hull of the whole +/-1.2% band around it.
    const bandCm = (positions: Float32Array) => {
      const flat: number[] = []
      for (let i = 0; i < positions.length; i += 3) {
        if (Math.abs(positions[i + 1] - 0.73 * mesh.height) <= 0.012 * mesh.height && Math.abs(positions[i]) <= 0.12 * mesh.height) {
          flat.push(positions[i], positions[i + 2])
        }
      }
      return hullPerimeter(flat) * cmPerUnit
    }
    // The chest ramp is confined to the 3% under the chest now, so the band's lower edge, which sets the hull on this taper,
    // is a little short of the full ratio: it lands 6.6% under (was 5%).
    expect(Math.abs(bandCm(out) / bandCm(mesh.base) - 98 / bandCm(mesh.base))).toBeLessThan(0.08)
  })

  it('leaves vertices at shoulder height and above where they were when the waist grows', () => {
    const mesh = makeBody(1.7)
    const { out } = run(mesh, { waist: 120 })
    let worst = 0
    for (let i = 0; i < out.length; i += 3) {
      if (mesh.base[i + 1] >= 0.79 * mesh.height && Math.abs(mesh.base[i]) < 0.1) {
        worst = Math.max(worst, Math.hypot(out[i] - mesh.base[i], out[i + 1] - mesh.base[i + 1], out[i + 2] - mesh.base[i + 2]))
      }
    }
    expect(worst).toBeLessThan(0.005 * mesh.height)
  })

  it('moves the arm outward with wider shoulders and further with a longer sleeve, leaving the narrow case inward', () => {
    const mesh = makeBody(1.7)
    const tip = (out: Float32Array) => {
      let best = 0
      for (let i = 0; i < out.length; i += 3) if (out[i] > out[best * 3]) best = i / 3
      return { x: out[best * 3], y: out[best * 3 + 1] }
    }
    const rest = tip(run(mesh, {}).out)
    expect(tip(run(mesh, { shoulders: 60 }).out).x).toBeGreaterThan(rest.x)
    expect(tip(run(mesh, { shoulders: 25 }).out).x).toBeLessThan(rest.x)
    const longer = tip(run(mesh, { sleeve: 100 }).out)
    expect(longer.x).toBeGreaterThan(rest.x)
    expect(longer.y).toBeLessThan(rest.y)
  })

  it('returns a tape region for every measurement of the model', () => {
    const { deformed } = run(makeBody(), { height: 175 })
    for (const field of ['height', 'shoulders', 'sleeve', 'chest', 'torso', 'waist', 'hips', 'thigh', 'inseam', 'outseam'] as const) {
      expect(deformed.regions[field]).toBeDefined()
    }
    expect(deformed.regions.bust).toBeUndefined() // male
  })

  it('does not fill unentered girths from a build when they are measured', () => {
    const mesh = makeBody(1.7)
    const cmPerUnit = REF_CM.male / mesh.height
    const { out } = run(mesh, { waist: 80 }, 'overweight')
    expect(perimeterCm(out, 0.62 * mesh.height, 0.13 * mesh.height, cmPerUnit)).toBeCloseTo(80, 0)
  })

  it('lets a build change the body only where nothing was measured', () => {
    const mesh = makeBody(1.7)
    const cmPerUnit = REF_CM.male / mesh.height
    const regular = run(mesh, {}, 'regular').out
    const heavy = run(mesh, {}, 'overweight').out
    const waistY = 0.62 * mesh.height
    const half = 0.13 * mesh.height
    expect(perimeterCm(heavy, waistY, half, cmPerUnit)).toBeGreaterThan(perimeterCm(regular, waistY, half, cmPerUnit) * 1.2)
  })
})

describe('applyMeasurements on a plain cylinder', () => {
  it('stays finite and finishes at the entered height', () => {
    const mesh = makeCylinder()
    const { out, deformed } = run(mesh, { height: 160, waist: 70 })
    expect(out.every(Number.isFinite)).toBe(true)
    expect((deformed.topY - mesh.bounds.minY) / deformed.unitsPerCm).toBeCloseTo(160, 6)
  })
})

// The real scans. Parsed in node with the same loader and Meshopt decoder the app uses, no network or WebGL.
async function loadRealBody(file: string) {
  const buffer = readFileSync(new URL(`../../src/assets/${file}`, import.meta.url))
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => loader.parse(data, '', resolve as never, reject))
  gltf.scene.updateMatrixWorld(true)
  let mesh: THREE.Mesh | undefined
  gltf.scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh
  })
  const geometry = mesh!.geometry.clone()
  // Quantised attributes are int16; transforms would clamp them, so convert to floats first (as the app does).
  const source = geometry.attributes.position
  const floats = new Float32Array(source.count * 3)
  for (let i = 0; i < source.count; i++) {
    floats[i * 3] = source.getX(i)
    floats[i * 3 + 1] = source.getY(i)
    floats[i * 3 + 2] = source.getZ(i)
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(floats, 3))
  geometry.applyMatrix4(mesh!.matrixWorld)
  geometry.computeBoundingBox()
  const { min, max } = geometry.boundingBox!
  return { base: geometry.attributes.position.array as Float32Array, minY: min.y, maxY: max.y }
}

// Heights are fractions of the mesh height, read off each scan (see LANDMARKS in deformBody.ts). `waistHalf` and `hipsHalf` are
// the half-widths that keep a ring on the torso alone; `armX` is the x beyond which, between the knee and the shoulder, only an arm is.
describe.each([
  { file: 'body-male.glb', model: 'male' as const, waist: 0.62, waistHalf: 0.08, hips: 0.51, hipsHalf: 0.086, armX: 0.1 },
  { file: 'body-female.glb', model: 'female' as const, waist: 0.655, waistHalf: 0.065, hips: 0.52, hipsHalf: 0.114, armX: 0.13 },
])('applyMeasurements on the real $file', ({ file, model, waist, waistHalf, hips, hipsHalf, armX }) => {
  let mesh: { base: Float32Array; bounds: BodyBounds; height: number }

  beforeAll(async () => {
    const loaded = await loadRealBody(file)
    mesh = { base: loaded.base, bounds: { model, minY: loaded.minY, maxY: loaded.maxY }, height: loaded.maxY - loaded.minY }
  }, 20000)

  it('loads a standing body with feet at the floor', () => {
    expect(mesh.base.length / 3).toBeGreaterThan(1000)
    expect(mesh.height).toBeGreaterThan(0)
    expect(mesh.bounds.minY).toBeCloseTo(0, 1)
  })

  it('never writes the base, and reproduces it when nothing is entered', () => {
    const before = mesh.base.slice()
    const { out } = run(mesh, {})
    expect(Array.from(mesh.base)).toEqual(Array.from(before))
    let worst = 0
    for (let i = 0; i < out.length; i++) worst = Math.max(worst, Math.abs(out[i] - mesh.base[i]))
    expect(worst).toBeLessThan(1e-4 * Math.max(1, mesh.height))
  })

  it('stays finite for a full set of extreme entries', () => {
    const { out } = run(mesh, {
      height: 230, weight: 250, shoulders: 70, sleeve: 100, bust: 180, chest: 180, torso: 80, waist: 200, hips: 200, thigh: 100, inseam: 110, outseam: 140,
    }, 'overweight')
    expect(out.every(Number.isFinite)).toBe(true)
  })

  it('is idempotent from the base', () => {
    const cm: Entered = { height: 168, chest: 92, waist: 74, hips: 98, shoulders: 41 }
    const first = run(mesh, cm).out
    run(mesh, { height: 200, waist: 130 })
    expect(Array.from(run(mesh, cm).out)).toEqual(Array.from(first))
  })

  it('stands as tall as the entered height', () => {
    const { out, deformed } = run(mesh, { height: 190 })
    expect((deformed.topY - mesh.bounds.minY) / deformed.unitsPerCm).toBeCloseTo(190, 6)
    let top = -Infinity
    for (let i = 1; i < out.length; i += 3) top = Math.max(top, out[i])
    expect(top).toBeCloseTo(deformed.topY, 3)
  })

  it('brings the waist ring to the entered perimeter', () => {
    const cmPerUnit = REF_CM[model] / mesh.height
    const waistY = mesh.bounds.minY + waist * mesh.height
    const half = waistHalf * mesh.height
    // The scan has no vertex exactly at waistY, so read a thin band of the base and of the output the same way.
    const bandPerimeter = (positions: Float32Array) => {
      const flat: number[] = []
      for (let i = 0; i < positions.length; i += 3) {
        if (Math.abs(positions[i + 1] - waistY) < 0.003 * mesh.height && Math.abs(positions[i]) <= half) flat.push(positions[i], positions[i + 2])
      }
      return hullPerimeter(flat) * cmPerUnit
    }
    const baseCm = bandPerimeter(mesh.base)
    expect(baseCm).toBeGreaterThan(40)
    const target = Math.round(baseCm * 1.25)
    const { out } = run(mesh, { waist: target })
    // The deformer reads each slice as the hull of a +-1.2% band, which runs a few percent larger than this thin band, so the
    // ring lands 4-5% under the entered value on the male (0.07 pinned before). The female narrows to a 55 cm hourglass waist, so the
    // thicker band reads wider than the thin one by about 8%: pinned at 0.09.
    expect(Math.abs(bandPerimeter(out) / baseCm - target / baseCm)).toBeLessThan(0.09)
  })

  it('keeps the shoulder-height torso in place when the waist grows', () => {
    const { out } = run(mesh, { waist: 130 })
    const shoulderY = mesh.bounds.minY + 0.85 * mesh.height
    let worst = 0
    for (let i = 0; i < out.length; i += 3) {
      if (mesh.base[i + 1] >= shoulderY && Math.abs(mesh.base[i]) < 0.04 * mesh.height) {
        worst = Math.max(worst, Math.hypot(out[i] - mesh.base[i], out[i + 1] - mesh.base[i + 1], out[i + 2] - mesh.base[i + 2]))
      }
    }
    expect(worst).toBeLessThan(0.01 * mesh.height)
  })

  describe('hanging arms', () => {
    const rangeOf = (positions: Float32Array, pick: (x: number, y: number) => boolean) => {
      let widest = 0
      let lowest = Infinity
      for (let i = 0; i < positions.length; i += 3) {
        const x = Math.abs(positions[i])
        const y = positions[i + 1]
        if (!pick(x, y)) continue
        widest = Math.max(widest, x)
        lowest = Math.min(lowest, y)
      }
      return { widest, lowest }
    }
    const arm = (h: number) => (x: number, y: number) => x > armX * h && y > 0.38 * h && y < 0.8 * h

    it('is centred, with both arms hanging beside the body and the hands down by the hips', () => {
      const h = mesh.height
      let left = 0
      let right = 0
      for (let i = 0; i < mesh.base.length; i += 3) {
        if (Math.abs(mesh.base[i]) > armX * h && mesh.base[i + 1] > mesh.bounds.minY + 0.4 * h) {
          if (mesh.base[i] < 0) left++
          else right++
        }
      }
      expect(left).toBeGreaterThan(300) // the female scan has only 15k vertices in all
      expect(Math.abs(left - right) / (left + right)).toBeLessThan(0.05)
      expect(rangeOf(mesh.base, arm(h)).widest).toBeLessThan(0.2 * h)
      expect(rangeOf(mesh.base, arm(h)).lowest).toBeLessThan(mesh.bounds.minY + 0.43 * h)
    })

    it('reads the chest, waist and hips rings off the torso alone, not the arms beside it', () => {
      const { deformed } = run(mesh, {})
      for (const field of ['chest', 'waist', 'hips'] as const) {
        expect(deformed.regions[field]?.ring?.rx).toBeLessThan(armX * mesh.height)
      }
      expect(deformed.regions.hips!.ring!.rx).toBeGreaterThan(0.08 * mesh.height)
    })

    it('brings the hips ring to the entered perimeter with the arms beside it', () => {
      const cmPerUnit = REF_CM[model] / mesh.height
      const hipsCm = (positions: Float32Array) => {
        const flat: number[] = []
        const y = mesh.bounds.minY + hips * mesh.height
        for (let i = 0; i < positions.length; i += 3) {
          if (Math.abs(positions[i + 1] - y) < 0.003 * mesh.height && Math.abs(positions[i]) < hipsHalf * mesh.height) flat.push(positions[i], positions[i + 2])
        }
        return hullPerimeter(flat) * cmPerUnit
      }
      const baseCm = hipsCm(mesh.base)
      const { out } = run(mesh, { hips: Math.round(baseCm * 1.2) })
      // As the waist test above, the deformer reads the hull of a thicker band than this thin one. The hips band is thick
      // on the male scan, so the thin ring lands up to 9% under the entered value.
      expect(Math.abs(hipsCm(out) / baseCm - 1.2)).toBeLessThan(0.09)
    })

    it('moves the hanging arm with the shoulders and the sleeve, and the tapes follow it', () => {
      const h = mesh.height
      const reach = (out: Float32Array) => rangeOf(out, (x, y) => x > armX * h && y > 0.35 * h)
      const rest = run(mesh, {})
      // The scans' own shoulder widths differ (about 52 cm on the male, 40 on the female), so go 8 cm either side of it.
      const own = (rest.deformed.regions.shoulders!.line!.to[0] * 2) / rest.deformed.unitsPerCm
      const wide = run(mesh, { shoulders: own + 8 })
      const narrow = run(mesh, { shoulders: own - 8 })
      expect(reach(wide.out).widest).toBeGreaterThan(reach(rest.out).widest)
      expect(reach(narrow.out).widest).toBeLessThan(reach(rest.out).widest)

      const long = run(mesh, { sleeve: 80 })
      const short = run(mesh, { sleeve: 45 })
      expect(reach(long.out).lowest).toBeLessThan(reach(rest.out).lowest - 0.02 * h)
      expect(reach(short.out).lowest).toBeGreaterThan(reach(rest.out).lowest + 0.02 * h)

      // The sleeve tape runs from the shoulder down the arm, nearly straight, and a longer sleeve lengthens it.
      for (const r of [rest, long, short]) {
        const { from, to } = r.deformed.regions.sleeve!.line!
        expect(from[1] - to[1]).toBeGreaterThan(0.2 * h)
        expect(Math.abs(to[0] - from[0])).toBeLessThan(0.2 * (from[1] - to[1]))
      }
      expect(long.deformed.regions.sleeve!.line!.to[1]).toBeLessThan(rest.deformed.regions.sleeve!.line!.to[1])
      expect(wide.deformed.regions.shoulders!.line!.to[0]).toBeGreaterThan(rest.deformed.regions.shoulders!.line!.to[0])
    })

    describe('chest only', () => {
      // The scan's own girth in cm as the deformer reads it: a probe entry of 100 cm scales the ring by 100 over that girth.
      const girthCm = (field: 'chest' | 'bust') => {
        const probe = run(mesh, { [field]: 100 })
        return 100 / (probe.deformed.regions[field]!.ring!.rx / rest().deformed.regions[field]!.ring!.rx)
      }
      // Largest move of the base vertices that `pick` takes, as a share of the height.
      const moved = (out: Float32Array, pick: (x: number, y: number) => boolean) => {
        let worst = 0
        for (let i = 0; i < out.length; i += 3) {
          if (!pick(Math.abs(mesh.base[i]), mesh.base[i + 1])) continue
          worst = Math.max(worst, Math.hypot(out[i] - mesh.base[i], out[i + 1] - mesh.base[i + 1], out[i + 2] - mesh.base[i + 2]))
        }
        return worst / mesh.height
      }
      const chestFrac = model === 'male' ? 0.73 : 0.69
      // The waist ratio holds up to 3% of the height under the chest. The female waist sits only 3.5% under hers, so her
      // hold is a 0.5% sliver just above the waist, and the torso is read there.
      const [torsoLo, torsoHi] = model === 'male' ? [waist + 0.01, chestFrac - 0.05] : [waist + 0.001, chestFrac - 0.03 - 0.001]

      const rest = () => run(mesh, {})
      const grown = () => {
        const r = rest()
        const chest = Math.round(girthCm('chest') * 1.1)
        return { r, chest, g: run(mesh, { chest }) }
      }

      it('leaves the arms below the chest where they were', () => {
        const h = mesh.height
        const { g } = grown()
        expect(moved(g.out, (x, y) => x > armX * h && y > 0.38 * h && y < (chestFrac - 0.05) * h)).toBeLessThan(0.0003)
      })

      it('leaves the torso under the chest where it was', () => {
        const h = mesh.height
        const { g } = grown()
        expect(moved(g.out, (x, y) => x <= armX * h && y > torsoLo * h && y < torsoHi * h)).toBeLessThan(0.0003)
      })

      it('widens the chest ring by the entered ratio', () => {
        const { r, chest, g } = grown()
        const before = r.deformed.regions.chest!.ring!
        const after = g.deformed.regions.chest!.ring!
        expect(after.rx / before.rx).toBeCloseTo(after.rz / before.rz, 6)
        expect(after.rx / before.rx).toBeGreaterThan(1.05)
        expect(after.rx / before.rx).toBeCloseTo(chest / girthCm('chest'), 6)
      })

      // Mean radial move (x, z) of the torso vertices in a height band, as a share of the height; `back` keeps z < 0.
      const torsoMove = (out: Float32Array, f0: number, f1: number, back: boolean) => {
        const h = mesh.height
        let sum = 0
        let n = 0
        for (let i = 0; i < out.length; i += 3) {
          const f = (mesh.base[i + 1] - mesh.bounds.minY) / h
          if (f < f0 || f >= f1 || Math.abs(mesh.base[i]) > armX * h || (mesh.base[i + 2] < 0) !== back) continue
          sum += Math.hypot(out[i] - mesh.base[i], out[i + 2] - mesh.base[i + 2])
          n++
        }
        return sum / n / h
      }

      it.each([0.9, 1.1])('carries the upper chest, back and traps with the chest (x%s), easing to nothing at the neck', (factor) => {
        const out = run(mesh, { chest: girthCm('chest') * factor }).out
        const at = (f: number, back: boolean) => torsoMove(out, f - 0.005, f + 0.005, back)
        const shoulderFrac = model === 'male' ? 0.775 : 0.77
        const neckFrac = model === 'male' ? 0.85 : 0.84
        for (const back of [true, false]) {
          // Through the shoulder line the move stays a substantial share of the move at chest height.
          expect(at(shoulderFrac, back)).toBeGreaterThan(0.5 * at(chestFrac, back))
          expect(at(neckFrac + 0.02, back)).toBeLessThan(0.0003)
        }
        // No step: neighbouring 1% slices of the back differ by far less than the chest move itself.
        let worstStep = 0
        for (let f = chestFrac; f < neckFrac; f += 0.01) worstStep = Math.max(worstStep, Math.abs(at(f + 0.01, true) - at(f, true)))
        expect(worstStep).toBeLessThan(0.003)
      })

      it.each(model === 'male' ? [95, 115] : [70])('tapers a large waist-only entry (%s cm) up the torso without a shelf', (waistCm) => {
        const out = run(mesh, { waist: waistCm }).out
        const h = mesh.height
        const halfWidth = (f: number) => {
          let widest = 0
          for (let i = 0; i < out.length; i += 3) {
            if (Math.abs(out[i + 1] - mesh.bounds.minY - f * h) < 0.005 * h && Math.abs(mesh.base[i]) <= armX * h) widest = Math.max(widest, Math.abs(out[i]))
          }
          return widest / h
        }
        // Slope of the torso half-width between 1% slices, from the waist to the chest. The scans' own shapes reach about 0.9
        // (male) and 1.7 (female, whose waist and chest are 3.5% apart); a held-then-stepped ramp went well past that.
        let worst = 0
        for (let f = waist + 0.01; f < chestFrac; f += 0.01) worst = Math.max(worst, Math.abs(halfWidth(f + 0.01) - halfWidth(f)) / 0.01)
        expect(worst).toBeLessThan(model === 'male' ? 1.1 : 1.9)
      })

      it('keeps the height tape clear of the arms at the chest', () => {
        const { g } = grown()
        let widest = 0
        for (let i = 0; i < g.out.length; i += 3) widest = Math.max(widest, Math.abs(g.out[i]))
        expect(g.deformed.regions.height!.line!.from[0]).toBeGreaterThan(widest + 0.02 * mesh.height)
      })

      if (model === 'female') {
        it('moves the bust and the chest together when only one is entered', () => {
          const h = mesh.height
          for (const field of ['bust', 'chest'] as const) {
            const { out, deformed } = run(mesh, { [field]: Math.round(girthCm(field) * 1.1) })
            expect(out.every(Number.isFinite)).toBe(true)
            const bustGrowth = deformed.regions.bust!.ring!.rx / rest().deformed.regions.bust!.ring!.rx
            const chestGrowth = deformed.regions.chest!.ring!.rx / rest().deformed.regions.chest!.ring!.rx
            expect(bustGrowth).toBeCloseTo(chestGrowth, 6)
            expect(bustGrowth).toBeGreaterThan(1.05)
            expect(moved(out, (x, y) => x > armX * h && y > 0.38 * h && y < (chestFrac - 0.05) * h)).toBeLessThan(0.0003)
          }
        })
      }
    })

    it('keeps the height tape clear of the body, arms included', () => {
      for (const cm of [{}, { shoulders: 60, chest: 130, hips: 120 }, { shoulders: 40 }] as Entered[]) {
        const { out, deformed } = run(mesh, cm)
        let widest = 0
        for (let i = 0; i < out.length; i += 3) widest = Math.max(widest, Math.abs(out[i]))
        expect(deformed.regions.height!.line!.from[0]).toBeGreaterThan(widest + 0.02 * mesh.height)
      }
    })
  })
})
