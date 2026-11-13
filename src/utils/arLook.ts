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
 * Mean luminance and left-right balance of an RGBA array (a small video frame, `width` x `height`). The video is shown mirrored, so its right half is
 * the left of the screen: the balance is on the screen's terms.
 */
export function lumaStats(rgba: ArrayLike<number>, width: number, height: number) {
  let all = 0
  let screenLeft = 0
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const luma = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255
      all += luma
      if (x >= width / 2) screenLeft += luma
    }
  const half = (width / 2) * height
  const [left, right] = [screenLeft / half, (all - screenLeft) / half]
  return { lum: all / (width * height), balance: left + right > 0 ? (right - left) / (left + right) : 0 }
}

/** A running average of the samples, so a passing shadow or a flicker does not pump the light. */
export class LightMeter {
  lum = LIGHT.refLum
  balance = 0
  private seeded = false
  push(lum: number, balance: number) {
    const a = this.seeded ? LIGHT.ema : 1
    this.seeded = true
    this.lum += a * (lum - this.lum)
    this.balance += a * (balance - this.balance)
  }
  reset() {
    this.lum = LIGHT.refLum
    this.balance = 0
    this.seeded = false
  }
}

/**
 * How the hem and cuffs lag the body: the target offset is the opposite of the anchor's velocity (and of the roll's, at the hem's lever arm) times
 * `tau`, kept under `max` of the garment's width, and a critically damped spring (`omega`, about 0.3 s to settle) follows it. Speeds under `dead`
 * px/s are noise and count as still, so it returns to rest when the person stops.
 */
export const SWAY = { tau: 0.05, omega: 14, dead: 25, max: 0.025 }

export class Sway {
  x = 0
  y = 0
  private vx = 0
  private vy = 0
  private last: { x: number; y: number; roll: number; t: number } | null = null

  /** The anchor's stage position (px, y up), its roll (radians), the hem's distance below it (px) and the drawn width (px), at video time `tMs`. */
  update(anchor: { x: number; y: number; roll: number }, tMs: number, lever: number, widthPx: number) {
    const last = this.last
    this.last = { ...anchor, t: tMs }
    if (!last) return
    const dt = (tMs - last.t) / 1000
    if (dt <= 0) return
    if (dt > 0.2) return this.reset(this.last)
    const quiet = (v: number) => Math.sign(v) * Math.max(0, Math.abs(v) - SWAY.dead)
    let tx = -quiet((anchor.x - last.x) / dt) * SWAY.tau - quiet((((anchor.roll - last.roll) / dt) * lever)) * SWAY.tau
    let ty = -quiet((anchor.y - last.y) / dt) * SWAY.tau
    const over = Math.hypot(tx, ty) / (SWAY.max * widthPx)
    if (over > 1) [tx, ty] = [tx / over, ty / over]
    // The exact step of a critically damped spring toward a target held for dt.
    const e = Math.exp(-SWAY.omega * dt)
    const step = (pos: number, vel: number, target: number) => {
      const d = pos - target
      const k = (vel + SWAY.omega * d) * dt
      return [target + (d + k) * e, (vel - SWAY.omega * k) * e] as const
    }
    ;[this.x, this.vx] = step(this.x, this.vx, tx)
    ;[this.y, this.vy] = step(this.y, this.vy, ty)
  }

  reset(keep: Sway['last'] = null) {
    this.x = this.y = this.vx = this.vy = 0
    this.last = keep
  }

  get magnitude() {
    return Math.hypot(this.x, this.y)
  }
}
