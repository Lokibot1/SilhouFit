import { SLEEVE_MAX, SLEEVE_MIN, type Side } from './arArms'
import { GARMENT_BASE } from './arGarment'
import { coverMap, type View } from './arPose'

// How the AR try-on shirt is lit, how its hem and cuffs lag, and the camera it is seen through. Pure TypeScript with no rendering.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * The assumed horizontal field of view of the whole camera frame. Real webcams vary, about 55 degrees (phone front cameras, cropped) to 80
 * (wide laptop lenses); 65 is a middle value. Raise it if the shirt's perspective looks too strong, lower it if too flat.
 */
export const WEBCAM_HFOV_DEG = 65

/**
 * The perspective camera for tracked mode: the plane z = 0 maps 1:1 to stage pixels (x right, y up from the top-left corner), so a landmark lands where
 * it was seen. The focal length is the camera's, in stage pixels: the video's width as shown (object-fit: cover) over the assumed field of view.
 * Cover crops the video to the stage, which only narrows what is visible, so the vertical field of view of the stage is read off that same focal length.
 * The camera sits `distance` (= the focal length) on +z, looking down -z at the stage centre.
 */
export function trackedCamera(view: View) {
  const focal = (coverMap(view).scale * view.videoW) / 2 / Math.tan((WEBCAM_HFOV_DEG * Math.PI) / 360)
  return { fovDeg: (2 * Math.atan(view.height / 2 / focal) * 180) / Math.PI, distance: focal, aspect: view.width / view.height }
}

/**
 * Lighting follows a 16 x 12 luminance sample of the live video (at most 192 pixels, read on the device, never stored or sent): a mean (0..1) and
 * which side of the screen is brighter. The gain scales every light, the environment and the exposure together.
 */
export const LIGHT = { refLum: 0.45, minGain: 0.65, maxGain: 1.25, keyX: -2.5, keyShift: 1.5, ema: 0.35 }

/** 1 at the reference room brightness; a dim room dims the shirt and a bright one brightens it, within clamps so it never goes black or blows out. */
export const lightGain = (lum: number) => clamp(Math.sqrt(Math.max(lum, 0) / LIGHT.refLum), LIGHT.minGain, LIGHT.maxGain)

/** The directional light's x: from the upper left of the screen, drifting toward the brighter side (balance is -1..1, positive = right of the screen brighter). */
export const keyLightX = (balance: number) => LIGHT.keyX + clamp(balance * 3, -1, 1) * LIGHT.keyShift

/**
 * Mean luminance, left-right balance and average colour (r, g, b, 0..1) of an RGBA array (a small video frame, `width` x `height`). The video is
 * shown mirrored, so its right half is the left of the screen: the balance is on the screen's terms.
 */
export function lumaStats(rgba: ArrayLike<number>, width: number, height: number) {
  let all = 0
  let screenLeft = 0
  let r = 0
  let g = 0
  let b = 0
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const luma = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255
      all += luma
      r += rgba[i]
      g += rgba[i + 1]
      b += rgba[i + 2]
      if (x >= width / 2) screenLeft += luma
    }
  const half = (width / 2) * height
  const [left, right] = [screenLeft / half, (all - screenLeft) / half]
  const n = 255 * width * height
  return { lum: all / (width * height), balance: left + right > 0 ? (right - left) / (left + right) : 0, r: r / n, g: g / n, b: b / n }
}

export interface Rgb {
  r: number
  g: number
  b: number
}

/** A running average of the samples, so a passing shadow or a flicker does not pump the light. The colour starts neutral (1, 1, 1). */
export class LightMeter {
  lum = LIGHT.refLum
  balance = 0
  r = 1
  g = 1
  b = 1
  private seeded = false
  push(lum: number, balance: number, rgb: Rgb = { r: 1, g: 1, b: 1 }) {
    const a = this.seeded ? LIGHT.ema : 1
    this.seeded = true
    this.lum += a * (lum - this.lum)
    this.balance += a * (balance - this.balance)
    this.r += a * (rgb.r - this.r)
    this.g += a * (rgb.g - this.g)
    this.b += a * (rgb.b - this.b)
  }
  reset() {
    this.lum = LIGHT.refLum
    this.balance = 0
    this.r = this.g = this.b = 1
    this.seeded = false
  }
}

/** The room's colour cast: the average colour over its largest channel, so the strongest channel is 1 and a grey room is (1, 1, 1). */
export const roomTint = ({ r, g, b }: Rgb): [number, number, number] => {
  const max = Math.max(r, g, b)
  return max > 0 ? [r / max, g / max, b / max] : [1, 1, 1]
}

/** How far the sheen colour goes toward white, and toward the room's tint. */
export const SHEEN = { white: 0.25, room: 0.5 }

/** The sheen colour (sRGB, 0..1) of a `#rrggbb` or `#rgb` shirt: the shirt colour blended 25% toward white, times a 50% blend toward the room's tint. */
export function sheenTint(hex: string, room: Rgb): [number, number, number] {
  const tint = roomTint(room)
  return rgbOf(hex).map((c, i) => (c + (1 - c) * SHEEN.white) * (1 + (tint[i] - 1) * SHEEN.room)) as [number, number, number]
}

/** A `#rrggbb` or `#rgb` colour as sRGB 0..1. */
const rgbOf = (hex: string) => {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex
  return [0, 1, 2].map((i) => parseInt(full.slice(1 + 2 * i, 3 + 2 * i), 16) / 255)
}
const darkness = (hex: string) => {
  const [r, g, b] = rgbOf(hex)
  return (1 - (0.2126 * r + 0.7152 * g + 0.0722 * b)) ** 2
}

/**
 * Dark cloth shows no diffuse light, so its form comes from the sheen and a faint lift: the sheen grows from `base` (light colours) up to
 * 1 + DARK.sheen times it for black, and the lift (added light, 0..DARK.lift) is the same curve.
 */
export const DARK = { sheen: 2, lift: 0.06 }
export const sheenStrength = (hex: string, base: number) => base * (1 + DARK.sheen * darkness(hex))
export const darkLift = (hex: string) => DARK.lift * darkness(hex)

/**
 * The film grain added to the shirt so it matches the camera's: a dark, poorly lit video is noisier, so it goes from `max` (black) to `min` (white)
 * of full scale with the video's mean luminance. It is the strength of a per-pixel hash that changes with the video time (see TryOnStage).
 */
export const GRAIN = { min: 0.015, max: 0.05 }
export const grainStrength = (lum: number) => GRAIN.min + (GRAIN.max - GRAIN.min) * (1 - clamp(lum, 0, 1))

/** The softness of the shirt's silhouette against the person mask, in mask units either side of the cut: the edge dithers over it instead of cutting. */
export const EDGE_FEATHER = 0.15

/** How strong the low-frequency creases are: from the arms (`arm`), across the chest with a turn or a lean (`chest`), and a constant vertical drape. */
export const FOLD = { arm: 1, chest: 1, drape: 0.35 }

/**
 * The crease strengths (0..1) for a pose: each underarm (-x then +x bone, as sleevesOnBones gives them) fans out more the higher the arm is,
 * the chest creases with the turn (|sin yaw|) and the lean (|sin pitch|), and the drape is always a little there.
 */
export function foldShade(sleeves: [number, number], yaw: number, pitch: number) {
  return {
    arm: sleeves.map((theta) => FOLD.arm * clamp((theta - SLEEVE_MIN) / (SLEEVE_MAX - SLEEVE_MIN), 0, 1)) as [number, number],
    chest: clamp(FOLD.chest * (Math.abs(Math.sin(yaw)) + Math.abs(Math.sin(pitch))), 0, 1),
    drape: FOLD.drape,
  }
}

/** The soft contact shading at rest: how much (0..1) the colour darkens under each sleeve joint, around the collar and along the hem. */
export const SHADE = { underarm: 0.3, collar: 0.25, hem: 0.2, swing: 0.5 }

/**
 * The shading strengths for a pose. Each underarm (the -x then +x bone, as sleevesOnBones gives them) is shaded most with the arm down (the sleeve
 * closes on the side) and half as much with it fully raised; the collar and the hem gain up to half more as the shirt turns side-on (|sin yaw|),
 * since turned away the cloth hangs in its own shadow. Every strength stays within `swing` (50%) of its rest value.
 */
export function contactShade(sleeves: [number, number], yaw: number) {
  const turn = Math.abs(Math.sin(yaw))
  return {
    underarm: sleeves.map((theta) => SHADE.underarm * (1 + SHADE.swing - clamp((theta - SLEEVE_MIN) / (SLEEVE_MAX - SLEEVE_MIN), 0, 1))) as [number, number],
    collar: SHADE.collar * (1 + SHADE.swing * turn),
    hem: SHADE.hem * (1 + SHADE.swing * turn),
  }
}

/**
 * The fabric weave texture: a plain weave of `threads` over and under threads each way across a `size` x `size` square. Every period divides the
 * square, so it tiles with no seam. `strength` is how far the normal tilts at the steepest (0.5 is about 27 degrees).
 */
export const WEAVE = { size: 64, threads: 8, strength: 0.5, roughnessDip: 0.15 }

/**
 * The weave as RGBA texels (row by row, `size` x `size` x 4). 'normal' is a tangent-space normal map; 'roughness' puts a factor between 1 - roughnessDip
 * (thread crowns) and 1 in the green channel, which is where three reads a roughness map.
 */
export function weaveTexels(kind: 'normal' | 'roughness', size = WEAVE.size, threads = WEAVE.threads) {
  const out = new Uint8Array(size * size * 4)
  const w = (2 * Math.PI * threads) / size
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [sx, cx, sy, cy] = [Math.sin(w * x), Math.cos(w * x), Math.sin(w * y), Math.cos(w * y)]
      // The height is sx * sy: threads up where the two waves agree. Its slope along each axis, in units of the normal's tilt.
      const [dx, dy] = [WEAVE.strength * cx * sy, WEAVE.strength * sx * cy]
      const i = (y * size + x) * 4
      if (kind === 'normal') {
        const len = Math.hypot(dx, dy, 1)
        out.set([(-dx / len * 0.5 + 0.5) * 255, (-dy / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255, 255], i)
      } else out.set([255, (1 - WEAVE.roughnessDip * (0.5 - 0.5 * sx * sy)) * 255, 255, 255], i)
    }
  return out
}

/**
 * How the hem and cuffs lag the body: the target offset is the opposite of the anchor's velocity (and of the roll's, at the hem's lever arm, and of the
 * yaw's, at half the garment's width) times `tau`, kept under `max` of the garment's width, and a critically damped spring (`omega`, about 0.3 s to
 * settle) follows it. Speeds under `dead` px/s are noise and count as still, so it returns to rest when the person stops.
 */
export const SWAY = { tau: 0.05, omega: 14, dead: 25, max: 0.025 }

/** A speed (px/s) with the dead zone taken off. */
const quiet = (v: number) => Math.sign(v) * Math.max(0, Math.abs(v) - SWAY.dead)

/** The exact step of a critically damped spring toward a target held for dt: the new position and velocity. */
const springStep = (pos: number, vel: number, target: number, dt: number) => {
  const e = Math.exp(-SWAY.omega * dt)
  const d = pos - target
  const k = (vel + SWAY.omega * d) * dt
  return [target + (d + k) * e, (vel - SWAY.omega * k) * e] as const
}

export class Sway {
  x = 0
  y = 0
  private vx = 0
  private vy = 0
  private last: { x: number; y: number; roll: number; yaw?: number; hipX?: number | null; t: number } | null = null

  /**
   * The anchor's stage position (px, y up), its roll and yaw (radians) and, if the hips are seen, the hips' x (px); the hem's distance below it (px)
   * and the drawn width (px), at video time `tMs`. With hips the hem follows the mean of the shoulders' and the hips' sideways speed.
   */
  update(anchor: { x: number; y: number; roll: number; yaw?: number; hipX?: number | null }, tMs: number, lever: number, widthPx: number) {
    const last = this.last
    this.last = { ...anchor, t: tMs }
    if (!last) return
    const dt = (tMs - last.t) / 1000
    if (dt <= 0) return
    if (dt > 0.2) return this.reset(this.last)
    const vx = (anchor.x - last.x) / dt
    const hipVx = anchor.hipX != null && last.hipX != null ? (anchor.hipX - last.hipX) / dt : vx
    const yawRate = (((anchor.yaw ?? 0) - (last.yaw ?? 0)) / dt) * (widthPx / 2)
    let tx = -quiet((vx + hipVx) / 2) * SWAY.tau - quiet(((anchor.roll - last.roll) / dt) * lever) * SWAY.tau - quiet(yawRate) * SWAY.tau
    let ty = -quiet((anchor.y - last.y) / dt) * SWAY.tau
    const over = Math.hypot(tx, ty) / (SWAY.max * widthPx)
    if (over > 1) [tx, ty] = [tx / over, ty / over]
    ;[this.x, this.vx] = springStep(this.x, this.vx, tx, dt)
    ;[this.y, this.vy] = springStep(this.y, this.vy, ty, dt)
  }

  reset(keep: Sway['last'] = null) {
    this.x = this.y = this.vx = this.vy = 0
    this.last = keep
  }

  get magnitude() {
    return Math.hypot(this.x, this.y)
  }
}

/**
 * The shirt's shape below the chest. `waistOverChest` (arGarment.ts) is the waist's width over the chest's. The shirt narrows to `strength` of the way to that ratio at the
 * waist (it is not skin-tight), within [min, max], so a bigger size, which is wider in every part, is still looser than a smaller one.
 */
export const TAPER = { strength: 0.5, min: 0.8, max: 1.05 }
export const taperFactor = (waistOverChest: number) => (Number.isFinite(waistOverChest) ? clamp(1 - TAPER.strength * (1 - waistOverChest), TAPER.min, TAPER.max) : 1)

/** How much the hem gathers (0..1): with the turn (|sin yaw|) and the lean (|sin pitch|, which is at most 20 degrees, so it counts for more). */
export const GATHER = { turn: 0.6, lean: 2.5 }
export const hemGather = (yaw: number, pitch: number) => clamp(GATHER.turn * Math.abs(Math.sin(yaw)) + GATHER.lean * Math.abs(Math.sin(pitch)), 0, 1)

/**
 * The shadow the shirt casts on the person where it meets the body, drawn on the video outside the shirt: it feathers out `spread` of the garment's
 * width (`widthCm`), and its darkness is each contactShade strength times `gain`, never over `max`, so it opens under a raised arm like the shading on the cloth.
 */
export const SKIN_SHADOW = { spread: 0.04, gain: 1.2, max: 0.5 }
export function skinShadow(shade: ReturnType<typeof contactShade>, widthCm = GARMENT_BASE.drawnWidth) {
  const dark = (strength: number) => Math.min(SKIN_SHADOW.max, SKIN_SHADOW.gain * strength)
  return { spreadCm: SKIN_SHADOW.spread * widthCm, underarm: shade.underarm.map(dark) as [number, number], collar: dark(shade.collar), hem: dark(shade.hem) }
}

/** How far a sleeve swings at the width limit (radians). */
export const SLEEVE_SWAY_MAX = (3 * Math.PI) / 180

/**
 * One sleeve's swing about its shoulder, added to the bone's rotation: the body moving down lifts the cuff out (up lets it fall in), and a turn
 * swings it against the turn. The same drive as Sway (shoulder vertical speed and yaw rate, dead zone, `tau`), kept under the same share of the
 * garment's width, which is `SLEEVE_SWAY_MAX` of swing, then followed by the same spring.
 */
export class SleeveSway {
  angle = 0
  private vel = 0
  private last: { y: number; yaw: number; t: number } | null = null
  private readonly side: Side

  /** -1 for the sleeve on the -x bone, 1 for the +x one (see arArms). */
  constructor(side: Side) {
    this.side = side
  }

  /** The anchor's y (px, y up) and yaw (radians), the drawn width (px), at video time `tMs`. */
  update(y: number, yaw: number, tMs: number, widthPx: number) {
    const last = this.last
    this.last = { y, yaw, t: tMs }
    if (!last) return
    const dt = (tMs - last.t) / 1000
    if (dt <= 0) return
    if (dt > 0.2) return this.reset(this.last)
    const limit = SWAY.max * widthPx
    const drive = -this.side * quiet((y - last.y) / dt) * SWAY.tau - quiet(((yaw - last.yaw) / dt) * (widthPx / 2)) * SWAY.tau
    const target = (clamp(drive, -limit, limit) / limit) * SLEEVE_SWAY_MAX
    ;[this.angle, this.vel] = springStep(this.angle, this.vel, target, dt)
    // The spring only approaches rest, so a swing too small to see is rest.
    if (target === 0 && Math.abs(this.angle) < 1e-5 && Math.abs(this.vel) < 1e-4) this.angle = this.vel = 0
  }

  reset(keep: SleeveSway['last'] = null) {
    this.angle = this.vel = 0
    this.last = keep
  }
}
