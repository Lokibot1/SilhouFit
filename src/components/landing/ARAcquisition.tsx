import type { MotionValue } from 'motion/react'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  addStudio,
  createChromeMaterial,
  cropFromTop,
  loadBodyGeometry,
  releaseRenderer,
} from './chromeBody'

/**
 * The page's authored moment: scroll position runs the fitting pipeline the
 * product is built on, on the hero's own chrome body. A camera frame finds the
 * figure and pulls focus, pose landmarks lock onto its joints, then a garment
 * is rendered onto it from the collar down.
 */

// Where each stage owns the scroll. The overlaps are deliberate: one stage is
// still settling as the next begins, which is what makes it read as a single
// continuous acquisition instead of three slides.
const CAMERA = [0, 0.3]
const POSE = [0.28, 0.64]
const GARMENT_RANGE = [0.62, 0.95]

// Anatomy of the scanned body, measured from the model: x in model units,
// f as a fraction of standing height down from the crown.
const COLLAR_F = 0.135
const HEM_F = 0.46
const TORSO_HALF = 0.47
const SHOULDER = { x: 0.55, f: 0.19 }
const ELBOW = { x: 1.12, f: 0.31 }
// How far down the upper arm the sleeve reaches, shoulder = 0, elbow = 1.
const SLEEVE = 0.5
// How loosely the garment sits off the skin, in model units (~1.5 cm).
const EASE = 0.04

// Framed from the crown to mid-thigh; the mesh runs a little further so the
// fade at the bottom never shows a cut.
const FRAME_F = 0.6
const MESH_F = 0.66

// Head downward, which is the order the landmarks lock on in.
const JOINTS: [number, number][] = [
  [0, 0.06],
  [0, 0.13],
  [-SHOULDER.x, SHOULDER.f],
  [SHOULDER.x, SHOULDER.f],
  [-ELBOW.x, ELBOW.f],
  [ELBOW.x, ELBOW.f],
  [-1.62, 0.4],
  [1.62, 0.4],
  [0, 0.46],
  [-0.24, 0.47],
  [0.24, 0.47],
]
const BONES: [number, number][] = [
  [1, 0],
  [1, 2],
  [1, 3],
  [2, 4],
  [3, 5],
  [4, 6],
  [5, 7],
  [1, 8],
  [8, 9],
  [8, 10],
]

function clamp01(t: number) {
  return Math.min(Math.max(t, 0), 1)
}

/** Piecewise-linear map of `p` through the keyframes, clamped at both ends. */
function ramp(p: number, at: number[], to: number[]) {
  if (p <= at[0]) return to[0]
  for (let i = 1; i < at.length; i++) {
    if (p <= at[i]) return to[i - 1] + (to[i] - to[i - 1]) * ((p - at[i - 1]) / (at[i] - at[i - 1]))
  }
  return to[to.length - 1]
}

/**
 * A tee cut from the body's own surface -- torso from collar to hem, sleeves
 * to mid upper arm -- then relaxed and eased off the skin, so it drapes over
 * the figure instead of reading as body paint or a flat overlay.
 */
function buildGarment(body: THREE.BufferGeometry, top: number, height: number) {
  const pos = body.attributes.position
  const index = body.index!
  const sx = SHOULDER.x
  const sy = top - SHOULDER.f * height
  const dx = ELBOW.x - sx
  const dy = top - ELBOW.f * height - sy
  const inside = (i: number) => {
    const x = Math.abs(pos.getX(i))
    const y = pos.getY(i)
    const f = (top - y) / height
    if (f < COLLAR_F || f > HEM_F) return false
    if (x < TORSO_HALF || f < SHOULDER.f) return true
    return ((x - sx) * dx + (y - sy) * dy) / (dx * dx + dy * dy) < SLEEVE
  }

  const positions: number[] = []
  for (let i = 0; i < index.count; i += 3) {
    const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
    if (!tri.every(inside)) continue
    for (const v of tri) positions.push(pos.getX(v), pos.getY(v), pos.getZ(v))
  }
  const soup = new THREE.BufferGeometry()
  soup.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const garment = mergeVertices(soup, 1e-4)
  soup.dispose()

  // Taubin smoothing: irons the muscle definition out of the cloth without
  // shrinking it the way plain averaging would.
  const p = garment.attributes.position.array as Float32Array
  const tris = garment.index!.array
  const n = p.length / 3
  const neighbours: Set<number>[] = Array.from({ length: n }, () => new Set())
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]]
    neighbours[a].add(b).add(c)
    neighbours[b].add(a).add(c)
    neighbours[c].add(a).add(b)
  }
  const next = new Float32Array(p.length)
  for (let pass = 0; pass < 16; pass++) {
    const k = pass % 2 === 0 ? 0.5 : -0.53
    for (let v = 0; v < n; v++) {
      let ax = 0, ay = 0, az = 0
      for (const u of neighbours[v]) {
        ax += p[u * 3]
        ay += p[u * 3 + 1]
        az += p[u * 3 + 2]
      }
      const count = neighbours[v].size || 1
      for (let c = 0; c < 3; c++) {
        const avg = [ax, ay, az][c] / count
        next[v * 3 + c] = p[v * 3 + c] + k * (avg - p[v * 3 + c])
      }
    }
    p.set(next)
  }

  garment.computeVertexNormals()
  const normal = garment.attributes.normal
  for (let v = 0; v < n; v++) {
    p[v * 3] += normal.getX(v) * EASE
    p[v * 3 + 1] += normal.getY(v) * EASE
    p[v * 3 + 2] += normal.getZ(v) * EASE
  }
  garment.computeVertexNormals()
  return garment
}

/**
 * Brushed cotton that is printed on from the top: everything above the
 * reveal line is fabric, nothing below it is drawn, and a bright seam rides
 * the line itself -- the render catching up with the body.
 */
function createFabric(reveal: { value: number }) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x2b3038,
    roughness: 0.86,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(0x9aa2ae),
    side: THREE.DoubleSide,
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = reveal
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vGarmentY;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGarmentY = position.y;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform float uReveal;
        varying float vGarmentY;
        void main() {
          if (vGarmentY < uReveal) discard;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float seam = 1.0 - smoothstep(0.0, 0.07, vGarmentY - uReveal);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.93, 0.95, 0.98), seam * 0.85);`,
      )
  }
  return material
}

export function ARAcquisition({ progress }: { progress: MotionValue<number> }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const cornersRef = useRef<SVGPathElement>(null)
  const scanRef = useRef<SVGLineElement>(null)
  const jointRefs = useRef<SVGCircleElement[]>([])
  const boneRefs = useRef<SVGLineElement[]>([])

  useEffect(() => {
    const host = hostRef.current
    const svg = svgRef.current
    if (!host || !svg) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const canvas = renderer.domElement
    canvas.className =
      'absolute inset-0 h-full w-full mask-[linear-gradient(to_bottom,black_72%,transparent)]'
    host.prepend(canvas)

    const scene = new THREE.Scene()
    const envMap = addStudio(renderer, scene)
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100)
    const pivot = new THREE.Group()
    scene.add(pivot)

    const chrome = createChromeMaterial()
    const reveal = { value: 99 }
    const fabric = createFabric(reveal)
    const geometries: THREE.BufferGeometry[] = []
    const landmarks = JOINTS.map(() => new THREE.Vector3())
    const v = new THREE.Vector3()
    const projected = JOINTS.map(() => ({ x: 0, y: 0 }))
    let height = 0
    let collarY = 0
    let hemY = 0
    let ready = false
    let disposed = false
    let w = 0
    let h = 0

    const frame = () => {
      if (!height) return
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const figure = height * FRAME_F
      const view = Math.max(figure * 1.1, 4.0 / camera.aspect)
      const centerY = view * 0.07 - view / 2
      camera.position.set(0, centerY, view / 2 / tan + 1)
      camera.lookAt(0, centerY, 0)
    }

    const draw = () => {
      if (!ready || !w) return
      const p = progress.get()

      // Camera stage: the frame pulls focus on the figure.
      const blur = ramp(p, [0.02, CAMERA[1]], [7, 0])
      canvas.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : ''
      canvas.style.opacity = String(ramp(p, [0, 0.12], [0.25, 1]))
      svg.style.setProperty('--frame-a', String(ramp(p, [0, 0.07, CAMERA[1], POSE[1]], [0, 1, 1, 0.3])))
      scanRef.current?.setAttribute('transform', `translate(0 ${ramp(p, CAMERA, [-10, h]).toFixed(1)})`)
      scanRef.current?.style.setProperty('opacity', String(ramp(p, [0, 0.06, CAMERA[1] - 0.06, CAMERA[1]], [0, 1, 1, 0])))

      // Garment stage: collar to hem, eased so it slows into the hem.
      const t = clamp01((p - GARMENT_RANGE[0]) / (GARMENT_RANGE[1] - GARMENT_RANGE[0]))
      const eased = t * t * (3 - 2 * t)
      reveal.value = t <= 0 ? collarY + 1 : collarY + 0.05 + (hemY - 0.2 - collarY - 0.05) * eased

      renderer.render(scene, camera)

      // Pose stage: landmarks tracked on the figure as it turns, locking on
      // in sequence from the head down.
      pivot.updateMatrixWorld()
      landmarks.forEach((point, i) => {
        v.copy(point).applyMatrix4(pivot.matrixWorld).project(camera)
        projected[i].x = ((v.x + 1) / 2) * w
        projected[i].y = ((1 - v.y) / 2) * h
        const start = POSE[0] + (POSE[1] - 0.08 - POSE[0]) * (i / (JOINTS.length - 1))
        const joint = jointRefs.current[i]
        if (!joint) return
        joint.setAttribute('cx', projected[i].x.toFixed(1))
        joint.setAttribute('cy', projected[i].y.toFixed(1))
        joint.setAttribute('r', (3.2 * clamp01((p - start) / 0.08)).toFixed(2))
        joint.style.opacity = String(ramp(p, [start, start + 0.08, ...GARMENT_RANGE], [0, 1, 1, 0.3]))
      })
      BONES.forEach(([a, b], i) => {
        const bone = boneRefs.current[i]
        if (!bone) return
        const start = POSE[0] + 0.04 + (POSE[1] - 0.08 - POSE[0]) * (i / (BONES.length - 1))
        bone.setAttribute('x1', projected[a].x.toFixed(1))
        bone.setAttribute('y1', projected[a].y.toFixed(1))
        bone.setAttribute('x2', projected[b].x.toFixed(1))
        bone.setAttribute('y2', projected[b].y.toFixed(1))
        bone.style.strokeDashoffset = String(1 - clamp01((p - start) / 0.1))
        bone.style.opacity = String(ramp(p, [start, start + 0.04, ...GARMENT_RANGE], [0, 1, 1, 0.25]))
      })
    }

    const resize = () => {
      w = host.clientWidth
      h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
      // Viewfinder: four corners, not a full box, so it frames the subject
      // the way a camera does and leaves the figure unenclosed.
      const m = 10
      const l = 18
      cornersRef.current?.setAttribute(
        'd',
        `M${m} ${m + l}V${m}h${l}M${w - m - l} ${m}h${l}v${l}M${w - m} ${h - m - l}v${l}h${-l}M${m + l} ${h - m}H${m}v${-l}`,
      )
      scanRef.current?.setAttribute('x2', String(w - 14))
      frame()
      draw()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)

    loadBodyGeometry().then((geo) => {
      if (disposed) return
      const { geometry: body, height: bodyHeight } = cropFromTop(geo, MESH_F, FRAME_F)
      const top = body.boundingBox!.max.y
      const garment = buildGarment(geo, top, bodyHeight)
      // Crown at y = 0, centred on the turning axis; the garment moves with it.
      const center = body.boundingBox!.getCenter(new THREE.Vector3())
      body.translate(-center.x, -top, -center.z)
      garment.translate(-center.x, -top, -center.z)
      geometries.push(body, garment)
      pivot.add(new THREE.Mesh(body, chrome), new THREE.Mesh(garment, fabric))

      height = bodyHeight
      collarY = -COLLAR_F * height
      hemY = -HEM_F * height
      JOINTS.forEach(([x, f], i) => landmarks[i].set(x - center.x, -f * height, 0))
      ready = true
      resize()
    })

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const clock = new THREE.Clock()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      // A slow idle turn, so the garment reads as a 3D fit, not a decal.
      pivot.rotation.y = Math.sin(clock.getElapsedTime() * 0.45) * 0.35
      draw()
    }
    // Reduced motion: no turn, and a redraw only when the scroll moves it.
    const unsubscribe = reduced ? progress.on('change', draw) : () => {}
    const inView = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(raf)
      if (entry.isIntersecting && !reduced) raf = requestAnimationFrame(tick)
    })
    inView.observe(host)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      unsubscribe()
      inView.disconnect()
      resizeObserver.disconnect()
      geometries.forEach((g) => g.dispose())
      chrome.dispose()
      fabric.dispose()
      envMap.dispose()
      releaseRenderer(renderer)
    }
  }, [progress])

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label="A body is found by the camera, mapped with pose landmarks, then dressed in a rendered garment."
      className="relative mx-auto h-72 w-full sm:h-80"
    >
      <svg ref={svgRef} aria-hidden="true" className="absolute inset-0 h-full w-full text-chrome-strong" fill="none">
        <path
          ref={cornersRef}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          style={{ opacity: 'var(--frame-a, 0)' }}
        />
        <line ref={scanRef} x1="14" y1="0" x2="14" y2="0" stroke="currentColor" strokeWidth="1" style={{ opacity: 0 }} />
        {/* Tracking overlay: fixed white with a dark halo, not a theme token --
            it sits on chrome, which is the same in both themes, and a grey
            landmark on grey metal disappears. */}
        <g className="text-[#f3f4f6] filter-[drop-shadow(0_0_1px_rgb(0_0_0/0.9))_drop-shadow(0_0_3px_rgb(0_0_0/0.45))]">
          {BONES.map((_, i) => (
            <line
              key={i}
              ref={(el) => {
                if (el) boneRefs.current[i] = el
              }}
              stroke="currentColor"
              strokeWidth="1.4"
              pathLength={1}
              strokeDasharray={1}
              style={{ opacity: 0 }}
            />
          ))}
          {JOINTS.map((_, i) => (
            <circle
              key={i}
              ref={(el) => {
                if (el) jointRefs.current[i] = el
              }}
              r="0"
              fill="currentColor"
              stroke="#0c0d10"
              strokeWidth="1.2"
              style={{ opacity: 0 }}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
