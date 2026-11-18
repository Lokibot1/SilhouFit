import { useEffect, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import tshirtUrl from '../../assets/t-shirt.glb?url'
import { sleeveRotation, sleevesOnBones } from '../../utils/arArms'
import { GARMENT_BASE, NECK_PLUG, SEAM_HEIGHT, UNDERARM_Y } from '../../utils/arGarment'
import type { Ellipse, ForearmCall } from '../../utils/arOcclude'
import { jitterPx, lagMs, speedPxS, type Sample } from '../../utils/arMeter'
import { contactShade, darkLift, EDGE_FEATHER, foldShade, grainStrength, hemGather, keyLightX, LIGHT, lightGain, LightMeter, roomTint, SHADE, sheenStrength, sheenTint, skinShadow, SleeveSway, Sway, taperFactor, trackedCamera, WEAVE, weaveTexels } from '../../utils/arLook'
import { garmentTransform, LANDMARK_FILTER, maskTransform, PoseFollower, RateHealth, type MaskFrame, type Pose, type TrackStatus } from '../../utils/arPose'
import { FlipIcon, SpinnerIcon, TrackIcon } from '../form/icons'
import { addStudio, loadBodyGeometry, releaseRenderer, webglSupported } from '../landing/chromeBody'
import { KRAL_SECONDARY } from '../shop/shopControls'
import { Tooltip } from '../ui/Tooltip'
import { createTrackingPainter, type TrackingScene } from './debugDraw'
import { sampleLight } from './lightProbe'
import { createDetector, startPoseLoop, type Detector } from './poseTracker'
import { TryOnFlat } from './TryOnFlat'

const FOV = 30
/** The 21 cm bar of the ?debug=ar overlay, in the drawing's own scale (relative to the reference size, so not a real ruler any more). */
const RULER_CM = 21
/** How long the ?debug=ar cue log keeps, in video time. */
const CUE_LOG_MS = 5000
/** The ?debug=ar jitter meter looks at the shirt anchor over this long (ms), and its lag at the speed over the last METER_SPEED_MS. */
const METER_MS = 2000
const METER_SPEED_MS = 500
/** A mask value (0..1) below this is background: the shirt is cut away there. */
const MASK_THRESHOLD = 0.4
/** The depth-only occluders sit this far (of the camera distance) in front of the shirt's farthest point, but never nearer to the camera than 15% of it. */
const OCCLUDER_GAP = 0.02
const OCCLUDER_NEAREST = 0.85
/** The cloth look. LIGHTS are the intensities at the reference room brightness (see arLook.ts for how the video scales them); tune by eye on a white and a black shirt. */
const LIGHTS = { env: 0.6, hemisphere: 0.45, key: 1.7, studio: [0.8, 0.7], exposure: 0.6 }
const FABRIC = { roughness: 0.9, sheenRoughness: 0.85, sheen: 0.35 }
/** How many times the weave tile repeats across the shirt's UVs. The UV scale of the model is not known: tune by eye on a phone (?debug=ar), too high shimmers, too low looks like a coarse net. */
const WEAVE_REPEAT = 16
/** Soft occlusion on the colour, from the rest-pose position (cm above the hem, x from the centre): the size of each patch. The strengths come from contactShade (arLook.ts). */
const AMBIENT_OCCLUSION = {
  underarm: { x: 17.5, y: UNDERARM_Y, rx: 4, ry: 5.5 },
  collar: { reach: 1.9 },
  hem: { height: 4 },
}
/** Fold normals: how far the shading normal tilts (about 0.08 is 5 degrees), and the pattern: three octaves of sines, mostly vertical folds. No texture. */
const FOLD_STRENGTH = 0.08
const FOLD_GLSL = `vec3 foldGradient(vec3 p) {
  vec3 g = cos(dot(p, vec3(0.55, 0.10, 0.35)) + 0.4) * vec3(0.55, 0.10, 0.35)
    + 0.5 * cos(dot(p, vec3(1.15, -0.30, 0.80)) + 2.1) * vec3(1.15, -0.30, 0.80)
    + 0.25 * cos(dot(p, vec3(2.30, 0.45, -1.30)) + 4.2) * vec3(2.30, 0.45, -1.30);
  return g / 1.86;
}
`
/** Where the low-frequency creases sit and how hard they bend the shading normal (screen-space bump of the crease height, in cm of the rest pose). Untuned: check on camera. */
const CREASE_BUMP = 3
/** A per-pixel hash that changes with the video time (uSeed): film grain and the dithered silhouette edge, so a replayed feed draws the same pixels. */
const HASH_GLSL = `float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float formHeight(vec3 p) {
  vec2 side = vec2(p.x < 0.0 ? uFoldArm.x : uFoldArm.y, p.x < 0.0 ? -1.0 : 1.0);
  vec2 d = p.xy - vec2(side.y * ${AMBIENT_OCCLUSION.underarm.x.toFixed(2)}, ${AMBIENT_OCCLUSION.underarm.y.toFixed(2)});
  float r = length(d);
  float arm = side.x * sin(atan(d.y, d.x) * 6.0) * smoothstep(0.0, 3.0, r) * exp(-r / 8.0);
  float chest = uFold.x * sin(p.y * 0.45 + p.x * 0.3) * (1.0 - smoothstep(10.0, 22.0, abs(p.x)));
  float drape = uFold.y * (0.6 * sin(p.x * 0.7 + 1.3) + 0.4 * sin(p.y * 0.12 + 0.5));
  return arm + chest + drape;
}
`
/** The waist's height above the hem and how wide the taper is (cm of the rest pose); the hem gathers over its lowest GATHER_BAND, pinching in by GATHER_PINCH (share of the width) and rippling by GATHER_RIPPLE (cm). Untuned: check on camera. */
const WAIST = { y: 20, spread: 9 }
const GATHER_BAND = 7
const GATHER_PINCH = 0.04
const GATHER_RIPPLE = 0.8
/** How the shadow on the person looks: the shell is the shirt pushed out by the spread; it fades to nothing at its grazing outer edge, and its patches are as wide as the shirt's own contact shading, scaled up. */
const SKIN_PATCH = { underarmScale: 2, collarReach: 2.8, hemFrom: 2.5, hemTo: 8 }
/** How often the room's brightness is read from the video while the shirt follows a person (ms). */
const LIGHT_MS = 500
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

/** Set once the device was too busy to read the person mask: later camera sessions on this page load start without it instead of hitching again 2 to 5 s in. */
let maskDroppedForLoad = false

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
  /** The selected size's waist over its chest (see waistOverChest in arLook.ts): the shirt narrows toward the waist by it. 1 is straight. */
  waistRatio: number
  /** Changed by the page to try body tracking again after it failed or was too slow. */
  trackKey: number
  /** Called when the tracking status changes, not on every frame. */
  onStatus: (status: TrackStatus) => void
}

/**
 * The t-shirt over the camera feed. One transparent WebGL canvas. Without tracking it renders only when something changes (load, size,
 * colour, resize), from a fixed camera with the shoulder line held still, so a longer size grows downward. While the camera is live it
 * follows the customer's shoulders instead: one render per new pose from the pose loop (no animation loop of its own), in a perspective
 * camera whose z = 0 plane is the stage in pixels. The photo takes over if WebGL is unavailable, lost, or the model fails to load.
 */
export function TryOnStage({ colorHex, scale, largest, image, alt, video, live, refSize, refScaleX, waistRatio, trackKey, onStatus }: TryOnStageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const debugText = useRef<HTMLPreElement>(null)
  const debugBar = useRef<HTMLDivElement>(null)
  const drawCanvas = useRef<HTMLCanvasElement>(null)
  /** ?debug=ar "Draw tracking": mirrored into a ref so the pose loop reads it without a re-render per frame. */
  const drawOn = useRef(false)
  const redraw = useRef<() => void>(() => {})
  const latest = useRef({ colorHex, scale, largest, refSize, refScaleX, waistRatio, onStatus })
  const apply = useRef<() => void>(() => {})
  const tracking = useRef<{ start: () => void; stop: () => void }>({ start: () => {}, stop: () => {} })
  /** The manual correction of the front/back facing: the running follower's flip, nothing while there is none. */
  const flipFacing = useRef<() => void>(() => {})
  const [unavailable, setUnavailable] = useState(false)
  /** The WebGL context was lost mid-session (unlike no WebGL at all): the scene can be rebuilt, see TryOnFlat. */
  const [lost, setLost] = useState(false)
  const [load, setLoad] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [overlay] = useState(debugOverlay)
  const [drawing, setDrawing] = useState(false)

  useEffect(() => {
    latest.current = { colorHex, scale, largest, refSize, refScaleX, waistRatio, onStatus }
    apply.current()
  }, [colorHex, scale, largest, refSize, refScaleX, waistRatio, onStatus])

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
    // addStudio lights a chrome figure (key from the right, rim from behind); cloth needs them much softer, with the hemisphere and a key from the upper front-left doing most of it.
    const studioLights = scene.children.slice() as THREE.DirectionalLight[]
    const hemisphere = new THREE.HemisphereLight(0xdde6f5, 0xf2dcc4, LIGHTS.hemisphere)
    const keyLight = new THREE.DirectionalLight(0xfff3e6, LIGHTS.key)
    keyLight.position.set(LIGHT.keyX, 3, 4)
    scene.add(hemisphere, keyLight)
    // The light of the room: every intensity and the exposure scale with the gain of the video's brightness (1 without a reading); see arLook.ts.
    function setLight(gain: number, keyX: number) {
      scene.environmentIntensity = LIGHTS.env * gain
      hemisphere.intensity = LIGHTS.hemisphere * gain
      keyLight.intensity = LIGHTS.key * gain
      studioLights.forEach((light, i) => (light.intensity = LIGHTS.studio[i] * gain))
      keyLight.position.x = keyX
      renderer.toneMappingExposure = LIGHTS.exposure * Math.sqrt(gain)
    }
    setLight(1, LIGHT.keyX)
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000)
    // Tracked mode: a perspective camera like the webcam's, placed so the plane z = 0 is the stage in pixels (x right and y up from the top-left corner):
    // a pose lands where it was seen, and the shirt's depth gives it the body's perspective. See trackedCamera in arLook.ts.
    const tracked = new THREE.PerspectiveCamera(FOV, 1, 1, 10000)
    let cameraDistance = 1
    let cameraVideoW = 0
    // Cloth: rough, with a soft sheen (fuzz at grazing angles) whose colour follows the shirt's and the room's, so black keeps its folds and white does not glare.
    // A tiled weave in the normal and roughness maps gives the surface a grain (generated, see weaveTexels).
    const weave = (kind: 'normal' | 'roughness') => {
      const texture = new THREE.DataTexture(weaveTexels(kind), WEAVE.size, WEAVE.size, THREE.RGBAFormat)
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(WEAVE_REPEAT, WEAVE_REPEAT)
      texture.minFilter = THREE.LinearMipmapLinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.generateMipmaps = true
      texture.needsUpdate = true
      return texture
    }
    const weaveNormal = weave('normal')
    const weaveRoughness = weave('roughness')
    const material = new THREE.MeshPhysicalMaterial({
      color: latest.current.colorHex,
      roughness: FABRIC.roughness,
      roughnessMap: weaveRoughness,
      normalMap: weaveNormal,
      metalness: 0,
      sheen: FABRIC.sheen,
      sheenRoughness: FABRIC.sheenRoughness,
      side: THREE.DoubleSide,
    })
    // The person mask cuts the shirt away outside the silhouette. A 1 x 1 texture stands in until the first mask; uMaskOn stays 0 till then.
    const maskUniforms = { uMask: { value: new THREE.DataTexture(new Uint8Array(1), 1, 1, THREE.RedFormat) }, uMaskMap: { value: new THREE.Vector4() }, uMaskOn: { value: 0 } }
    // The hem width factor (see arFitBody.ts): the body below the underarm is widened or narrowed, easing from 1 at the underarm to this at the hem.
    const hemUniforms = { uHip: { value: 1 }, uWaist: { value: 1 }, uGather: { value: 0 } }
    // How far the hem and cuffs lag the body, in the shirt's own units (cm), see arLook.ts.
    const swayUniforms = { uSway: { value: new THREE.Vector2() } }
    // The contact shading strengths (see contactShade in arLook.ts): under each sleeve joint (the -x side, then +x), and at the collar and the hem.
    const shadeUniforms = { uPit: { value: new THREE.Vector2() }, uRim: { value: new THREE.Vector2() } }
    function setShade(underarm: [number, number], collar: number, hem: number) {
      shadeUniforms.uPit.value.set(...underarm)
      shadeUniforms.uRim.value.set(collar, hem)
    }
    // Form on the cloth (see foldShade, darkLift, grainStrength in arLook.ts): crease strengths, a light lift for dark colours tinted by the room, film grain and its seed.
    const lookUniforms = { uFoldArm: { value: new THREE.Vector2() }, uFold: { value: new THREE.Vector2() }, uLift: { value: 0 }, uRoom: { value: new THREE.Vector3(1, 1, 1) }, uGrain: { value: 0 }, uSeed: { value: 0 } }
    const restShade = () => {
      setShade([SHADE.underarm, SHADE.underarm], SHADE.collar, SHADE.hem)
      lookUniforms.uFoldArm.value.set(0, 0)
      lookUniforms.uFold.value.set(0, 0)
      hemUniforms.uGather.value = 0
    }
    restShade()
    // The shadow the shirt casts on the person (see skinShadow in arLook.ts): how far it feathers out (cm of the shirt) and its strength under each sleeve joint, at the collar and at the hem.
    const skinUniforms = { uSpread: { value: 0 }, uSkinPit: { value: new THREE.Vector2() }, uSkinRim: { value: new THREE.Vector2() } }
    const f = (n: number) => n.toFixed(2)
    const underarm = f(UNDERARM_Y)
    const ao = AMBIENT_OCCLUSION
    // The shape of the shirt after skinning, shared by the shirt and its shadow so the shadow follows it exactly: the hem width, the taper to the waist, the gather
    // at the hem, and the lag of the hem and cuffs. A function of the REST position (cm), so nothing tears.
    const DEFORM_UNIFORMS = `uniform float uHip;
uniform float uWaist;
uniform float uGather;
uniform vec2 uSway;
`
    const deform = `  float hemW = smoothstep(0.0, 1.0, clamp((${underarm} - position.y) / ${underarm}, 0.0, 1.0));
  transformed.x *= 1.0 + (uHip - 1.0) * hemW;
  float waistBell = exp(-pow((position.y - ${f(WAIST.y)}) / ${f(WAIST.spread)}, 2.0)) * clamp((${underarm} - position.y) / 6.0, 0.0, 1.0);
  transformed.x *= 1.0 + (uWaist - 1.0) * waistBell;
  float hemB = 1.0 - smoothstep(0.0, ${f(GATHER_BAND)}, position.y);
  transformed.x *= 1.0 - uGather * ${f(GATHER_PINCH)} * hemB;
  transformed.yz += uGather * hemB * ${f(GATHER_RIPPLE)} * vec2(sin(position.x * 1.1 + position.z * 0.9), 0.6 * sin(position.x * 1.7 + 1.0));
  float cuffW = smoothstep(0.0, 1.0, clamp((abs(position.x) - ${f(GARMENT_BASE.sleevePivot.x - 0.6)}) / ${f(GARMENT_BASE.sleeve * 0.67)}, 0.0, 1.0));
  transformed.xy += uSway * (hemW + cuffW);`
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, maskUniforms, hemUniforms, swayUniforms, shadeUniforms, lookUniforms)
      // After skinning, so the sleeves (which are above the underarm in the rest pose) keep following their bones. Everything here is a function of the
      // REST position, so a moving sleeve does not drag the folds or the occlusion with it, and a vertex shared by two triangles moves as one (nothing tears).
      shader.vertexShader =
        `${DEFORM_UNIFORMS}varying vec3 vRest;
varying vec3 vFold;
${FOLD_GLSL}` +
        shader.vertexShader.replace(
          '#include <skinning_vertex>',
          `#include <skinning_vertex>
${deform}
  vRest = position;
  vec3 fold = foldGradient(position);
  vFold = normalize(normalMatrix * fold) * length(fold) * ${f(FOLD_STRENGTH)};`,
        )
      shader.fragmentShader =
        `uniform sampler2D uMask;
uniform vec4 uMaskMap;
uniform float uMaskOn;
uniform vec2 uPit;
uniform vec2 uRim;
uniform vec2 uFoldArm;
uniform vec2 uFold;
uniform float uLift;
uniform vec3 uRoom;
uniform float uGrain;
uniform float uSeed;
varying vec3 vRest;
varying vec3 vFold;
${HASH_GLSL}` +
        shader.fragmentShader
          .replace(
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
  // The edge of the person mask dithers over a narrow band instead of cutting, like the soft, grainy edge of the video.
  if (uMaskOn > 0.5 && smoothstep(${(MASK_THRESHOLD - EDGE_FEATHER).toFixed(2)}, ${(MASK_THRESHOLD + EDGE_FEATHER).toFixed(2)}, texture2D(uMask, uMaskMap.xy * gl_FragCoord.xy + uMaskMap.zw).r) < hash21(gl_FragCoord.xy + uSeed * vec2(17.0, 31.0))) discard;`,
          )
          // Soft occlusion on the colour: under the sleeve joints, just inside and around the collar, and a thin band at the hem.
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
  vec2 pit = vec2(abs(vRest.x) - ${f(ao.underarm.x)}, vRest.y - ${f(ao.underarm.y)}) / vec2(${f(ao.underarm.rx)}, ${f(ao.underarm.ry)});
  vec2 rim = vec2(vRest.x / ${f(NECK_PLUG.rx)}, (vRest.y - ${f(NECK_PLUG.y)}) / ${f(NECK_PLUG.ry)});
  float occlusion = (1.0 - (vRest.x < 0.0 ? uPit.x : uPit.y) * exp(-dot(pit, pit)))
    * (1.0 - uRim.x * (1.0 - smoothstep(1.0, ${f(ao.collar.reach)}, length(rim))))
    * (1.0 - uRim.y * (1.0 - smoothstep(0.0, ${f(ao.hem.height)}, vRest.y)));
  diffuseColor.rgb *= occlusion;
  float form = clamp(formHeight(vRest), -1.0, 1.0);`,
          )
          // A little procedural fold in the shading normal.
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = normalize(normal + vFold - vec3(dFdx(form), dFdy(form), 0.0) * ${CREASE_BUMP.toFixed(1)});`)
          // Dark cloth takes almost no light, so a faint lift follows the creases to show the form; grain goes on last, in display space, like the camera's.
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += uRoom * uLift * (0.5 + 0.5 * form);`)
          .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  gl_FragColor.rgb += uGrain * (hash21(gl_FragCoord.xy + uSeed * vec2(61.0, 7.0)) - 0.5) * 2.0;`)
    }
    // The shadow on the person: a copy of the shirt pushed out along its normals (and down at the hem), drawn BEFORE the shirt with no depth write, so the shirt
    // paints over all of it and only the feathered band outside the shirt's edge is left. Black with an alpha that is strongest at the collar, under the arms
    // and below the hem (the contactShade strengths), fades at the band's grazing outer edge, and follows the person mask. Custom blending with transparent off keeps
    // it in the opaque list, so renderOrder puts it behind the shirt but after the depth-only occluders, which hide it where a forearm or the chin is in front.
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
    })
    shadowMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, maskUniforms, hemUniforms, swayUniforms, skinUniforms)
      shader.vertexShader =
        `${DEFORM_UNIFORMS}uniform float uSpread;
varying vec3 vRest;
varying vec3 vNormalV;
varying vec3 vViewV;
` +
        shader.vertexShader
          .replace(
            '#include <skinning_vertex>',
            `#include <skinning_vertex>
${deform}
  vRest = position;
  transformed += normalize(objectNormal) * uSpread;
  transformed.y -= uSpread * hemB;`,
          )
          .replace(
            '#include <project_vertex>',
            `#include <project_vertex>
  vNormalV = normalize(transformedNormal);
  vViewV = -mvPosition.xyz;`,
          )
      shader.fragmentShader =
        `uniform sampler2D uMask;
uniform vec4 uMaskMap;
uniform float uMaskOn;
uniform vec2 uSkinPit;
uniform vec2 uSkinRim;
varying vec3 vRest;
varying vec3 vNormalV;
varying vec3 vViewV;
` +
        shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `vec2 skinPit = vec2(abs(vRest.x) - ${f(ao.underarm.x)}, vRest.y - ${f(ao.underarm.y)}) / (vec2(${f(ao.underarm.rx)}, ${f(ao.underarm.ry)}) * ${f(SKIN_PATCH.underarmScale)});
  vec2 skinRim = vec2(vRest.x / ${f(NECK_PLUG.rx)}, (vRest.y - ${f(NECK_PLUG.y)}) / ${f(NECK_PLUG.ry)});
  float spot = (vRest.x < 0.0 ? uSkinPit.x : uSkinPit.y) * exp(-dot(skinPit, skinPit))
    + uSkinRim.x * (1.0 - smoothstep(1.0, ${f(SKIN_PATCH.collarReach)}, length(skinRim)))
    + uSkinRim.y * smoothstep(0.0, ${f(SKIN_PATCH.hemFrom)}, vRest.y) * (1.0 - smoothstep(${f(SKIN_PATCH.hemFrom)}, ${f(SKIN_PATCH.hemTo)}, vRest.y));
  float outward = smoothstep(0.0, 0.5, abs(dot(normalize(vNormalV), normalize(vViewV))));
  float person = uMaskOn > 0.5 ? smoothstep(${(MASK_THRESHOLD - EDGE_FEATHER).toFixed(2)}, ${(MASK_THRESHOLD + EDGE_FEATHER).toFixed(2)}, texture2D(uMask, uMaskMap.xy * gl_FragCoord.xy + uMaskMap.zw).r) : 1.0;
  gl_FragColor = vec4(0.0, 0.0, 0.0, min(spot, 1.0) * outward * person);`,
        )
    }
    // Depth-only occluders: they write depth before the shirt (renderOrder -1) and no colour, so a forearm or the chin in front hides the shirt behind it.
    const occluderMaterial = new THREE.MeshBasicMaterial({ colorWrite: false })
    const planeGeometry = new THREE.PlaneGeometry(1, 1)
    const circleGeometry = new THREE.CircleGeometry(1, 24)
    // They sit in a group in front of the shirt, scaled about the stage centre so that, seen from the camera, each lands on its stage pixels as if it were at z = 0.
    const occluderGroup = new THREE.Group()
    scene.add(occluderGroup)
    const occluders = Array.from({ length: OCCLUDER_MESHES }, (_, i) => {
      const part = new THREE.Mesh(i % 3 === 0 && i < 6 ? planeGeometry : circleGeometry, occluderMaterial)
      part.renderOrder = -1
      part.visible = false
      part.frustumCulled = false
      occluderGroup.add(part)
      return part
    })
    let mesh: THREE.Mesh | undefined
    let shadow: THREE.Mesh | undefined
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
    const probe = new Uint8Array(4)
    let renderMs: number[] = []
    let detectMs: number[] = []
    let detections = 0
    let delegate = ''
    let debugTimer = 0
    // The room's brightness, from a 16 x 12 luminance sample of the video (see lightProbe.ts): kept as two numbers only.
    const meter = new LightMeter()
    let lightTimer = 0
    const sway = new Sway()
    // One angular spring for each sleeve bone (-x then +x), added to the arm's own angle; see arLook.ts.
    const sleeveSway = [new SleeveSway(-1), new SleeveSway(1)]
    const swayVector = new THREE.Vector3()
    // The person mask: 'waiting' for the first one, 'on' while clipping, 'off' once the device was too busy to read it. Bytes live only in the texture.
    let maskState: 'waiting' | 'on' | 'off' = 'waiting'
    let maskTexture = maskUniforms.uMask.value
    let maskVideoW = 0
    const drawingSize = new THREE.Vector2()
    // ?debug=ar only: the 2D overlay and the last pose it drew, so switching it on paints at once.
    const painter = drawCanvas.current ? createTrackingPainter(drawCanvas.current) : null
    let drawn: TrackingScene | null = null
    const cueLog: CueSample[] | null = debugOverlay() ? (window.__silhoufitCues = []) : null
    // ?debug=ar only, in memory: the shirt anchor and how many landmarks were under the visibility threshold, per detection, for the meter lines.
    const anchors: Sample[] = []
    const heldLog: { t: number; n: number }[] = []
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
        renderer.render(scene, tracked)
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

    /** The hem and cuffs lag the body (arLook.ts Sway), turned from stage pixels into the shirt's own cm. None with reduced motion. */
    function updateSway(p: Pose, tMs: number) {
      if (!mesh) return
      if (reduceMotion.matches) {
        sway.reset()
        sleeveSway.forEach((s) => s.reset())
      } else {
        const t = garmentTransform(p, latest.current.scale)
        sway.update({ x: t.x, y: t.y, roll: t.rotationZ, yaw: p.yaw, hipX: p.fit.hipX }, tMs, SEAM_HEIGHT * t.scale.y, t.widthPx)
        sleeveSway.forEach((s) => s.update(t.y, p.yaw, tMs, t.widthPx))
      }
      swayVector.set(sway.x, sway.y, 0).applyQuaternion(mesh.quaternion.clone().invert())
      swayUniforms.uSway.value.set(swayVector.x / mesh.scale.x, swayVector.y / mesh.scale.y)
      if (exposeAttributes) host.dataset.sway = sway.magnitude.toFixed(1)
    }

    /** The sheen (colour: the shirt's, lifted toward white and toward the room's colour cast; strength: more on dark colours), the lift and the grain. Neutral until a reading, no grain off camera. */
    function setLook() {
      const hex = latest.current.colorHex
      material.sheenColor.setRGB(...sheenTint(hex, meter), THREE.SRGBColorSpace)
      material.sheen = sheenStrength(hex, FABRIC.sheen)
      lookUniforms.uLift.value = darkLift(hex)
      lookUniforms.uRoom.value.set(...roomTint(meter))
      lookUniforms.uGrain.value = follow ? grainStrength(meter.lum) : 0
    }

    function readLight() {
      if (!follow || !pose || !video.current) return
      const reading = sampleLight(video.current)
      if (!reading) return
      meter.push(reading.lum, reading.balance, reading)
      setLight(lightGain(meter.lum), keyLightX(meter.balance))
      setLook()
      if (exposeAttributes) host.dataset.light = `${meter.lum.toFixed(2)},${meter.balance.toFixed(2)}`
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
    function placeOccluders(calls: [ForearmCall | null, ForearmCall | null], face: Ellipse | null, shirtReach: number) {
      // In front of the shirt's farthest point (its half width when turned side-on, or its half height when leaning), well inside the camera's distance.
      const z = Math.min(shirtReach + OCCLUDER_GAP * cameraDistance, OCCLUDER_NEAREST * cameraDistance)
      const k = (cameraDistance - z) / cameraDistance
      occluderGroup.position.set((host.clientWidth / 2) * (1 - k), (-host.clientHeight / 2) * (1 - k), z)
      occluderGroup.scale.set(k, k, 1)
      const forearms = calls.map((call) => (call?.cut ? call.capsule : null))
      forearms.forEach((c, i) => {
        const parts = occluders.slice(i * 3, i * 3 + 3)
        for (const part of parts) part.visible = !!c
        if (!c) return
        const [shaft, a, b] = parts
        const [dx, dy] = [c.b.x - c.a.x, c.b.y - c.a.y]
        shaft.position.set((c.a.x + c.b.x) / 2, -(c.a.y + c.b.y) / 2, 0)
        shaft.rotation.z = Math.atan2(-dy, dx)
        shaft.scale.set(Math.hypot(dx, dy), 2 * c.radius, 1)
        a.position.set(c.a.x, -c.a.y, 0)
        b.position.set(c.b.x, -c.b.y, 0)
        a.scale.setScalar(c.radius)
        b.scale.setScalar(c.radius)
      })
      const head = occluders[6]
      head.visible = !!face
      if (face) {
        head.position.set(face.x, -face.y, 0)
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
      if (shadow) shadow.visible = true
      const onBones = sleevesOnBones(pose.sleeves, pose.facing === 'back')
      bones[1].rotation.z = sleeveRotation(onBones[0], -1) + sleeveSway[0].angle
      bones[2].rotation.z = sleeveRotation(onBones[1], 1) + sleeveSway[1].angle
      const shade = contactShade(onBones, pose.yaw)
      setShade(shade.underarm, shade.collar, shade.hem)
      const skin = skinShadow(shade)
      skinUniforms.uSpread.value = skin.spreadCm
      skinUniforms.uSkinPit.value.set(...skin.underarm)
      skinUniforms.uSkinRim.value.set(skin.collar, skin.hem)
      hemUniforms.uGather.value = hemGather(pose.yaw, pose.fit.pitch)
      const folds = foldShade(onBones, pose.yaw, pose.fit.pitch)
      lookUniforms.uFoldArm.value.set(...folds.arm)
      lookUniforms.uFold.value.set(folds.chest, folds.drape)
      placeOccluders(pose.occluders.forearms, pose.occluders.face, Math.max(t.widthPx, GARMENT_BASE.length * t.scale.y) / 2)
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
      hemUniforms.uWaist.value = taperFactor(latest.current.waistRatio)
      setLook()
      if (follow) place()
      else {
        mesh.rotation.set(0, 0, 0)
        mesh.scale.set(s.x, s.y, s.z)
        mesh.position.set(0, -top * s.y, 0)
        for (const bone of bones) bone.rotation.z = 0
        restShade()
      }
      invalidate()
    }

    /** Back to the fixed preview. */
    function leave(next: TrackStatus) {
      follow = false
      pose = null
      clearInterval(lightTimer)
      meter.reset()
      setLight(1, LIGHT.keyX)
      sway.reset()
      sleeveSway.forEach((s) => s.reset())
      swayUniforms.uSway.value.set(0, 0)
      drawn = null
      painter?.clear()
      flipFacing.current = () => {}
      for (const part of occluders) part.visible = false
      neck.visible = false
      if (shadow) shadow.visible = false
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
        delete host.dataset.light
        delete host.dataset.sway
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
      const now = performance.now()
      const recent = anchors.filter((a) => a.t > now - METER_MS)
      const speed = speedPxS(recent.filter((a) => a.t > now - METER_SPEED_MS))
      const held = heldLog.filter((h) => h.t > now - 1000)
      const hem = pose ? garmentTransform(pose, latest.current.scale) : null
      debugText.current.textContent = [
        `detect ${median(detectMs).toFixed(1)} / ${percentile95(detectMs).toFixed(1)} ms (median / p95)`,
        `render ${median(renderMs).toFixed(1)} ms (${rendered}/s)`,
        `tracking ${detections}/s on ${delegate}`,
        `jitter ${recent.length > 3 ? jitterPx(recent).toFixed(2) : '-'} px, lag ~${Math.round(lagMs(LANDMARK_FILTER, speed))} ms at ${Math.round(speed)} px/s`,
        `held ${held.length ? Math.max(...held.map((h) => h.n)) : '-'} landmarks under visibility`,
        `ref size ${latest.current.refSize}, joint span ${cues ? Math.round(cues.spanPx) : '-'} px, px/cm ${pose ? pose.pxPerCm.toFixed(2) : '-'}`,
        `hips ${fit?.hips ?? '-'}, torso ${fit?.torsoPx != null ? Math.round(fit.torsoPx) : '-'} px, ratio ${fit ? fit.vy.toFixed(2) : '-'}, hip ${fit ? fit.hip.toFixed(2) : '-'}, pitch ${fit ? deg(fit.pitch) : '-'}`,
        `hem y ${hem ? Math.round(-hem.y) : '-'} vs hip y ${fit?.hipY != null ? Math.round(fit.hipY) : '-'}${hem && fit?.hipY != null ? ` (${Math.round(-hem.y - fit.hipY)} px below)` : ''}`,
        `yaw ${pose && cues ? `${deg(cues.yaw)} seen, ${deg(pose.yaw)} shown` : '-'}`,
        `span ${cues ? cues.ratio.toFixed(2) : '-'} face ${cues?.face?.toFixed(2) ?? '-'}`,
        `facing ${pose && cues ? `${pose.facing} (${cues.source}) by ${cues.reason ?? 'default'}` : '-'}`,
        `mask ${maskState} ${maskState === 'waiting' ? '-' : `${maskTexture.image.width}x${maskTexture.image.height}`}`,
        `camera fov ${follow ? tracked.fov.toFixed(1) : '-'} deg, distance ${follow ? Math.round(cameraDistance) : '-'} px`,
        `sway ${follow ? sway.magnitude.toFixed(1) : '-'} px`,
        `light lum ${follow ? meter.lum.toFixed(2) : '-'} balance ${follow ? meter.balance.toFixed(2) : '-'} gain ${follow ? lightGain(meter.lum).toFixed(2) : '-'}`,
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
          const health = new RateHealth(coarse, !maskDroppedForLoad)
          const follower = new PoseFollower()
          flipFacing.current = () => follower.flip()
          let placed: Pose | null = null
          delegate = d.delegate
          follow = true
          setLook()
          pose = null
          lightTimer = window.setInterval(readLight, LIGHT_MS)
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
              if (element.videoWidth !== cameraVideoW) updateCamera()
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
              if (!health.mask) {
                maskDroppedForLoad = true
                setMaskState('off')
              }
              else if (result?.mask && out.pose) uploadMask(result.mask)
              renderer.domElement.style.opacity = String(reduceMotion.matches && out.opacity < 1 ? 0 : out.opacity)
              if (out.pose && out.pose !== placed) {
                placed = out.pose
                pose = out.pose
                if (cueLog) {
                  const c = out.pose.cues
                  cueLog.push({ t: Math.round(tMs), yawDeg: Math.round((c.yaw * 180) / Math.PI), ratio: Math.round(c.ratio * 100) / 100, face: c.face ?? -1, back: out.pose.facing === 'back' ? 1 : 0, manual: c.source === 'manual' ? 1 : 0 })
                  while (cueLog[0].t < tMs - CUE_LOG_MS) cueLog.shift()
                  anchors.push({ t: tMs, x: out.pose.x, y: out.pose.y })
                  heldLog.push({ t: tMs, n: c.held })
                  while (anchors[0].t < tMs - METER_MS) anchors.shift()
                  while (heldLog[0].t < tMs - 1000) heldLog.shift()
                }
                place()
                updateSway(out.pose, tMs)
                lookUniforms.uSeed.value = tMs % 1000
                if (painter && result) {
                  const t = garmentTransform(out.pose, latest.current.scale)
                  drawn = { frame: result, pose: out.pose, view, seamHalf: (GARMENT_BASE.shoulder / 2) * latest.current.scale.x * out.pose.pxPerCm, hem: { x: t.x, y: -t.y, half: (GARMENT_BASE.chest / 2) * t.scale.x * out.pose.fit.hip } }
                  paintTracking()
                }
                const start = performance.now()
                if (frame) cancelAnimationFrame(frame)
                render()
                // A 1-pixel read only for the ?debug=ar number: it waits for the GPU, or this would time the command submit alone.
                if (cueLog) renderer.getContext().readPixels(0, 0, 1, 1, WebGL2RenderingContext.RGBA, WebGL2RenderingContext.UNSIGNED_BYTE, probe)
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

    function updateCamera() {
      const element = video.current
      const [width, height] = [host.clientWidth, host.clientHeight]
      // Before the video has a size, a 4:3 camera.
      const { fovDeg, distance, aspect } = trackedCamera({ videoW: element?.videoWidth || 640, videoH: element?.videoHeight || 480, width, height })
      cameraVideoW = element?.videoWidth ?? 0
      cameraDistance = distance
      tracked.fov = fovDeg
      tracked.aspect = aspect
      tracked.near = distance * 0.05
      tracked.far = distance * 3
      tracked.position.set(width / 2, -height / 2, distance)
      tracked.updateProjectionMatrix()
    }

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      updateCamera()
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
      setLost(true)
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
          // Its own SkinnedMesh on the same skeleton, a child of the shirt so it keeps the shirt's transform.
          const cast = new THREE.SkinnedMesh(geometry, shadowMaterial)
          cast.bind(skeleton, skinned.bindMatrix)
          cast.renderOrder = -0.5
          cast.frustumCulled = false
          cast.visible = false
          skinned.add(cast)
          shadow = cast
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
      clearInterval(lightTimer)
      if (cueLog) delete window.__silhoufitCues
      apply.current = () => {}
      redraw.current = () => {}
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('webglcontextlost', lost)
      mesh?.geometry.dispose()
      skeleton?.dispose()
      material.dispose()
      shadowMaterial.dispose()
      weaveNormal.dispose()
      weaveRoughness.dispose()
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
          lost={lost}
          live={live}
          onRetry={() => {
            setUnavailable(false)
            setLost(false)
            setAttempt((n) => n + 1)
          }}
        />
      )}
    </>
  )
}
