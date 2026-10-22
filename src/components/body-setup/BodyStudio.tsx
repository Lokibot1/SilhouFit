import { animate } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import femaleUrl from '../../assets/female_body.glb?url'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import type { BodyBuildId, BodyModelId } from '../../service/bodyProfile'
import { ChevronLeftIcon, ChevronRightIcon, RulerIcon, SpinnerIcon } from '../form/icons'
import { addStudio, createChromeMaterial, loadBodyGeometry, releaseRenderer, webglSupported } from '../landing/chromeBody'
import { Tooltip } from '../ui/Tooltip'
import { applyMeasurements, lerpValue, type BodyBounds, type Deformed } from './deformBody'
import { SPECS, type Entered, type Field } from './measurements'
import { StudioFlat, StudioFrame } from './StudioFallback'

// The tape and the highlighted band share one accent so they read the same in both themes.
const TAPE = 0xffc83d
const FOV = 30
const ROTATE_STEP = Math.PI / 8
// A solid canvas backing and a muted-text outline keep the arrows 3:1 against both the chrome body and the page in either theme.
const ROTATE_BUTTON =
  'font-ui flex size-11 cursor-pointer items-center justify-center rounded-xl border-2 border-fg-muted bg-canvas/85 text-fg backdrop-blur-sm hover:border-fg hover:bg-canvas'

interface BodyStudioProps {
  model: BodyModelId
  build: BodyBuildId | null
  /** Canonical cm (kg for weight) for each field the user has filled in. */
  cm: Entered
  /** The field being measured, or null for the whole body. */
  focus: Field | null
  reduced: boolean
  className?: string
}

interface Scene3D {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  pivot: THREE.Group
  tape: THREE.Group
  material: THREE.MeshPhysicalMaterial
  band: THREE.Vector2
  mesh?: THREE.Mesh
  base?: Float32Array
  bounds?: BodyBounds
  deformed?: Deformed
  invalidate: () => void
  /** Re-deform on the next frame. */
  deform: () => void
}

/**
 * The avatar. One WebGL context for the whole setup: it is driven by props and swaps geometry when the model changes.
 * A flat silhouette with a band takes over if WebGL is unavailable, lost, or the model fails to load.
 */
export function BodyStudio({ model, build, cm, focus, reduced, className = '' }: BodyStudioProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const ctx = useRef<Scene3D | null>(null)
  const latest = useRef({ model, build, cm, focus, reduced })
  const [unavailable, setUnavailable] = useState(false)
  const [load, setLoad] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    latest.current = { model, build, cm, focus, reduced }
    ctx.current?.deform()
  }, [model, build, cm, focus, reduced])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Probing first keeps the console free of three's own errors on a device with no WebGL.
    if (!webglSupported()) {
      setUnavailable(true)
      return
    }
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setUnavailable(true)
      return
    }
    const coarse = window.matchMedia('(pointer: coarse)').matches
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2))
    renderer.domElement.setAttribute('aria-hidden', 'true')
    renderer.domElement.className = 'block size-full touch-pan-y'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const envMap = addStudio(renderer, scene)
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000)
    const material = createChromeMaterial()
    const band = new THREE.Vector2(1e9, -1e9)
    const feather = { value: 0 }
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBand = { value: band }
      shader.uniforms.uFeather = feather
      shader.uniforms.uTape = { value: new THREE.Color(TAPE) }
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying float vBandY;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBandY = transformed.y;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          'varying float vBandY;\nuniform vec2 uBand;\nuniform float uFeather;\nuniform vec3 uTape;\nvoid main() {',
        )
        .replace(
          '#include <dithering_fragment>',
          `float inBand = smoothstep(uBand.x - uFeather, uBand.x, vBandY) * (1.0 - smoothstep(uBand.y, uBand.y + uFeather, vBandY));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uTape, inBand * 0.6);
          #include <dithering_fragment>`,
        )
    }

    const pivot = new THREE.Group()
    const tape = new THREE.Group()
    pivot.add(tape)
    scene.add(pivot)

    // One ring and one line are reused for every field.
    const ringGeometry = new THREE.TorusGeometry(1, 0.02, 8, 72).rotateX(Math.PI / 2)
    const tapeMaterial = new THREE.MeshBasicMaterial({ color: TAPE, depthTest: false, transparent: true })
    const ring = new THREE.Mesh(ringGeometry, tapeMaterial)
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    const lineMaterial = new THREE.LineBasicMaterial({ color: TAPE, depthTest: false })
    const line = new THREE.Line(lineGeometry, lineMaterial)
    const capGeometry = new THREE.SphereGeometry(1, 12, 8)
    const caps = [new THREE.Mesh(capGeometry, tapeMaterial), new THREE.Mesh(capGeometry, tapeMaterial)]
    for (const o of [ring, line, ...caps]) {
      o.renderOrder = 10
      o.frustumCulled = false
      o.visible = false
      tape.add(o)
    }

    // Camera: look at (0, y, 0) from `dist` away. Goals are tweened; a reduced-motion user jumps.
    const view = { y: 0, dist: 10 }
    let goalKey = ''
    let tween: { stop: () => void } | undefined
    let azimuth = 0
    let frame = 0
    let visible = true
    let dirty = false
    let deforming = false
    let disposed = false

    function render() {
      frame = 0
      if (disposed || !visible || document.hidden || !dirty) return
      dirty = false
      if (deforming) deformNow()
      pivot.rotation.y = azimuth
      // Slightly above the target, so a girth ring reads as a ring and not an edge-on line.
      camera.position.set(0, view.y + view.dist * 0.16, view.dist)
      camera.lookAt(0, view.y, 0)
      renderer.render(scene, camera)
    }
    const invalidate = () => {
      dirty = true
      if (!frame && !disposed) frame = requestAnimationFrame(render)
    }

    const state: Scene3D = {
      renderer, scene, camera, pivot, tape, material, band,
      invalidate,
      deform() {
        deforming = true
        invalidate()
      },
    }
    ctx.current = state

    function goal(deformed: Deformed, bounds: BodyBounds, focusField: Field | null) {
      const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
      const top = deformed.topY - bounds.minY
      const aspect = camera.aspect || 1
      const full = { y: bounds.minY + top / 2, dist: Math.max((top * 0.56) / t, (top * 0.44) / (t * aspect)) }
      const region = focusField ? deformed.regions[focusField] : undefined
      if (!region || focusField === 'height') return full
      const span = region.y1 - region.y0
      const wide = region.ring
        ? region.ring.rx * 2.6
        : Math.max(Math.abs(region.line?.to[0] ?? 0), Math.abs(region.line?.from[0] ?? 0)) * 2.3
      const viewHeight = Math.max(top * 0.34, span * 1.5)
      return {
        y: (region.y0 + region.y1) / 2,
        dist: Math.max((viewHeight * 0.5) / t, wide / (2 * t * aspect)),
      }
    }

    function showTape(deformed: Deformed, focusField: Field | null) {
      const region = focusField ? deformed.regions[focusField] : undefined
      ring.visible = line.visible = caps[0].visible = caps[1].visible = false
      if (!region) {
        band.set(1e9, -1e9)
        return
      }
      // Only a girth highlights a band of the body; a length is shown by its tape alone.
      if (region.ring) band.set(region.y0, region.y1)
      else band.set(1e9, -1e9)
      if (region.ring) {
        const r = region.ring
        ring.visible = true
        ring.position.set(r.cx, r.y, r.cz)
        ring.scale.set(r.rx * 1.03, ((r.rx + r.rz) / 2) * 1.03, r.rz * 1.03)
      } else if (region.line) {
        const { from, to } = region.line
        line.visible = true
        line.geometry.setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)])
        const size = Math.max(0.006 * (deformed.topY - (state.bounds?.minY ?? 0)), 1e-6)
        caps.forEach((cap, i) => {
          cap.visible = true
          cap.position.set(...(i ? to : from))
          cap.scale.setScalar(size)
        })
      }
    }

    // The body eases from the shape on screen to the new one; the tape follows the same blend. Buffers belong to one mesh.
    let morph: { mesh: THREE.Mesh; target: Float32Array; from: Float32Array; shown?: Deformed; run?: { stop: () => void } } | undefined

    function deformNow() {
      deforming = false
      const { base, bounds, mesh } = state
      if (!base || !bounds || !mesh) return
      const next = latest.current
      const position = mesh.geometry.attributes.position as THREE.BufferAttribute
      const shownPositions = position.array as Float32Array
      if (morph?.mesh !== mesh) {
        morph?.run?.stop()
        morph = { mesh, target: new Float32Array(base.length), from: new Float32Array(base.length) }
      }
      const m = morph
      m.run?.stop()
      const aim = applyMeasurements(base, m.target, bounds, next.cm, next.build)
      const paint = (shown: Deformed) => {
        m.shown = state.deformed = shown
        position.needsUpdate = true
        mesh.geometry.computeVertexNormals()
        feather.value = (shown.topY - bounds.minY) * 0.01
        showTape(shown, next.focus)
      }

      if (!m.shown || next.reduced || shownPositions.every((v, i) => v === m.target[i])) {
        shownPositions.set(m.target)
        paint(aim)
      } else {
        m.from.set(shownPositions)
        const was = m.shown
        m.run = animate(0, 1, {
          duration: DURATION.shift,
          ease: EASE_OUT,
          onUpdate: (p) => {
            if (disposed || state.mesh !== mesh) return
            for (let i = 0; i < shownPositions.length; i++) {
              shownPositions[i] = m.from[i] + (m.target[i] - m.from[i]) * p
            }
            paint(lerpValue(was, aim, p))
            invalidate()
          },
          onComplete: () => (m.run = undefined),
        })
      }

      const key = `${next.model}|${next.focus}|${camera.aspect.toFixed(2)}`
      const to = goal(aim, bounds, next.focus)
      if (key === goalKey || !goalKey) {
        goalKey = key
        if (!tween) Object.assign(view, to)
        return
      }
      goalKey = key
      tween?.stop()
      if (next.reduced) {
        Object.assign(view, to)
        return
      }
      const from = { ...view }
      tween = animate(0, 1, {
        duration: DURATION.shift,
        ease: EASE_OUT,
        onUpdate: (p) => {
          view.y = from.y + (to.y - from.y) * p
          view.dist = from.dist + (to.dist - from.dist) * p
          invalidate()
        },
        onComplete: () => (tween = undefined),
      })
    }

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      goalKey = ''
      state.deform()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)

    const inView = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) invalidate()
    })
    inView.observe(host)
    const onVisibility = () => !document.hidden && invalidate()
    document.addEventListener('visibilitychange', onVisibility)

    // Drag turns the body around its vertical axis only.
    let dragX: number | null = null
    const canvas = renderer.domElement
    const down = (e: PointerEvent) => {
      dragX = e.clientX
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (dragX === null) return
      azimuth += (e.clientX - dragX) * 0.01
      dragX = e.clientX
      invalidate()
    }
    const up = () => (dragX = null)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    const lost = (e: Event) => {
      e.preventDefault()
      setUnavailable(true)
    }
    canvas.addEventListener('webglcontextlost', lost)
    const rotate = (event: Event) => {
      azimuth += (event as CustomEvent<number>).detail
      invalidate()
    }
    host.addEventListener('studio-rotate', rotate)
    resize()

    return () => {
      disposed = true
      ctx.current = null
      cancelAnimationFrame(frame)
      tween?.stop()
      morph?.run?.stop()
      resizeObserver.disconnect()
      inView.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      host.removeEventListener('studio-rotate', rotate)
      canvas.removeEventListener('webglcontextlost', lost)
      state.mesh?.geometry.dispose()
      for (const g of [ringGeometry, lineGeometry, capGeometry]) g.dispose()
      for (const m of [material, tapeMaterial, lineMaterial]) m.dispose()
      envMap.dispose()
      releaseRenderer(renderer)
    }
  }, [])

  // Swap the geometry when the model changes. A load that finishes after a newer request or unmount is ignored.
  useEffect(() => {
    const state = ctx.current
    if (!state) return
    let stale = false
    setLoad('loading')
    loadBodyGeometry(model === 'female' ? femaleUrl : undefined).then(
      (geometry) => {
        if (stale) return geometry.dispose()
        geometry.computeBoundingBox()
        const { min, max } = geometry.boundingBox!
        if (state.mesh) {
          state.pivot.remove(state.mesh)
          state.mesh.geometry.dispose()
        }
        const mesh = new THREE.Mesh(geometry, state.material)
        mesh.frustumCulled = false
        state.pivot.add(mesh)
        state.mesh = mesh
        state.base = (geometry.attributes.position.array as Float32Array).slice()
        state.bounds = { model, minY: min.y, maxY: max.y }
        state.deform()
        setLoad('ready')
      },
      () => !stale && setLoad('failed'),
    )
    return () => {
      stale = true
    }
  }, [model, attempt])

  const flat = unavailable || load === 'failed'

  return (
    <StudioFrame className={className}>
      <div ref={hostRef} className={`absolute inset-0 ${flat ? 'invisible' : ''}`} />
      {load === 'loading' && !flat && (
        <div role="status" aria-label="Loading the 3D body" className="absolute inset-0 flex animate-pulse items-center justify-center">
          <SpinnerIcon size={20} className="text-fg-muted" />
        </div>
      )}
      {flat && <StudioFlat focus={focus} unavailable={unavailable} onRetry={() => setAttempt((n) => n + 1)} />}
      {focus && (
        <p className="font-ui absolute top-3 left-3 flex items-center gap-2 rounded-xl bg-canvas/80 px-3 py-1.5 text-base text-fg backdrop-blur-sm">
          <RulerIcon size={16} />
          Measuring {SPECS[focus].label.toLowerCase()}
        </p>
      )}
      {!flat && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-3">
          {([-1, 1] as const).map((dir) => (
            <Tooltip key={dir} label={dir < 0 ? 'Turn left' : 'Turn right'}>
              <button
                type="button"
                aria-label={dir < 0 ? 'Rotate the body left' : 'Rotate the body right'}
                onClick={() =>
                  hostRef.current?.dispatchEvent(new CustomEvent('studio-rotate', { detail: dir * ROTATE_STEP }))
                }
                className={ROTATE_BUTTON}
              >
                {dir < 0 ? <ChevronLeftIcon size={20} /> : <ChevronRightIcon size={20} />}
              </button>
            </Tooltip>
          ))}
        </div>
      )}
    </StudioFrame>
  )
}
