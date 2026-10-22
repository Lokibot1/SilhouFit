// Converts the two Sketchfab body scans in src/assets (male anatomy study, female base mesh) into the glb files the body-setup
// studio loads: src/assets/body-male.glb and body-female.glb. Output units: centimetres at a reference stature, Y-up, feet at y=0,
// centred on x/z. One welded outer shell, one material, smooth normals, no UVs/textures, meshopt-compressed.
// The sources are left untouched; their CC-BY-4.0 credit is copied into each output's asset.extras.
// Run: npm run convert:body-models
import { statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { meshopt, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assets = join(root, 'src/assets')
// heightCm is the stature the mesh is scaled to (deformBody.ts REF_CM must match). Mirror-like chrome shows coarse triangulation
// as facets, so a mesh above `targetVerts` is simplified to about that many; smaller meshes are kept as they are. `smooth` is the
// number of Taubin passes (shrink-free smoothing) that take the sculpting noise off a coarse mesh before it is made into chrome.
const MODELS = [
  { src: 'anatomy_study_2.0_basemesh_human_male_body.glb', out: 'body-male.glb', heightCm: 175, targetVerts: 120000 },
  { src: 'base_female_body_meshy.glb', out: 'body-female.glb', heightCm: 165, targetVerts: 120000, smooth: 6 },
]
const NORMAL_WEIGHT = 0.25
const WELD = 0.00001 // source units (metres): vertices closer than this are one

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

/** Triangle index of the largest connected piece; everything else is loose fragments. */
function largestPiece(idx, vertexCount) {
  const parent = new Int32Array(vertexCount).map((_, i) => i)
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  for (let i = 0; i < idx.length; i += 3) {
    const a = find(idx[i])
    parent[find(idx[i + 1])] = a
    parent[find(idx[i + 2])] = a
  }
  const tris = new Map()
  for (let i = 0; i < idx.length; i += 3) {
    const r = find(idx[i])
    tris.set(r, (tris.get(r) ?? 0) + 1)
  }
  const [best] = [...tris.entries()].sort((a, b) => b[1] - a[1])[0]
  const kept = []
  for (let i = 0; i < idx.length; i += 3) if (find(idx[i]) === best) kept.push(idx[i], idx[i + 1], idx[i + 2])
  return { kept: Uint32Array.from(kept), pieces: tris.size }
}

/** Taubin smoothing: alternate a shrinking and an inflating step toward the neighbour average, so volume holds. In place. */
function taubin(P, idx, passes) {
  const near = Array.from({ length: P.length / 3 }, () => new Set())
  for (let i = 0; i < idx.length; i += 3) {
    for (const [a, b] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) { near[a].add(b); near[b].add(a) }
  }
  const next = new Float32Array(P.length)
  for (let pass = 0; pass < passes * 2; pass++) {
    const k = pass % 2 ? -0.53 : 0.5
    for (let v = 0; v < near.length; v++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0
        for (const n of near[v]) sum += P[n * 3 + c]
        next[v * 3 + c] = P[v * 3 + c] + k * (near[v].size ? sum / near[v].size - P[v * 3 + c] : 0)
      }
    }
    P.set(next)
  }
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
await Promise.all([MeshoptDecoder.ready, MeshoptSimplifier.ready, MeshoptEncoder.ready])

for (const { src, out, heightCm, targetVerts, smooth = 0 } of MODELS) {
  console.log(`\n${src}`)
  const source = await io.read(join(assets, src))
  const asset = source.getRoot().getAsset()

  // Every primitive in world space (the nodes carry the Sketchfab y-up/z-up rotations and unit scales), merged into one soup.
  let positions = []
  let indices = []
  for (const node of source.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const m = node.getWorldMatrix()
    for (const prim of mesh.listPrimitives()) {
      const a = prim.getAttribute('POSITION').getArray()
      const base = positions.length / 3
      for (let i = 0; i < a.length; i += 3) {
        positions.push(
          m[0] * a[i] + m[4] * a[i + 1] + m[8] * a[i + 2] + m[12],
          m[1] * a[i] + m[5] * a[i + 1] + m[9] * a[i + 2] + m[13],
          m[2] * a[i] + m[6] * a[i + 1] + m[10] * a[i + 2] + m[14],
        )
      }
      const ix = prim.getIndices()?.getArray()
      if (ix) for (const v of ix) indices.push(base + v)
      else for (let i = 0; i < a.length / 3; i++) indices.push(base + i)
    }
  }
  positions = new Float32Array(positions)
  indices = Uint32Array.from(indices)
  console.log(`merged: ${positions.length / 3} verts, ${indices.length / 3} tris`)

  // Weld by position (normals and UV seams must not split the shell), then drop degenerate triangles.
  const weldDoc = new Document()
  const wb = weldDoc.createBuffer()
  const wp = weldDoc.createPrimitive()
    .setIndices(weldDoc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(wb))
    .setAttribute('POSITION', weldDoc.createAccessor().setType('VEC3').setArray(positions).setBuffer(wb))
  weldDoc.createMesh().addPrimitive(wp)
  await weldDoc.transform(weld({ tolerance: WELD }))
  positions = wp.getAttribute('POSITION').getArray()
  const welded = wp.getIndices().getArray()
  const clean = []
  for (let i = 0; i < welded.length; i += 3) {
    if (welded[i] !== welded[i + 1] && welded[i + 1] !== welded[i + 2] && welded[i] !== welded[i + 2]) clean.push(welded[i], welded[i + 1], welded[i + 2])
  }
  indices = Uint32Array.from(clean)
  console.log(`welded: ${positions.length / 3} verts, ${indices.length / 3} tris`)

  const { kept, pieces } = largestPiece(indices, positions.length / 3)
  console.log(`connected pieces: ${pieces}; dropped ${(indices.length - kept.length) / 3} tris in ${pieces - 1} loose fragments`)
  indices = kept

  if (smooth) taubin(positions, indices, smooth)

  if (positions.length / 3 > targetVerts) {
    // Plain simplification leaves sliver triangles and fold-overs that chrome shows as faceted patches; 'Regularize' keeps
    // triangles even and weighting the source normals keeps the surface from folding over itself.
    const sourceNormals = smoothNormals(positions, indices)
    const [simp, err] = MeshoptSimplifier.simplifyWithAttributes(
      indices, positions, 3, sourceNormals, 3, [NORMAL_WEIGHT, NORMAL_WEIGHT, NORMAL_WEIGHT], null, targetVerts * 2 * 3, 0.05, ['Regularize'],
    )
    console.log(`simplified: ${simp.length / 3} tris, relative error ${err.toFixed(5)}`)
    indices = simp
  }

  // Compact the vertices that are still used.
  const remap = new Map()
  const used = []
  const outIdx = new Uint32Array(indices.length)
  indices.forEach((v, i) => {
    let n = remap.get(v)
    if (n === undefined) {
      n = remap.size
      remap.set(v, n)
      used.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2])
    }
    outIdx[i] = n
  })
  const P = new Float32Array(used)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < P.length; i += 3) {
    minX = Math.min(minX, P[i]); maxX = Math.max(maxX, P[i])
    minY = Math.min(minY, P[i + 1]); maxY = Math.max(maxY, P[i + 1])
    minZ = Math.min(minZ, P[i + 2]); maxZ = Math.max(maxZ, P[i + 2])
  }
  const s = heightCm / (maxY - minY)
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
  for (let i = 0; i < P.length; i += 3) { P[i] = (P[i] - cx) * s; P[i + 1] = (P[i + 1] - minY) * s; P[i + 2] = (P[i + 2] - cz) * s }
  const N = smoothNormals(P, outIdx)
  console.log(`output: ${P.length / 3} verts, ${outIdx.length / 3} tris, ${heightCm} cm tall, source height ${(maxY - minY).toFixed(3)} units`)

  const doc = new Document()
  doc.getRoot().getAsset().extras = asset.extras
  const buf = doc.createBuffer()
  const mat = doc.createMaterial('skin').setBaseColorFactor([0.8, 0.65, 0.58, 1]).setRoughnessFactor(0.7).setMetallicFactor(0)
  const prim = doc.createPrimitive()
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(outIdx).setBuffer(buf))
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(P).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(buf))
    .setMaterial(mat)
  const mesh = doc.createMesh('body').addPrimitive(prim)
  doc.createScene('scene').addChild(doc.createNode('body').setMesh(mesh))
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }))
  const outIo = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  const outPath = join(assets, out)
  await outIo.write(outPath, doc)
  console.log(`wrote ${outPath} (${(statSync(outPath).size / 1024).toFixed(0)} KB)`)
}
