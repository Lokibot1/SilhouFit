import { useEffect, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import tshirtUrl from '../../assets/t-shirt.glb?url'
import { sleeveRotation, sleevesOnBones } from '../../utils/arArms'
import { GARMENT_BASE, NECK_PLUG, UNDERARM_Y } from '../../utils/arGarment'
import type { Ellipse, ForearmCall } from '../../utils/arOcclude'
import { garmentTransform, maskTransform, PoseFollower, RateHealth, type MaskFrame, type Pose, type TrackStatus } from '../../utils/arPose'
import { FlipIcon, SpinnerIcon, TrackIcon } from '../form/icons'
import { addStudio, loadBodyGeometry, releaseRenderer, webglSupported } from '../landing/chromeBody'
import { KRAL_SECONDARY } from '../shop/shopControls'
import { Tooltip } from '../ui/Tooltip'
import { createTrackingPainter, type TrackingScene } from './debugDraw'
import { createDetector, startPoseLoop, type Detector } from './poseTracker'
import { TryOnFlat } from './TryOnFlat'

const FOV = 30
/** The 21 cm bar of the ?debug=ar overlay, in the drawing's own scale (relative to the reference size, so not a real ruler any more). */
const RULER_CM = 21
/** How long the ?debug=ar cue log keeps, in video time. */
const CUE_LOG_MS = 5000
/** A mask value (0..1) below this is background: the shirt is cut away there. */
const MASK_THRESHOLD = 0.4
/** Where the depth-only occluders sit: in front of the shirt (whose depth is about +-15 cm x px/cm) inside the camera's +-5000. */
const OCCLUDER_Z = 4000
/** Forearm: a plane for the shaft and a circle at each end (a scaled capsule would squash its ends). Face: one circle, scaled. */
const OCCLUDER_MESHES = 7

/** One detection's facing cues, numbers only: video ms, observed yaw (degrees), span ratio, face visibility (-1 if none), back (0/1), manual (0/1). */
interface CueSample {
  t: number
  yawDeg: number
  ratio: number
  face: number
  back: 0 | 1
  manual: 0 | 1
}
declare global {
  interface Window {
    /** Only with ?debug=ar: the last 5 s of facing cues, in memory for diagnosis. Never frames or landmarks, never sent anywhere. */
    __silhoufitCues?: CueSample[]
  }
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0
const percentile95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * 0.95))] ?? 0
const debugOverlay = () => new URLSearchParams(location.search).get('debug') === 'ar'

interface TryOnStageProps {
  /** The chosen colour; the model is white, so this is a tint. */
  colorHex: string
  /** Scale of the selected size (see garmentScale). */
  scale: { x: number; y: number; z: number }
  /** Scale of the largest size: the camera is framed for it, so no size is cut off or moves the framing. */
  largest: { x: number; y: number; z: number }
  image: string
  alt: string
  /** The camera feed, and whether it is live: the shirt follows the shoulders only while it is. */
  video: RefObject<HTMLVideoElement | null>
  live: boolean
  /** The reference size the drawing is sized by (the recommended one, else the middle one) and its scale x: that size's seams meet the shoulders. */
  refSize: string
  refScaleX: number
  /** Changed by the page to try body tracking again after it failed or was too slow. */
  trackKey: number
  /** Called when the tracking status changes, not on every frame. */
  onStatus: (status: TrackStatus) => void
}

/**
 * The t-shirt over the camera feed. One transparent WebGL canvas. Without tracking it renders only when something changes (load, size,
 * colour, resize), from a fixed camera with the shoulder line held still, so a longer size grows downward. While the camera is live it
 * follows the customer's shoulders instead: one render per new pose from the pose loop (no animation loop of its own), in an orthographic
 * camera measured in stage pixels. The photo takes over if WebGL is unavailable, lost, or the model fails to load.
 */
export function TryOnStage({ colorHex, scale, largest, image, alt, video, live, refSize, refScaleX, trackKey, onStatus }: TryOnStageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const debugText = useRef<HTMLPreElement>(null)
  const debugBar = useRef<HTMLDivElement>(null)
  const drawCanvas = useRef<HTMLCanvasElement>(null)
  /** ?debug=ar "Draw tracking": mirrored into a ref so the pose loop reads it without a re-render per frame. */
  const drawOn = useRef(false)
  const redraw = useRef<() => void>(() => {})
  const latest = useRef({ colorHex, scale, largest, refSize, refScaleX, onStatus })
  const apply = useRef<() => void>(() => {})
  const tracking = useRef<{ start: () => void; stop: () => void }>({ start: () => {}, stop: () => {} })
  /** The manual correction of the front/back facing: the running follower's flip, nothing while there is none. */
  const flipFacing = useRef<() => void>(() => {})
  const [unavailable, setUnavailable] = useState(false)
  const [load, setLoad] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [overlay] = useState(debugOverlay)
  const [drawing, setDrawing] = useState(false)

  useEffect(() => {
    latest.current = { colorHex, scale, largest, refSize, refScaleX, onStatus }
    apply.current()
  }, [colorHex, scale, largest, refSize, refScaleX, onStatus])

  useEffect(() => {
    const found = hostRef.current
    if (!found) return
    const host = found
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
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
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
    // Tracked mode: one world unit is one stage pixel, x right and y up from the top-left corner, so a pose lands where it was seen.
    const ortho = new THREE.OrthographicCamera(0, 1, 0, -1, -5000, 5000)
    const material = new THREE.MeshStandardMaterial({ color: latest.current.colorHex, roughness: 0.8, metalness: 0, side: THREE.DoubleSide })
    // The person mask cuts the shirt away outside the silhouette. A 1 x 1 texture stands in until the first mask; uMaskOn stays 0 till then.
    const maskUniforms = { uMask: { value: new THREE.DataTexture(new Uint8Array(1), 1, 1, THREE.RedFormat) }, uMaskMap: { value: new THREE.Vector4() }, uMaskOn: { value: 0 } }
    // The hem width factor (see arFitBody.ts): the body below the underarm is widened or narrowed, easing from 1 at the underarm to this at the hem.
    const hemUniforms = { uHip: { value: 1 } }
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, maskUniforms, hemUniforms)
      // After skinning, so the sleeves (which are above the underarm in the rest pose) keep following their bones.
      shader.vertexShader =
        'uniform float uHip;\n' +
        shader.vertexShader.replace(
          '#include <skinning_vertex>',
          `#include <skinning_vertex>\n  transformed.x *= 1.0 + (uHip - 1.0) * smoothstep(0.0, 1.0, clamp((${UNDERARM_Y.toFixed(1)} - position.y) / ${UNDERARM_Y.toFixed(1)}, 0.0, 1.0));`,
        )
      shader.fragmentShader =
        'uniform sampler2D uMask;\nuniform vec4 uMaskMap;\nuniform float uMaskOn;\n' +
        shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>\n  if (uMaskOn > 0.5 && texture2D(uMask, uMaskMap.xy * gl_FragCoord.xy + uMaskMap.zw).r < ${MASK_THRESHOLD.toFixed(2)}) discard;`,
        )
    }
    // Depth-only occluders: they write depth before the shirt (renderOrder -1) and no colour, so a forearm or the chin in front hides the shirt behind it.
    const occluderMaterial = new THREE.MeshBasicMaterial({ colorWrite: false })
    const planeGeometry = new THREE.PlaneGeometry(1, 1)
    const circleGeometry = new THREE.CircleGeometry(1, 24)
    const occluders = Array.from({ length: OCCLUDER_MESHES }, (_, i) => {
      const part = new THREE.Mesh(i % 3 === 0 && i < 6 ? planeGeometry : circleGeometry, occluderMaterial)
      part.renderOrder = -1
      part.visible = false
      part.frustumCulled = false
      scene.add(part)
      return part
    })
    let mesh: THREE.Mesh | undefined
    // The neck plug: a depth-only ellipse on the shirt itself, so the real neck shows through the opening instead of the inside of the back panel.
    // Single-sided, so it drops out by itself once the shirt is turned to its back (the plane faces away).
    const neck = new THREE.Mesh(circleGeometry, occluderMaterial)
    neck.position.set(NECK_PLUG.x, NECK_PLUG.y, NECK_PLUG.z)
    neck.scale.set(NECK_PLUG.rx, NECK_PLUG.ry, 1)
    neck.renderOrder = -1
    neck.visible = false
    // Root, then the sleeve on the left of the screen (-x) and on the right (+x): joints 0, 1 and 2 of the model's skin weights.
    let bones: THREE.Bone[] = []
    let skeleton: THREE.Skeleton | undefined
    let size = new THREE.Vector3()
    let top = 0
    let frame = 0
    let disposed = false

    // Tracking state. `follow` is true from the moment the model is ready until tracking stops; `pose` is the last one placed.
    const exposeAttributes = import.meta.env.DEV || debugOverlay()
    let follow = false
    let pose: Pose | null = null
    let status: TrackStatus = 'off'
    let detector: Promise<Detector> | undefined
    let stopLoop = () => {}
    let run = 0
    let renderMs: number[] = []
    let detectMs: number[] = []
    let detections = 0
    let delegate = ''
    let debugTimer = 0
    // The person mask: 'waiting' for the first one, 'on' while clipping, 'off' once the device was too busy to read it. Bytes live only in the texture.
    let maskState: 'waiting' | 'on' | 'off' = 'waiting'
    let maskTexture = maskUniforms.uMask.value
    let maskVideoW = 0
    const drawingSize = new THREE.Vector2()
    // ?debug=ar only: the 2D overlay and the last pose it drew, so switching it on paints at once.
    const painter = drawCanvas.current ? createTrackingPainter(drawCanvas.current) : null
    let drawn: TrackingScene | null = null
    const cueLog: CueSample[] | null = debugOverlay() ? (window.__silhoufitCues = []) : null
    if (exposeAttributes) host.dataset.tracking = status

    function report(next: TrackStatus) {
      if (next === status) return
      status = next
      if (exposeAttributes) host.dataset.tracking = next
      latest.current.onStatus(next)
    }

    function render() {
      frame = 0
      if (disposed || !mesh) return
      if (follow) {
        renderer.render(scene, ortho)
        return
      }
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

    function setMaskState(next: typeof maskState) {
      maskState = next
      maskUniforms.uMaskOn.value = next === 'on' ? 1 : 0
      if (exposeAttributes) host.dataset.mask = next
    }

    /** Where a drawing-buffer pixel is in the mask: depends on the stage size, the pixel ratio and the video's size. */
    function updateMaskMap() {
      const element = video.current
      if (!element?.videoWidth) return
      maskVideoW = element.videoWidth
      renderer.getDrawingBufferSize(drawingSize)
      const view = { videoW: element.videoWidth, videoH: element.videoHeight, width: host.clientWidth, height: host.clientHeight }
      maskUniforms.uMaskMap.value.set(...maskTransform(view, drawingSize.x, drawingSize.y))
    }

    function uploadMask(mask: MaskFrame) {
      if (maskTexture.image.width !== mask.width || maskTexture.image.height !== mask.height) {
        maskTexture.dispose()
        maskTexture = new THREE.DataTexture(mask.data, mask.width, mask.height, THREE.RedFormat, THREE.UnsignedByteType)
        maskTexture.minFilter = maskTexture.magFilter = THREE.LinearFilter
        maskTexture.unpackAlignment = 1
        maskUniforms.uMask.value = maskTexture
      }
      maskTexture.needsUpdate = true
      if (video.current?.videoWidth !== maskVideoW) updateMaskMap()
      setMaskState('on')
      if (exposeAttributes) {
        let person = 0
        let counted = 0
        for (let i = 0; i < mask.data.length; i += 8, counted++) if (mask.data[i] >= MASK_THRESHOLD * 255) person++
        host.dataset.maskCoverage = (person / counted).toFixed(2)
      }
    }

    /** Hides the occluders and puts them where the pose says. */
    function placeOccluders(calls: [ForearmCall | null, ForearmCall | null], face: Ellipse | null) {
      const forearms = calls.map((call) => (call?.cut ? call.capsule : null))
      forearms.forEach((c, i) => {
        const parts = occluders.slice(i * 3, i * 3 + 3)
        for (const part of parts) part.visible = !!c
        if (!c) return
        const [shaft, a, b] = parts
        const [dx, dy] = [c.b.x - c.a.x, c.b.y - c.a.y]
        shaft.position.set((c.a.x + c.b.x) / 2, -(c.a.y + c.b.y) / 2, OCCLUDER_Z)
        shaft.rotation.z = Math.atan2(-dy, dx)
        shaft.scale.set(Math.hypot(dx, dy), 2 * c.radius, 1)
        a.position.set(c.a.x, -c.a.y, OCCLUDER_Z)
        b.position.set(c.b.x, -c.b.y, OCCLUDER_Z)
        a.scale.setScalar(c.radius)
        b.scale.setScalar(c.radius)
      })
      const head = occluders[6]
      head.visible = !!face
      if (face) {
        head.position.set(face.x, -face.y, OCCLUDER_Z)
        head.rotation.z = -face.tilt
        head.scale.set(face.rx, face.ry, 1)
      }
      if (exposeAttributes) host.dataset.occluders = [...forearms, face].map((o) => (o ? 1 : 0)).join(',')
    }

    function paintTracking() {
      if (drawOn.current && drawn) painter?.draw(drawn)
      else painter?.clear()
    }
    redraw.current = paintTracking

    /** Puts the mesh on the last pose, at the selected size. */
    function place() {
      if (!mesh || !pose) return
      const t = garmentTransform(pose, latest.current.scale)
      mesh.position.set(t.x, t.y, 0)
      // Yaw about the shirt's own vertical axis, then the lean about the screen's x axis (it is measured from the camera's world z, not the body's),
      // then roll about the screen axis. Without a lean this is the same as roll after yaw.
      mesh.rotation.set(t.rotationX, t.rotationY, t.rotationZ, 'ZXY')
      hemUniforms.uHip.value = pose.fit.hip
      mesh.scale.set(t.scale.x, t.scale.y, t.scale.z)
      neck.visible = true
      const [onLeft, onRight] = sleevesOnBones(pose.sleeves, pose.facing === 'back')
      bones[1].rotation.z = sleeveRotation(onLeft, -1)
      bones[2].rotation.z = sleeveRotation(onRight, 1)
      placeOccluders(pose.occluders.forearms, pose.occluders.face)
      if (exposeAttributes) {
        const deg = (rad: number) => ((rad * 180) / Math.PI).toFixed(1)
        host.dataset.garment = [Math.round(t.x), Math.round(-t.y), deg(t.rotationZ), deg(t.rotationY), pose.pxPerCm.toFixed(2), Math.round(t.widthPx)].join(',')
        // The arm angles themselves (from hanging straight down), not the bone turns, by screen side.
        host.dataset.fit = [pose.fit.vy.toFixed(2), pose.fit.hip.toFixed(2), deg(pose.fit.pitch)].join(',')
        host.dataset.sleeves = pose.sleeves.map((a) => Math.round((a * 180) / Math.PI)).join(',')
        host.dataset.facing = pose.facing
        host.dataset.facingSource = pose.cues.source
        host.dataset.refSize = latest.current.refSize
      }
    }

    apply.current = () => {
      if (!mesh) return
      const { colorHex: hex, scale: s } = latest.current
      material.color.set(hex)
      if (follow) place()
      else {
        mesh.rotation.set(0, 0, 0)
        mesh.scale.set(s.x, s.y, s.z)
        mesh.position.set(0, -top * s.y, 0)
        for (const bone of bones) bone.rotation.z = 0
      }
      invalidate()
    }

    /** Back to the fixed preview. */
    function leave(next: TrackStatus) {
      follow = false
      pose = null
      drawn = null
      painter?.clear()
      flipFacing.current = () => {}
      for (const part of occluders) part.visible = false
      neck.visible = false
      setMaskState('waiting')
      renderer.domElement.style.opacity = ''
      if (exposeAttributes) {
        delete host.dataset.garment
        delete host.dataset.sleeves
        delete host.dataset.fit
        delete host.dataset.facing
        delete host.dataset.facingSource
        delete host.dataset.refSize
        delete host.dataset.occluders
        delete host.dataset.mask
        delete host.dataset.maskCoverage
      }
      report(next)
      apply.current()
    }

    function writeDebug() {
      if (!debugText.current || !debugBar.current) return
      const rendered = renderMs.length
      const deg = (rad: number) => Math.round((rad * 180) / Math.PI)
      const cues = pose?.cues
      const fit = pose?.fit
      const hem = pose ? garmentTransform(pose, latest.current.scale) : null
      debugText.current.textContent = [
        `detect ${median(detectMs).toFixed(1)} / ${percentile95(detectMs).toFixed(1)} ms (median / p95)`,
        `render ${median(renderMs).toFixed(1)} ms (${rendered}/s)`,
        `tracking ${detections}/s on ${delegate}`,
        `ref size ${latest.current.refSize}, joint span ${cues ? Math.round(cues.spanPx) : '-'} px, px/cm ${pose ? pose.pxPerCm.toFixed(2) : '-'}`,
        `hips ${fit?.hips ?? '-'}, torso ${fit?.torsoPx != null ? Math.round(fit.torsoPx) : '-'} px, ratio ${fit ? fit.vy.toFixed(2) : '-'}, hip ${fit ? fit.hip.toFixed(2) : '-'}, pitch ${fit ? deg(fit.pitch) : '-'}`,
        `hem y ${hem ? Math.round(-hem.y) : '-'} vs hip y ${fit?.hipY != null ? Math.round(fit.hipY) : '-'}${hem && fit?.hipY != null ? ` (${Math.round(-hem.y - fit.hipY)} px below)` : ''}`,
        `yaw ${pose && cues ? `${deg(cues.yaw)} seen, ${deg(pose.yaw)} shown` : '-'}`,
        `span ${cues ? cues.ratio.toFixed(2) : '-'} face ${cues?.face?.toFixed(2) ?? '-'}`,
        `facing ${pose && cues ? `${pose.facing} (${cues.source}) by ${cues.reason ?? 'default'}` : '-'}`,
        `mask ${maskState} ${maskState === 'waiting' ? '-' : `${maskTexture.image.width}x${maskTexture.image.height}`}`,
      ].join('\n')
      debugBar.current.style.width = `${pose ? Math.round(RULER_CM * pose.pxPerCm) : 0}px`
      renderMs = []
      detectMs = []
      detections = 0
    }

    function startTracking() {
      const element = video.current
      if (!element || disposed) return
      const mine = ++run
      report('loading')
      detector ??= createDetector()
      detector.then(
        (d) => {
          if (disposed || mine !== run) return
          const health = new RateHealth(coarse, true)
          const follower = new PoseFollower()
          flipFacing.current = () => follower.flip()
          let placed: Pose | null = null
          delegate = d.delegate
          follow = true
          pose = null
          setMaskState('waiting')
          renderer.domElement.style.opacity = '0'
          report('lost')
          stopLoop = startPoseLoop(
            element,
            d,
            health,
            (result, tMs, took) => {
              detectMs.push(took)
              detections += 1
              const view = { videoW: element.videoWidth, videoH: element.videoHeight, width: host.clientWidth, height: host.clientHeight }
              const out = follower.update(
                result,
                tMs,
                view,
                latest.current.refScaleX,
                reduceMotion.matches,
              )
              if (health.slow) {
                stopLoop()
                leave('slow')
                return
              }
              // No body keeps the last mask, so the hold and fade still show the shirt; a busy device drops it for good.
              if (!health.mask) setMaskState('off')
              else if (result?.mask && out.pose) uploadMask(result.mask)
              renderer.domElement.style.opacity = String(reduceMotion.matches && out.opacity < 1 ? 0 : out.opacity)
              if (out.pose && out.pose !== placed) {
                placed = out.pose
                pose = out.pose
                if (cueLog) {
                  const c = out.pose.cues
                  cueLog.push({ t: Math.round(tMs), yawDeg: Math.round((c.yaw * 180) / Math.PI), ratio: Math.round(c.ratio * 100) / 100, face: c.face ?? -1, back: out.pose.facing === 'back' ? 1 : 0, manual: c.source === 'manual' ? 1 : 0 })
                  while (cueLog[0].t < tMs - CUE_LOG_MS) cueLog.shift()
                }
                place()
                if (painter && result) {
                  const t = garmentTransform(out.pose, latest.current.scale)
                  drawn = { frame: result, pose: out.pose, view, seamHalf: (GARMENT_BASE.shoulder / 2) * latest.current.scale.x * out.pose.pxPerCm, hem: { x: t.x, y: -t.y, half: (GARMENT_BASE.chest / 2) * t.scale.x * out.pose.fit.hip } }
                  paintTracking()
                }
                const start = performance.now()
                if (frame) cancelAnimationFrame(frame)
                render()
                renderMs.push(performance.now() - start)
              } else if (!out.pose && drawn) {
                drawn = null
                paintTracking()
              }
              report(out.state)
            },
            () => fail(d),
          )
        },
        () => {
          detector = undefined
          if (!disposed && mine === run) leave('failed')
        },
      )
    }

    function fail(d: Detector) {
      stopLoop()
      d.close()
      detector = undefined
      leave('failed')
    }

    function stopTracking() {
      run += 1
      stopLoop()
      stopLoop = () => {}
      if (follow || status !== 'off') leave('off')
    }
    tracking.current = { start: startTracking, stop: stopTracking }
    if (debugOverlay()) debugTimer = window.setInterval(writeDebug, 1000)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      ortho.right = w
      ortho.bottom = -h
      ortho.updateProjectionMatrix()
      if (drawCanvas.current) {
        const dpr = Math.min(window.devicePixelRatio, 2)
        drawCanvas.current.width = Math.round(w * dpr)
        drawCanvas.current.height = Math.round(h * dpr)
        paintTracking()
      }
      updateMaskMap()
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
        let skinned: THREE.SkinnedMesh
        try {
          if (!geometry.attributes.skinIndex || !geometry.attributes.skinWeight) throw new Error('The shirt model has no skin weights')
          // Bones sit at the shoulder joints in the model's own space; the mesh is bound while it is still untransformed.
          const { x, y } = GARMENT_BASE.sleevePivot
          const [root, left, right] = [new THREE.Bone(), new THREE.Bone(), new THREE.Bone()]
          left.position.set(-x, y, 0)
          right.position.set(x, y, 0)
          root.add(left, right)
          skinned = new THREE.SkinnedMesh(geometry, material)
          skinned.add(root)
          bones = [root, left, right]
          skeleton = new THREE.Skeleton(bones)
          skinned.bind(skeleton)
        } catch {
          skeleton?.dispose()
          skeleton = undefined
          bones = []
          geometry.dispose()
          setLoad('failed')
          return
        }
        geometry.computeBoundingBox()
        const box = geometry.boundingBox!
        size = box.getSize(new THREE.Vector3())
        top = box.max.y
        mesh = skinned
        mesh.add(neck)
        mesh.frustumCulled = false
        scene.add(mesh)
        apply.current()
        setLoad('ready')
      },
      () => !disposed && setLoad('failed'),
    )

    return () => {
      disposed = true
      stopTracking()
      tracking.current = { start: () => {}, stop: () => {} }
      detector?.then(
        (d) => d.close(),
        () => {},
      )
      clearInterval(debugTimer)
      if (cueLog) delete window.__silhoufitCues
      apply.current = () => {}
      redraw.current = () => {}
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('webglcontextlost', lost)
      mesh?.geometry.dispose()
      skeleton?.dispose()
      material.dispose()
      maskTexture.dispose()
      occluderMaterial.dispose()
      planeGeometry.dispose()
      circleGeometry.dispose()
      envMap.dispose()
      releaseRenderer(renderer)
    }
  }, [attempt, video])

  const flat = unavailable || load === 'failed'

  // Pausing the camera stops the loop but keeps the loaded model, so resuming is quick. The photo has nothing to follow, so no tracking then.
  useEffect(() => {
    if (!live || flat) return
    tracking.current.start()
    return () => {
      tracking.current.stop()
      setDrawing(false)
    }
  }, [live, flat, trackKey, attempt])

  useEffect(() => {
    drawOn.current = drawing
    redraw.current()
  }, [drawing])

  return (
    <>
      <div ref={hostRef} className={`absolute inset-0 ${flat ? 'invisible' : ''}`} />
      {load === 'loading' && !flat && (
        <div role="status" aria-label="Loading the 3D shirt" className="absolute inset-0 flex animate-pulse items-center justify-center">
          <SpinnerIcon size={20} className="text-kral-muted" />
        </div>
      )}
      {overlay && <canvas ref={drawCanvas} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />}
      {overlay && (
        <div aria-hidden="true" className="font-kral-mono pointer-events-none absolute bottom-16 left-3 max-w-[calc(100%-1.5rem)] overflow-hidden bg-kral-bg/85 p-2 text-base text-kral-fg">
          <pre ref={debugText} className="whitespace-pre" />
          <div ref={debugBar} className="mt-1 h-2 bg-kral-fg" />
        </div>
      )}
      {live && !flat && load === 'ready' && (
        <div className="absolute right-3 bottom-16 flex flex-col items-end gap-2">
          {overlay && (
            <Tooltip tone="kral" label="Draw tracking">
              <button
                type="button"
                aria-label="Draw tracking"
                aria-pressed={drawing}
                onClick={() => setDrawing((on) => !on)}
                className={`${KRAL_SECONDARY} w-11 px-0! backdrop-blur-sm ${drawing ? 'bg-kral-fg! text-kral-bg!' : 'bg-kral-bg/85'}`}
              >
                <TrackIcon size={20} />
              </button>
            </Tooltip>
          )}
          <Tooltip tone="kral" label="Flip front/back">
            <button type="button" aria-label="Flip front/back" onClick={() => flipFacing.current()} className={`${KRAL_SECONDARY} w-11 px-0! bg-kral-bg/85 backdrop-blur-sm`}>
              <FlipIcon size={20} />
            </button>
          </Tooltip>
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
