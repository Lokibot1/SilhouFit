import type { Page } from '@playwright/test'
import { start, stubCamera } from './tryOn'
import { expect } from '@playwright/test'

// A dev pose feed for the AR try-on occluder and mask specs (MediaPipe is never loaded). Same person as try-on-tracking.spec.ts, plus wrists with
// a world z, the face landmarks, and a synthetic person mask. Specs drive `window.__arFeed` and read data attributes only.

/** A wrist, in video pixels (640 x 480) out to the side of its shoulder and down from it, its visibility and its world z in metres. */
export interface Joint {
  out: number
  down: number
  v: number
  z?: number
}
export interface Feed {
  centreX: number
  y: number
  off: boolean
  yawDeg: number
  /** Face landmarks 0..10 present; their visibility is `face` (else 1 facing the camera, 0.1 facing away). */
  faceMarks?: boolean
  face?: number
  elbowL?: Joint
  elbowR?: Joint
  wristL?: Joint
  wristR?: Joint
  /** A mask of `w` x `h` with 255 inside the box (columns and rows, end exclusive) and 0 outside. */
  mask?: { w: number; h: number; box: [number, number, number, number] }
  /** Each detection busy-waits this long. */
  busyMs?: number
}
declare global {
  interface Window {
    __arFeed: Feed
  }
}

export async function feedPoses(page: Page) {
  await page.addInitScript(() => {
    window.__arFeed = { centreX: 0.5, y: 0.4, off: false, yawDeg: 0 }
    let maskBuffer: Uint8Array | null = null
    window.__silhoufitPoseFeed = () => {
      const f = window.__arFeed
      if (f.busyMs) for (const end = performance.now() + f.busyMs; performance.now() < end; );
      if (f.off) return null
      const image = []
      const world = []
      const actual = Math.cos((f.yawDeg * Math.PI) / 180)
      const turn = ((((f.yawDeg + 270) % 180) + 180) % 180 - 90) * (Math.PI / 180)
      const [cos, sin] = [Math.cos(turn), Math.sin(turn)]
      const visible = f.face ?? (actual < 0 ? 0.1 : 1)
      image[11] = { x: f.centreX + 0.1 * cos, y: f.y, visibility: 1 }
      image[12] = { x: f.centreX - 0.1 * cos, y: f.y, visibility: 1 }
      for (const i of [0, 2, 5]) image[i] = { x: f.centreX, y: f.y - 0.1, visibility: visible }
      if (f.faceMarks) {
        // A face 0.1 wide and 0.2 tall in raw units, eyes 0.1 above the shoulder line, mouth 0.05 below the eyes.
        const at = (i: number, dx: number, dy: number) => (image[i] = { x: f.centreX + dx, y: f.y - 0.1 + dy, visibility: visible })
        at(0, 0, 0.025)
        at(3, 0.04, 0)
        at(6, -0.04, 0)
        at(7, 0.06, 0.02)
        at(8, -0.06, 0.02)
        at(9, 0.02, 0.05)
        at(10, -0.02, 0.05)
      }
      // The person's left arm is on the screen's left: out is a larger raw x there and a smaller one on the right.
      const arm = (index: number, side: 1 | -1, j?: Joint) => {
        if (!j) return
        image[index] = { x: f.centreX + side * (0.1 + j.out / 640), y: f.y + j.down / 480, visibility: j.v }
        world[index] = { x: 0, y: 0, z: j.z ?? 0 }
      }
      arm(13, 1, f.elbowL)
      arm(14, -1, f.elbowR)
      arm(15, 1, f.wristL)
      arm(16, -1, f.wristR)
      world[11] = { x: 0.2 * cos, y: 0, z: -0.2 * sin }
      world[12] = { x: -0.2 * cos, y: 0, z: 0.2 * sin }
      if (!f.mask) return { image, world }
      const { w, h, box } = f.mask
      if (maskBuffer?.length !== w * h) maskBuffer = new Uint8Array(w * h)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) maskBuffer[y * w + x] = x >= box[0] && x < box[2] && y >= box[1] && y < box[3] ? 255 : 0
      return { image, world, mask: { data: maskBuffer, width: w, height: h } }
    }
  })
}

/** Signs in, opens the try-on page, turns the camera on and waits for tracking. */
export async function goLive(page: Page) {
  await feedPoses(page)
  await stubCamera(page, 'live')
  await start(page)
  await page.goto('/shop/linen-shirt/try-on')
  await page.getByRole('button', { name: 'Turn on camera' }).click({ timeout: 15000 })
  await expect(page.locator('[data-tracking="tracking"]')).toBeVisible({ timeout: 15000 })
}
