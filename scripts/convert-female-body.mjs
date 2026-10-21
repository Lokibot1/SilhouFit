// Converts src/assets/female-body.zip (nested zip -> ZBrush OBJ) into src/assets/female_body.glb.
// Output units: centimetres, Y-up, feet at y=0, centred on x/z. Single mesh, one material,
// smooth normals, no UVs, meshopt-compressed. Run: npm run convert:female-body
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression } from '@gltf-transform/extensions'
import { meshopt, weld } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ZIP = join(root, 'src/assets/female-body.zip')
const OUT = join(root, 'src/assets/female_body.glb')
// Mirror-like chrome shows any coarse triangulation as facets, so this is dense: about 0.9 MB.
const TARGET_VERTS = 120000
const NORMAL_WEIGHT = 0.25

/** Smooth per-vertex normals, area-weighted. */
function smoothNormals(P, idx) {
  const N = new Float32Array(P.length)
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3]
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]]
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    for (const v of [a, b, c]) { N[v] += n[0]; N[v + 1] += n[1]; N[v + 2] += n[2] }
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1
    N[i] /= l; N[i + 1] /= l; N[i + 2] /= l
  }
  return N
}

const work = mkdtempSync(join(tmpdir(), 'female-body-'))
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

try {
  untar(ZIP, join(work, 'outer'))
  untar(findFile(join(work, 'outer'), (n) => n.endsWith('.zip')), join(work, 'inner'))
  const objPath = findFile(join(work, 'inner'), (n) => n.toLowerCase().endsWith('.obj'))
  console.log(`OBJ: ${(statSync(objPath).size / 1e6).toFixed(1)} MB`)

  // Parse positions + faces (position index only), fan-triangulate.
  const pos = []
  const tris = []
  for (const line of readFileSync(objPath, 'utf8').split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/)
      pos.push(+p[1], +p[2], +p[3])
    } else if (line.startsWith('f ')) {
      const f = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t, 10) - 1)
      for (let i = 1; i < f.length - 1; i++) tris.push(f[0], f[i], f[i + 1])
    }
  }
  let positions = new Float32Array(pos)
  let indices = new Uint32Array(tris)
  console.log(`parsed: ${positions.length / 3} verts, ${indices.length / 3} tris`)

  // Weld by position, then simplify.
  const weldDoc = new Document()
  const wb = weldDoc.createBuffer()
  const wp = weldDoc.createPrimitive()
    .setIndices(weldDoc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(wb))
    .setAttribute('POSITION', weldDoc.createAccessor().setType('VEC3').setArray(positions).setBuffer(wb))
  weldDoc.createMesh().addPrimitive(wp)
  await weldDoc.transform(weld({ tolerance: 0.0001 }))
  positions = wp.getAttribute('POSITION').getArray()
  indices = Uint32Array.from(wp.getIndices().getArray())
  console.log(`welded: ${positions.length / 3} verts, ${indices.length / 3} tris`)

  await MeshoptSimplifier.ready
  // The source is one clean closed shell (no interior shells or flipped faces), but plain simplification leaves sliver
  // triangles and fold-overs that a mirror-like chrome material shows as faceted patches and stripes on the torso.
  // 'Regularize' keeps triangles even, and weighting the source normals keeps the surface from folding over itself.
  const sourceNormals = smoothNormals(positions, indices)
  // Vertices ~ tris/2 on a closed manifold; aim for TARGET_VERTS.
  const [simp, err] = MeshoptSimplifier.simplifyWithAttributes(
    indices, positions, 3, sourceNormals, 3, [NORMAL_WEIGHT, NORMAL_WEIGHT, NORMAL_WEIGHT], null, TARGET_VERTS * 2 * 3, 0.05, ['Regularize'],
  )
  console.log(`simplified: ${simp.length / 3} tris, relative error ${err.toFixed(5)}`)

  // Compact vertices.
  const remap = new Map()
  const outPos = []
  const outIdx = new Uint32Array(simp.length)
  let minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  simp.forEach((v, i) => {
    let n = remap.get(v)
    if (n === undefined) {
      n = remap.size
      remap.set(v, n)
      const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2]
      outPos.push(x, y, z)
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
    }
    outIdx[i] = n
  })
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
  const P = new Float32Array(outPos)
  for (let i = 0; i < P.length; i += 3) { P[i] -= cx; P[i + 1] -= minY; P[i + 2] -= cz }

  const N = smoothNormals(P, outIdx)

  const doc = new Document()
  const buf = doc.createBuffer()
  const mat = doc.createMaterial('skin').setBaseColorFactor([0.8, 0.65, 0.58, 1]).setRoughnessFactor(0.7).setMetallicFactor(0)
  const prim = doc.createPrimitive()
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(outIdx).setBuffer(buf))
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(P).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(buf))
    .setMaterial(mat)
  const mesh = doc.createMesh('female_body').addPrimitive(prim)
  doc.createScene('scene').addChild(doc.createNode('female_body').setMesh(mesh))

  await MeshoptEncoder.ready
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }))
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  await io.write(OUT, doc)
  console.log(`wrote ${OUT} (${(statSync(OUT).size / 1024).toFixed(0)} KB)`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
