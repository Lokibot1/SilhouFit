// Converts src/assets/t-shirt.zip (nested zip -> glTF, CLO export) into src/assets/t-shirt.glb.
// Output units: centimetres (source is metres, not rescaled to a size), Y-up, hem at y=0, centred on x/z. The six garment parts
// are merged into one mesh with one primitive; every triangle is kept (no weld, no simplification), with the source normals and
// UVs. Approximate garment measurements are printed, not stored. Run: npm run convert:tshirt
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { meshopt } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ZIP = join(root, 'src/assets/t-shirt.zip')
const OUT = join(root, 'src/assets/t-shirt.glb')
const CM = 100 // source units are metres

const work = mkdtempSync(join(tmpdir(), 't-shirt-'))
const untar = (zip, dir) => {
  mkdirSync(dir)
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $env:ZIP_SRC -DestinationPath $env:ZIP_DST'], { env: { ...process.env, ZIP_SRC: zip, ZIP_DST: dir } })
  } else execFileSync('unzip', ['-q', zip, '-d', dir])
}
const findFile = (dir, test) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { const r = findFile(p, test); if (r) return r }
    else if (test(e.name)) return p
  }
}

/** Bounding box of a flat xyz array. */
const bounds = (P) => {
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  for (let i = 0; i < P.length; i += 3) for (let c = 0; c < 3; c++) { b.min[c] = Math.min(b.min[c], P[i + c]); b.max[c] = Math.max(b.max[c], P[i + c]) }
  return b
}

/** Approximate garment measurements in cm, from the world-space parts. Printed only. */
function report(parts) {
  const front = parts.find((p) => /front/i.test(p.name))
  const sleeves = parts.filter((p) => /sleeve/i.test(p.name))
  if (!front || sleeves.length !== 2) { console.warn(`measurements skipped: need Body_Front and 2 sleeves, got ${parts.map((p) => p.name).join(', ')}`); return }
  const P = front.positions
  const { min, max } = bounds(P)
  console.log(`total length (approximate): ${(max[1] - min[1]).toFixed(1)} cm`)

  const slices = new Map()
  for (let i = 0; i < P.length; i += 3) {
    const k = Math.floor(P[i + 1] - min[1])
    const s = slices.get(k) ?? [Infinity, -Infinity]
    s[0] = Math.min(s[0], P[i]); s[1] = Math.max(s[1], P[i])
    slices.set(k, s)
  }
  let best = [0, 0]
  for (const [k, [a, b]] of slices) if (b - a > best[1]) best = [k, b - a]
  console.log(`flat chest width (approximate): ${best[1].toFixed(1)} cm, widest 1 cm slice at ${best[0]}-${best[0] + 1} cm above the hem`)
  if (best[0] === 0) console.warn('WARNING: the widest slice is at the hem, so this is not a chest width')

  let shoulder = null, lo = Infinity, hi = -Infinity
  for (let i = 0; i < P.length; i += 3) {
    if (P[i + 1] < max[1] - 3) continue
    lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i])
    if (!shoulder || P[i] > shoulder[0]) shoulder = [P[i], P[i + 1], P[i + 2]]
  }
  console.log(`shoulder width (approximate): ${(hi - lo).toFixed(1)} cm (Body_Front, top 3 cm)`)

  const centreX = (p) => { const b = bounds(p.positions); return (b.min[0] + b.max[0]) / 2 }
  const sleeve = sleeves.find((s) => centreX(s) > 0)
  if (!sleeve) { console.warn('sleeve length skipped: no sleeve on the +x side'); return }
  let far = 0
  for (let i = 0; i < sleeve.positions.length; i += 3) {
    far = Math.max(far, Math.hypot(sleeve.positions[i] - shoulder[0], sleeve.positions[i + 1] - shoulder[1], sleeve.positions[i + 2] - shoulder[2]))
  }
  console.log(`sleeve length (approximate): ${far.toFixed(1)} cm (shoulder point to farthest sleeve vertex)`)
}

/**
 * Flat chest width of the body alone (approximate, cm): the underarm is the lowest 0.5 cm slice that has vertices apart from the body
 * (the sleeves join there); the width is the run of vertices around x=0 in the 1 cm band centred 2.5 cm below it, so sleeves are excluded.
 * Takes the merged positions (flat xyz, any origin) and centres them on x, hem on y=0, like the output. Printed only.
 */
function chestBand(P) {
  const { min, max } = bounds(P)
  const cx = (min[0] + max[0]) / 2
  const xsIn = (y0, y1) => { const xs = []; for (let i = 0; i < P.length; i += 3) { const y = P[i + 1] - min[1]; if (y >= y0 && y < y1) xs.push(P[i] - cx) } return xs.sort((a, b) => a - b) }
  const run = (xs) => { // contiguous around x=0, gaps over 1.5 cm end it
    let i = xs.findIndex((x) => x >= 0); if (i < 0) i = xs.length - 1
    let lo = i, hi = i
    while (lo > 0 && xs[lo] - xs[lo - 1] <= 1.5) lo--
    while (hi < xs.length - 1 && xs[hi + 1] - xs[hi] <= 1.5) hi++
    return xs[hi] - xs[lo]
  }
  for (let y = 0; y < max[1] - min[1]; y += 0.5) {
    const xs = xsIn(y, y + 0.5)
    if (xs.length && xs[xs.length - 1] - xs[0] > run(xs) + 2) {
      // The shirt is draped, so its x width is not a flat width: a size chart's flat chest width is half the girth, taken here as half the
      // perimeter of the convex hull of the (x, z) points in the band.
      const pts = []
      for (let i = 0; i < P.length; i += 3) { const h = P[i + 1] - min[1]; if (h >= y - 3 && h < y - 2) pts.push([P[i] - cx, P[i + 2]]) }
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
      const chain = (list) => { const h = []; for (const p of list) { while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p) } return h }
      const hull = [...chain(pts).slice(0, -1), ...chain([...pts].reverse()).slice(0, -1)]
      const girth = hull.reduce((sum, p, i) => sum + Math.hypot(p[0] - hull[(i + 1) % hull.length][0], p[1] - hull[(i + 1) % hull.length][1]), 0)
      console.log(`flat chest width, half the girth (approximate): ${(girth / 2).toFixed(1)} cm, from a 1 cm band centred 2.5 cm below the underarm at ${y.toFixed(1)} cm above the hem`)
      return
    }
  }
  console.warn('chest band skipped: no sleeve join found')
}

try {
  untar(ZIP, join(work, 'outer'))
  untar(findFile(join(work, 'outer'), (n) => n.endsWith('.zip')), join(work, 'inner'))
  const gltfPath = findFile(join(work, 'inner'), (n) => n.toLowerCase().endsWith('.gltf'))
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready])
  const source = await io.read(gltfPath)

  // Each node that has a mesh, in world space (cm). Normals use the same matrix without translation, renormalised.
  const parts = []
  let sourceTris = 0
  for (const node of source.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const m = node.getWorldMatrix()
    // A mirrored node flips the winding, so swap two corners to keep faces outward.
    const flip = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]) < 0
    const part = { name: node.getName() || mesh.getName(), positions: [], normals: [], uvs: [], indices: [] }
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray()
      const nrm = prim.getAttribute('NORMAL')?.getArray()
      const uv = prim.getAttribute('TEXCOORD_0')?.getArray()
      if (!nrm) throw new Error(`${part.name}: a primitive has no NORMAL; the source normals are required`)
      if (!uv) throw new Error(`${part.name}: a primitive has no TEXCOORD_0`)
      const base = part.positions.length / 3
      for (let i = 0; i < pos.length; i += 3) {
        part.positions.push(
          (m[0] * pos[i] + m[4] * pos[i + 1] + m[8] * pos[i + 2] + m[12]) * CM,
          (m[1] * pos[i] + m[5] * pos[i + 1] + m[9] * pos[i + 2] + m[13]) * CM,
          (m[2] * pos[i] + m[6] * pos[i + 1] + m[10] * pos[i + 2] + m[14]) * CM,
        )
        const nx = m[0] * nrm[i] + m[4] * nrm[i + 1] + m[8] * nrm[i + 2]
        const ny = m[1] * nrm[i] + m[5] * nrm[i + 1] + m[9] * nrm[i + 2]
        const nz = m[2] * nrm[i] + m[6] * nrm[i + 1] + m[10] * nrm[i + 2]
        const l = Math.hypot(nx, ny, nz) || 1
        part.normals.push(nx / l, ny / l, nz / l)
      }
      for (const t of uv) part.uvs.push(t)
      const ix = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: pos.length / 3 }, (_, i) => i)
      for (let i = 0; i < ix.length; i += 3) part.indices.push(base + ix[i], base + ix[i + (flip ? 2 : 1)], base + ix[i + (flip ? 1 : 2)])
      sourceTris += ix.length / 3
    }
    console.log(`${part.name}: ${mesh.listPrimitives().length} primitives, ${part.indices.length / 3} tris`)
    parts.push(part)
  }
  if (!parts.length) throw new Error('no mesh nodes found in the source')
  console.log(`source: ${parts.length} parts, ${sourceTris} tris`)

  report(parts)
  chestBand(parts.flatMap((p) => p.positions))

  // Merge into one soup, then hem to y=0 and centre the box on x/z.
  const P = [], N = [], UV = [], I = []
  for (const part of parts) {
    const base = P.length / 3
    for (const v of part.positions) P.push(v)
    for (const v of part.normals) N.push(v)
    for (const v of part.uvs) UV.push(v)
    for (const v of part.indices) I.push(base + v)
  }
  const positions = Float32Array.from(P)
  const { min, max } = bounds(positions)
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2
  for (let i = 0; i < positions.length; i += 3) { positions[i] -= cx; positions[i + 1] -= min[1]; positions[i + 2] -= cz }
  console.log(`size: ${(max[0] - min[0]).toFixed(1)} x ${(max[1] - min[1]).toFixed(1)} x ${(max[2] - min[2]).toFixed(1)} cm (w x h x d)`)

  const doc = new Document()
  doc.getRoot().getAsset().extras = {
    title: 'T Shirt',
    author: 'funlab117 (https://sketchfab.com/funlab117)',
    license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
    source: 'https://skfb.ly/ozHJJ',
    modified: 'Modified: the parts were merged into one mesh and the units rescaled from metres to centimetres.',
  }
  const buf = doc.createBuffer()
  const mat = doc.createMaterial('fabric').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.9)
  const prim = doc.createPrimitive()
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(I)).setBuffer(buf))
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(N)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(Float32Array.from(UV)).setBuffer(buf))
    .setMaterial(mat)
  const mesh = doc.createMesh('tshirt').addPrimitive(prim)
  doc.createScene('scene').addChild(doc.createNode('tshirt').setMesh(mesh))
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }))
  const outIo = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  await outIo.write(OUT, doc)

  // Self-check: read the file back.
  const back = await io.read(OUT)
  const meshes = back.getRoot().listMeshes()
  const prims = meshes[0].listPrimitives()
  const outTris = prims[0].getIndices().getCount() / 3
  // Positions are quantised, with the scale and offset on the node, so measure them in world space.
  const wm = back.getRoot().listNodes().find((n) => n.getMesh()).getWorldMatrix()
  const acc = prims[0].getAttribute('POSITION')
  const world = []
  for (let i = 0; i < acc.getCount(); i++) {
    const [x, y, z] = acc.getElement(i, [])
    world.push(wm[0] * x + wm[4] * y + wm[8] * z + wm[12], wm[1] * x + wm[5] * y + wm[9] * z + wm[13], wm[2] * x + wm[6] * y + wm[10] * z + wm[14])
  }
  const bb = bounds(world)
  const near = (a, b) => Math.abs(a - b) < 0.5 // quantisation tolerance, cm
  const ok = meshes.length === 1 && prims.length === 1 && outTris === sourceTris && near(bb.min[1], 0)
    && near((bb.min[0] + bb.max[0]) / 2, 0) && near((bb.min[2] + bb.max[2]) / 2, 0) && back.getRoot().getAsset().extras?.license
  if (!ok) throw new Error(`self-check failed: ${meshes.length} meshes, ${prims.length} primitives, ${outTris}/${sourceTris} tris, min y ${bb.min[1]}`)
  console.log(`self-check ok: ${outTris} tris (source ${sourceTris}), min y ${bb.min[1].toFixed(3)}, centre x ${((bb.min[0] + bb.max[0]) / 2).toFixed(3)} z ${((bb.min[2] + bb.max[2]) / 2).toFixed(3)}`)
  console.log(`wrote ${OUT} (${(statSync(OUT).size / 1024).toFixed(0)} KB)`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
