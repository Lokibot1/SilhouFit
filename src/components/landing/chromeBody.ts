import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import bodyUrl from '../../assets/human_body.glb?url'

/** Chrome figure shared by the hero and AR fitting: one download, material and lighting rig. */

const bodyPromises = new Map<string, Promise<THREE.BufferGeometry>>()

/** Quantised (meshopt) attributes are int16/int8; transforms would clamp them, so work in floats. */
function toFloat(geometry: THREE.BufferGeometry, name: 'position' | 'normal') {
  const source = geometry.attributes[name]
  if (!source || source.array instanceof Float32Array) return
  const array = new Float32Array(source.count * 3)
  for (let i = 0; i < source.count; i++) {
    array[i * 3] = source.getX(i)
    array[i * 3 + 1] = source.getY(i)
    array[i * 3 + 2] = source.getZ(i)
  }
  geometry.setAttribute(name, new THREE.BufferAttribute(array, 3))
}

/** Scanned body as one world-space geometry (y up, feet at 0); each caller gets its own copy. One download per url. */
export function loadBodyGeometry(url: string = bodyUrl) {
  let promise = bodyPromises.get(url)
  if (!promise) {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    promise = loader.loadAsync(url).then((gltf) => {
      gltf.scene.updateMatrixWorld(true)
      let mesh: THREE.Mesh | undefined
      gltf.scene.traverse((o) => {
        if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh
      })
      if (!mesh) throw new Error('Body model has no mesh')
      const geometry = mesh.geometry.clone()
      toFloat(geometry, 'position')
      toFloat(geometry, 'normal')
      geometry.applyMatrix4(mesh.matrixWorld)
      mesh.geometry.dispose()
      return geometry
    })
    bodyPromises.set(url, promise)
    // A failed load is not cached, so a later mount can retry.
    promise.catch(() => bodyPromises.delete(url))
  }
  return promise.then((geometry) => geometry.clone())
}

/** Keeps triangles wholly in the top `meshFraction`, with bounds set to `frameFraction`. Drops model colours. */
export function cropFromTop(
  source: THREE.BufferGeometry,
  meshFraction: number,
  frameFraction: number,
) {
  source.computeBoundingBox()
  const { min, max } = source.boundingBox!
  const height = max.y - min.y
  const cut = max.y - height * meshFraction
  const pos = source.attributes.position
  const src = source.index
  const count = src ? src.count : pos.count
  const kept: number[] = []
  for (let i = 0; i < count; i += 3) {
    const tri = [0, 1, 2].map((k) => (src ? src.getX(i + k) : i + k))
    if (tri.every((v) => pos.getY(v) > cut)) kept.push(...tri)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', pos)
  if (source.attributes.normal) geometry.setAttribute('normal', source.attributes.normal)
  geometry.setIndex(kept)
  if (!source.attributes.normal) geometry.computeVertexNormals()
  // Bounds describe the framed part, or framing would fit the legs.
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  for (const i of kept) box.expandByPoint(v.fromBufferAttribute(pos, i))
  box.min.y = max.y - height * frameFraction
  geometry.boundingBox = box
  return { geometry, height }
}

/** Whether a WebGL context can be made here. Probing is quiet; constructing a renderer without one logs several errors. */
export function webglSupported() {
  const probe = document.createElement('canvas')
  const gl = probe.getContext('webgl2') ?? probe.getContext('webgl')
  gl?.getExtension('WEBGL_lose_context')?.loseContext()
  return gl !== null
}

/** Dispose a renderer and release its GPU context; browsers allow only ~16 live. */
export function releaseRenderer(renderer: THREE.WebGLRenderer) {
  renderer.dispose()
  renderer.forceContextLoss()
  renderer.domElement.remove()
}

/** Polished chrome. Almost all reflection, so the environment does the work. */
export function createChromeMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xe4e8ee,
    metalness: 1,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  })
}

/** The studio the chrome reflects: room environment plus key and rim lights. Returns the env map to dispose. */
export function addStudio(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.03).texture
  scene.environment = envMap
  pmrem.dispose()

  const key = new THREE.DirectionalLight(0xffffff, 2.2)
  key.position.set(3, 4, 5)
  const rim = new THREE.DirectionalLight(0xdfe6ff, 1.6)
  rim.position.set(-4, 2, -3)
  scene.add(key, rim)
  return envMap
}
