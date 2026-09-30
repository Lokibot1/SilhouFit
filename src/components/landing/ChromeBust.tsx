import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { addStudio, createChromeMaterial, cropFromTop, loadBodyGeometry } from './chromeBody'
import { SilhouetteMark } from './SilhouetteMark'

// A tailor's mannequin, chest to crown, as (half-width, height, half-depth)
// cross-sections. A revolved profile can't do this: shoulders are wide and
// shallow while the head is narrow and deep, so width and depth run separately.
// The slope from neck to shoulder tip is spread over several stations -- that
// is the trapezius, and without it the shoulders read as a shelf.
const STATIONS = [
  [1.1, -1.8, 0.6], [1.2, -0.6, 0.66], [1.36, 0.1, 0.62], [1.5, 0.5, 0.55],
  [1.34, 0.74, 0.48], [0.9, 0.9, 0.4], [0.45, 1.0, 0.34], [0.3, 1.1, 0.3],
  [0.27, 1.4, 0.29], [0.3, 1.52, 0.34], [0.38, 1.62, 0.44], [0.44, 1.85, 0.5],
  [0.46, 2.1, 0.52], [0.42, 2.35, 0.48], [0.3, 2.55, 0.36], [0.12, 2.68, 0.16],
  [0, 2.72, 0],
] as const

const ROWS = 220
const COLS = 128

function buildBust() {
  const spine = new THREE.CatmullRomCurve3(
    STATIONS.map(([w, y, d]) => new THREE.Vector3(w, y, d)),
    false,
    'centripetal',
  )
  // Arc-length spacing, so the tight curves at the jaw and shoulders get as
  // many rows as the long straight run of the chest.
  const samples = spine.getSpacedPoints(ROWS)

  const positions: number[] = []
  for (const { x: w, y, z: d } of samples) {
    const head = THREE.MathUtils.smoothstep(y, 1.2, 1.7)
    // Squarer through the torso, a true ellipse for the head; the head also
    // sits a little forward of the neck, as a real one does.
    const e = 2 / THREE.MathUtils.lerp(2.5, 2, head)
    const forward = head * 0.1
    for (let c = 0; c < COLS; c++) {
      const a = (c / COLS) * Math.PI * 2
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      positions.push(
        w * Math.sign(cos) * Math.abs(cos) ** e,
        y,
        d * Math.sign(sin) * Math.abs(sin) ** e + forward,
      )
    }
  }

  // Columns wrap modulo COLS rather than duplicating a seam vertex, so the
  // normals stay continuous and the chrome shows no line down the back.
  const index: number[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = r * COLS + c
      const b = r * COLS + ((c + 1) % COLS)
      index.push(a, a + COLS, b, b, a + COLS, b + COLS)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

// Head, shoulders, arms and upper chest: the part of the figure that is
// framed, as a fraction of its standing height. The mesh is kept further down
// than that, so the scroll parallax lifting the figure never exposes the cut.
const BUST_FRACTION = 0.36
const MESH_FRACTION = 0.5
// Where the head hinges on the neck, again as fractions of standing height
// down from the crown: fully turning above the chin, fixed below the collar.
const CHIN_FRACTION = 0.12
const COLLAR_FRACTION = 0.165

/** Head/neck hinge, in the figure's local space (crown at y = 0). */
type Neck = { chin: number; collar: number }

// The fallback bust's neck, in the same local space.
const FALLBACK_NECK: Neck = { chin: -1.2, collar: -1.65 }

/**
 * Bends the head toward the pointer without a skeleton. Each vertex turns by
 * the head rotation scaled by how far above the collar it sits, so the neck
 * twists smoothly instead of the head shearing off at a seam. Normals get the
 * same matrix, so the reflections follow the turn.
 */
function addHeadTurn(material: THREE.Material, headRot: THREE.Matrix3, neck: Neck) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHeadRot = { value: headRot }
    shader.uniforms.uNeck = { value: new THREE.Vector2(neck.collar, neck.chin) }
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `uniform mat3 uHeadRot;
        uniform vec2 uNeck;
        void main() {`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `float headW = smoothstep(uNeck.x, uNeck.y, position.y);
        mat3 headM = mat3(1.0) + (uHeadRot - mat3(1.0)) * headW;
        vec3 objectNormal = headM * vec3(normal);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 hinge = vec3(0.0, uNeck.x, 0.0);
        vec3 transformed = headM * (position - hinge) + hinge;`,
      )
  }
}

/**
 * The hero's figure: a polished chrome bust whose head turns to watch the
 * cursor, the torso following only a little.
 * Chrome is almost entirely reflection, so the environment map does the work --
 * the lights only add the hard specular glints along the shoulders.
 */
export function ChromeBust({ className = '' }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setFailed(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.setAttribute('aria-hidden', 'true')
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const envMap = addStudio(renderer, scene)

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)

    const material = createChromeMaterial()
    // The pointer turns this pivot; whichever figure ends up in it -- the
    // scanned body or the fallback -- is centred on the pivot's axis.
    const pivot = new THREE.Group()
    scene.add(pivot)
    let geometry: THREE.BufferGeometry | undefined
    const size = new THREE.Vector3()
    const headRot = new THREE.Matrix3()
    const headEuler = new THREE.Euler(0, 0, 0, 'YXZ')
    const headPoint = new THREE.Vector3()
    let neck: Neck | undefined

    const render = () => renderer.render(scene, camera)

    // A portrait crop: the crown just under the top edge and the body running
    // off the bottom, arms free to reach past the sides. On a wide canvas the
    // figure is set right of centre, leaving the left for the copy it passes
    // under; the camera slides left rather than the figure moving, so the
    // figure still turns about its own axis.
    const frameFigure = () => {
      if (!size.y) return
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const view = size.y * 0.8
      const centerY = view * 0.06 - view / 2
      const shiftX = camera.aspect > 1 ? view * camera.aspect * 0.18 : 0
      camera.position.set(-shiftX, centerY, view / 2 / tan + size.z / 2)
      camera.lookAt(-shiftX, centerY, 0)
    }

    const show = (geo: THREE.BufferGeometry, figureNeck: Neck) => {
      geometry = geo
      neck = figureNeck
      addHeadTurn(material, headRot, figureNeck)
      if (!geo.boundingBox) geo.computeBoundingBox()
      const box = geo.boundingBox!.clone()
      box.getSize(size)
      // Crown at y = 0, centred on the turning axis.
      const center = box.getCenter(new THREE.Vector3())
      geo.translate(-center.x, -box.max.y, -center.z)
      pivot.add(new THREE.Mesh(geo, material))
      frameFigure()
      render()
      renderer.domElement.style.opacity = '1'
    }

    renderer.domElement.style.opacity = '0'
    renderer.domElement.style.transition = 'opacity 0.7s ease'
    let disposed = false
    loadBodyGeometry().then(
      (geo) => {
        if (disposed) return
        const bust = cropFromTop(geo, MESH_FRACTION, BUST_FRACTION)
        show(
          bust.geometry,
          { chin: -bust.height * CHIN_FRACTION, collar: -bust.height * COLLAR_FRACTION },
        )
      },
      () => !disposed && show(buildBust(), FALLBACK_NECK),
    )

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      frameFigure()
      render()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Pointer in the canvas's own clip space, so it can be compared directly
    // with where the head is drawn. Starts level with the head: looking ahead.
    const pointer = { x: 0, y: 0, seen: false }
    const onPointerMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      pointer.seen = true
    }

    let frame = 0
    const clock = new THREE.Clock()
    const tick = () => {
      const t = clock.getElapsedTime()
      let lookX = 0
      let lookY = 0
      if (neck && pointer.seen) {
        // Aim from where the face actually is on screen, so the head looks
        // *at* the cursor rather than just leaning toward a screen side.
        headPoint.set(0, (neck.chin * 3) / 4, 0).applyMatrix4(pivot.matrixWorld)
        headPoint.project(camera)
        lookX = THREE.MathUtils.clamp(pointer.x - headPoint.x, -1.2, 1.2)
        lookY = THREE.MathUtils.clamp(pointer.y - headPoint.y, -1, 1)
      }
      // The head does most of the turning; the torso follows a fraction of it,
      // with a slow idle sway so it never sits dead still on touch screens.
      const bodyYaw = lookX * 0.18 + Math.sin(t * 0.4) * 0.06
      pivot.rotation.y += (bodyYaw - pivot.rotation.y) * 0.05
      headEuler.y += (lookX * 0.55 - headEuler.y) * 0.08
      headEuler.x += (-lookY * 0.35 - headEuler.x) * 0.08
      headRot.setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(headEuler))
      render()
      frame = requestAnimationFrame(tick)
    }

    // Only spend frames while the hero is on screen.
    const inView = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame)
      if (entry.isIntersecting && !reduced) frame = requestAnimationFrame(tick)
    })
    inView.observe(host)
    if (!reduced) window.addEventListener('pointermove', onPointerMove)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      inView.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      geometry?.dispose()
      material.dispose()
      envMap.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  if (failed) {
    return <SilhouetteMark className={`${className} text-fg-muted`} />
  }
  return <div ref={hostRef} className={className} />
}
