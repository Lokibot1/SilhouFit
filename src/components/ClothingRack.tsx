import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { releaseRenderer } from './landing/chromeBody'

// Model pre-cut to the top of the rack: rail at y ~0.29, cut at y 0.12.
const MODEL_URL = '/models/clothing-rack.glb'
const RAIL_Y = 0.287
// The swing hinges inside the hook shafts, so the rail stays rigid; full swing by FULL_Y.
const PIVOT_Y = 0.281
const FULL_Y = 0.266
const BOTTOM_Y = 0.14
const RAIL_AT = 0.42

// One pendulum per garment, so a shirt swings as a piece.
const BINS = 28
const X0 = -0.56
const DX = 1.12 / (BINS - 1)
const DROP = 0.16

// K: swing (~1 Hz), C: settling, COUPLE: neighbour drag, IMPULSE: hand speed to spin, REACH: hand width.
const K = 36
const C = 2.4
const COUPLE = 30
const IMPULSE = 0.55
const REACH = 0.05
const MAX_ANGLE = 0.09

/** Swings each vertex below the hooks about its hinge; the rail stays rigid. */
function addSway(material: THREE.Material, angles: Float32Array, spins: Float32Array) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAngle = { value: angles }
    shader.uniforms.uSpin = { value: spins }
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `uniform float uAngle[${BINS}];
        uniform float uSpin[${BINS}];
        float swayAt(vec3 p) {
          float t = clamp((p.x - (${X0.toFixed(4)})) / ${DX.toFixed(6)}, 0.0, ${(BINS - 1.001).toFixed(3)});
          int i = int(floor(t));
          float f = smoothstep(0.0, 1.0, fract(t));
          float depth = clamp((${PIVOT_Y.toFixed(4)} - p.y) / ${DROP.toFixed(4)}, 0.0, 1.0);
          float hinge = 1.0 - smoothstep(${FULL_Y.toFixed(4)}, ${PIVOT_Y.toFixed(4)}, p.y);
          float a = mix(uAngle[i], uAngle[i + 1], f);
          float s = mix(uSpin[i], uSpin[i + 1], f);
          return (a + s * 0.025 * depth) * hinge;
        }
        void main() {`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `float swayTh = swayAt(position);
        float swayC = cos(swayTh);
        float swayS = sin(swayTh);
        vec3 objectNormal = vec3(
          normal.x * swayC - normal.y * swayS,
          normal.x * swayS + normal.y * swayC,
          normal.z
        );
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `float swayDy = position.y - ${PIVOT_Y.toFixed(4)};
        vec3 transformed = vec3(
          position.x - swayDy * swayS,
          ${PIVOT_Y.toFixed(4)} + swayDy * swayC,
          position.z
        );`,
      )
  }
}

/** The footer's clothing rail, swaying when a hand brushes it. */
export function ClothingRack({ className = '' }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.opacity = '0'
    renderer.domElement.style.transition = 'opacity 0.8s ease'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envMap
    pmrem.dispose()

    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10)
    const angles = new Float32Array(BINS)
    const spins = new Float32Array(BINS)
    const disposables: { dispose(): void }[] = []
    let ready = false
    // Ignore a load that finishes after unmount.
    let disposed = false

    // Crop the view, not the model, so the rail sits at RAIL_AT from the top.
    const frame = () => {
      const top = (RAIL_Y - RAIL_AT * BOTTOM_Y) / (1 - RAIL_AT)
      const height = top - BOTTOM_Y
      const centerY = (top + BOTTOM_Y) / 2
      const dist = height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      camera.position.set(0, centerY, dist + 0.06)
      camera.lookAt(0, centerY, 0)
    }
    const render = () => ready && renderer.render(scene, camera)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      frame()
      render()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)

    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    loader.load(MODEL_URL, (gltf) => {
      if (disposed) return
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const material = mesh.material as THREE.Material
        addSway(material, angles, spins)
        // The sway moves vertices past the static bounds.
        mesh.frustumCulled = false
        disposables.push(mesh.geometry, material)
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) disposables.push(value)
        }
      })
      scene.add(gltf.scene)
      ready = true
      resize()
      renderer.domElement.style.opacity = '1'
    })

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let raf = 0
    let running = false
    let last = 0
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      let energy = 0
      for (let i = 0; i < BINS; i++) {
        const left = angles[i - 1] ?? angles[i]
        const right = angles[i + 1] ?? angles[i]
        spins[i] += (-K * angles[i] - C * spins[i] + COUPLE * (left + right - 2 * angles[i])) * dt
      }
      for (let i = 0; i < BINS; i++) {
        angles[i] = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, angles[i] + spins[i] * dt))
        energy += Math.abs(angles[i]) + Math.abs(spins[i])
      }
      if (energy < 0.004) {
        angles.fill(0)
        spins.fill(0)
        running = false
        render()
        return
      }
      render()
      raf = requestAnimationFrame(step)
    }
    const wake = () => {
      if (running || !ready) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(step)
    }

    // Window listener: the footer's links overlap the canvas and would swallow the pointer.
    const ray = new THREE.Raycaster()
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const ndc = new THREE.Vector2()
    const hit = new THREE.Vector3()
    let prev: { x: number; t: number } | null = null
    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      if (e.clientY < rect.top || e.clientY > rect.bottom) {
        prev = null
        return
      }
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      ray.setFromCamera(ndc, camera)
      if (!ray.ray.intersectPlane(plane, hit)) return
      if (hit.y > RAIL_Y || hit.y < BOTTOM_Y) {
        prev = null
        return
      }
      if (prev && e.timeStamp > prev.t) {
        const vx = (hit.x - prev.x) / ((e.timeStamp - prev.t) / 1000)
        const push = Math.max(-2, Math.min(2, vx)) * IMPULSE
        for (let i = 0; i < BINS; i++) {
          const d = hit.x - (X0 + i * DX)
          const falloff = Math.exp(-((d / REACH) ** 2))
          if (falloff > 0.02) spins[i] += push * falloff
        }
        wake()
      }
      prev = { x: hit.x, t: e.timeStamp }
    }

    // One ripple on first view to show it can be touched.
    const intro = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || !ready) return
        intro.disconnect()
        for (let i = 0; i < 4; i++) spins[12 + i] = 0.3 - i * 0.06
        wake()
      },
      { threshold: 0.5 },
    )

    if (!reduced) {
      window.addEventListener('pointermove', onMove)
      intro.observe(host)
    }

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      intro.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('pointermove', onMove)
      disposables.forEach((d) => d.dispose())
      envMap.dispose()
      releaseRenderer(renderer)
    }
  }, [])

  return <div ref={hostRef} aria-hidden="true" className={className} />
}
