import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import tshirtUrl from '../../assets/t-shirt.glb?url'
import { SpinnerIcon } from '../form/icons'
import { addStudio, loadBodyGeometry, releaseRenderer, webglSupported } from '../landing/chromeBody'
import { TryOnFlat } from './TryOnFlat'

const FOV = 30

interface TryOnStageProps {
  /** The chosen colour; the model is white, so this is a tint. */
  colorHex: string
  /** Scale of the selected size (see garmentScale). */
  scale: { x: number; y: number; z: number }
  /** Scale of the largest size: the camera is framed for it, so no size is cut off or moves the framing. */
  largest: { x: number; y: number; z: number }
  image: string
  alt: string
}

/**
 * The t-shirt over the camera feed, no body. One transparent WebGL canvas that renders only when something changes (load, size,
 * colour, resize): there is no animation loop. The shoulder line stays put, so a longer size grows downward.
 * The photo takes over if WebGL is unavailable, lost, or the model fails to load.
 */
export function TryOnStage({ colorHex, scale, largest, image, alt }: TryOnStageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const latest = useRef({ colorHex, scale, largest })
  const apply = useRef<() => void>(() => {})
  const [unavailable, setUnavailable] = useState(false)
  const [load, setLoad] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    latest.current = { colorHex, scale, largest }
    apply.current()
  }, [colorHex, scale, largest])

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
    renderer.domElement.className = 'block size-full'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const envMap = addStudio(renderer, scene)
    // Lit for chrome; a white shirt needs less or it blows out under tone mapping.
    renderer.toneMappingExposure = 0.75
    scene.environmentIntensity = 0.8
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000)
    const material = new THREE.MeshStandardMaterial({ color: latest.current.colorHex, roughness: 0.8, metalness: 0, side: THREE.DoubleSide })
    let mesh: THREE.Mesh | undefined
    let size = new THREE.Vector3()
    let top = 0
    let frame = 0
    let disposed = false

    function render() {
      frame = 0
      if (disposed || !mesh) return
      const { x, y, z } = latest.current.largest
      // Fixed for the largest size: it fits the height and the width, with its depth added so the near side is not clipped.
      const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
      const dist = Math.max((top * y * 0.55) / t, (size.x * x * 0.55) / (t * camera.aspect)) + (size.z * z) / 2
      const middle = -(top * y) / 2
      camera.position.set(0, middle, dist)
      camera.lookAt(0, middle, 0)
      renderer.render(scene, camera)
    }
    const invalidate = () => {
      if (!frame && !disposed) frame = requestAnimationFrame(render)
    }
    apply.current = () => {
      if (!mesh) return
      const { colorHex: hex, scale: s } = latest.current
      material.color.set(hex)
      mesh.scale.set(s.x, s.y, s.z)
      mesh.position.y = -top * s.y
      invalidate()
    }

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      invalidate()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    const lost = (e: Event) => {
      e.preventDefault()
      setUnavailable(true)
    }
    renderer.domElement.addEventListener('webglcontextlost', lost)
    resize()

    setLoad('loading')
    loadBodyGeometry(tshirtUrl).then(
      (geometry) => {
        if (disposed) return geometry.dispose()
        geometry.computeBoundingBox()
        const box = geometry.boundingBox!
        size = box.getSize(new THREE.Vector3())
        top = box.max.y
        mesh = new THREE.Mesh(geometry, material)
        mesh.frustumCulled = false
        scene.add(mesh)
        apply.current()
        setLoad('ready')
      },
      () => !disposed && setLoad('failed'),
    )

    return () => {
      disposed = true
      apply.current = () => {}
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('webglcontextlost', lost)
      mesh?.geometry.dispose()
      material.dispose()
      envMap.dispose()
      releaseRenderer(renderer)
    }
  }, [attempt])

  const flat = unavailable || load === 'failed'

  return (
    <>
      <div ref={hostRef} className={`absolute inset-0 ${flat ? 'invisible' : ''}`} />
      {load === 'loading' && !flat && (
        <div role="status" aria-label="Loading the 3D shirt" className="absolute inset-0 flex animate-pulse items-center justify-center">
          <SpinnerIcon size={20} className="text-kral-muted" />
        </div>
      )}
      {flat && (
        <TryOnFlat
          image={image}
          alt={alt}
          unavailable={unavailable}
          onRetry={() => {
            setUnavailable(false)
            setAttempt((n) => n + 1)
          }}
        />
      )}
    </>
  )
}
