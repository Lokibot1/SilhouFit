import { expect, test, type Page } from '@playwright/test'
import { shirt, stage, start, stubCamera } from '../shared/tryOn'

// The shirt following the customer's shoulders. MediaPipe is never loaded here: in development the stage reads poses from
// window.__silhoufitPoseFeed, which these specs drive. The specs assert the DOM and data attributes, never pixels, as WebGL may be software here.

/** An elbow, in video pixels (640 x 480) out to the side of its shoulder and down from it, and its visibility. Absent: no elbow landmark at all. */
interface Elbow {
  out: number
  down: number
  v: number
}

declare global {
  interface Window {
    __feed: { centreX: number; y: number; off: boolean; elbowL?: Elbow; elbowR?: Elbow; yawDeg: number; face?: number }
  }
}

/**
 * A person whose shoulders are 0.2 of the frame apart when facing the camera, centred at raw x `centreX`; `off` is no body in view. `yawDeg` turns
 * them round (0 facing the camera, 90 side-on, 180 facing away) and is reported the way MediaPipe is assumed to (see arTurn.ts and the unit
 * tests): labels follow image side as if facing the camera, and the observed yaw is folded to +-90 with the depth true to the body, so its sign
 * changes at side-on. The nose and eyes read `face` visibility, by default 1 facing the camera and 0.1 facing away.
 */
async function feedPoses(page: Page) {
  await page.addInitScript(() => {
    window.__feed = { centreX: 0.5, y: 0.4, off: false, yawDeg: 0 }
    window.__silhoufitPoseFeed = () => {
      const f = window.__feed
      if (f.off) return null
      const image = []
      const world = []
      const actual = Math.cos((f.yawDeg * Math.PI) / 180)
      const turn = ((((f.yawDeg + 270) % 180) + 180) % 180 - 90) * (Math.PI / 180)
      const [cos, sin] = [Math.cos(turn), Math.sin(turn)]
      image[11] = { x: f.centreX + 0.1 * cos, y: f.y, visibility: 1 }
      image[12] = { x: f.centreX - 0.1 * cos, y: f.y, visibility: 1 }
      for (const i of [0, 2, 5]) image[i] = { x: f.centreX, y: f.y - 0.1, visibility: f.face ?? (actual < 0 ? 0.1 : 1) }
      // Landmarks 13 and 14: the person's left elbow is on the screen's left, so out is a larger raw x there and a smaller one on the right.
      if (f.elbowL) image[13] = { x: f.centreX + 0.1 + f.elbowL.out / 640, y: f.y + f.elbowL.down / 480, visibility: f.elbowL.v }
      if (f.elbowR) image[14] = { x: f.centreX - 0.1 - f.elbowR.out / 640, y: f.y + f.elbowR.down / 480, visibility: f.elbowR.v }
      world[11] = { x: 0.2 * cos, y: 0, z: -0.2 * sin }
      world[12] = { x: -0.2 * cos, y: 0, z: 0.2 * sin }
      return { image, world }
    }
  })
}

/** The stage's data-garment: x, y, roll and yaw (degrees), px per cm, drawn width in px. */
async function garment(page: Page) {
  const raw = await page.locator('[data-garment]').getAttribute('data-garment')
  const [x, y, roll, yaw, pxPerCm, width] = raw!.split(',').map(Number)
  return { x, y, roll, yaw, pxPerCm, width }
}

/** The stage's data-sleeves: the two arm angles in degrees (from hanging straight down), the left of the screen first. */
async function sleeves(page: Page) {
  const raw = await page.locator('[data-sleeves]').getAttribute('data-sleeves')
  return raw!.split(',').map(Number)
}

/** The stage's data-facing: which way the person is read to face. */
const facing = (page: Page) => page.locator('[data-facing]').getAttribute('data-facing')

async function goLive(page: Page, options: Parameters<typeof start>[1] = {}) {
  await feedPoses(page)
  await stubCamera(page, 'live')
  await start(page, options)
  await page.goto('/shop/linen-shirt/try-on')
  await page.getByRole('button', { name: 'Turn on camera' }).click({ timeout: 15000 })
  await expect(page.locator('[data-tracking="tracking"]')).toBeVisible({ timeout: 15000 })
}

test.describe('AR try-on tracking', () => {
  test('the shirt follows the shoulders, mirrored like the camera feed', async ({ page }) => {
    await goLive(page)
    await expect(page.getByText('Tracking your shoulders')).toBeVisible()
    const box = (await stage(page).boundingBox())!

    await page.evaluate(() => (window.__feed.centreX = 0.3))
    // Raw x 0.3 is on the left of the camera image, so on the right once the feed is mirrored.
    await expect.poll(async () => (await garment(page)).x, { timeout: 10000 }).toBeGreaterThan(box.width / 2)
    await page.evaluate(() => (window.__feed.centreX = 0.7))
    await expect.poll(async () => (await garment(page)).x, { timeout: 10000 }).toBeLessThan(box.width / 2)
    expect((await garment(page)).pxPerCm).toBeGreaterThan(0)
  })

  test('size L is drawn wider than M at the same px per cm, by the size chart ratio', async ({ page }) => {
    await goLive(page)
    await expect(page.getByRole('radio', { name: 'M', exact: true })).toBeChecked()
    await expect(stage(page)).toHaveAttribute('data-size', 'M')
    const m = await garment(page)
    await page.getByRole('radio', { name: 'L', exact: true }).check({ force: true })
    await expect(stage(page)).toHaveAttribute('data-size', 'L')
    await expect.poll(async () => (await garment(page)).width).toBeGreaterThan(m.width)
    const l = await garment(page)
    // The drawing is sized by the recommended size, so picking another one does not move the reference.
    await expect(page.locator('[data-ref-size]')).toHaveAttribute('data-ref-size', 'M')
    expect(l.pxPerCm).toBe(m.pxPerCm)
    expect(l.width / m.width).toBeCloseTo(56 / 52, 1)
  })

  test('shows the hint when the body is lost and recovers when it returns', async ({ page }) => {
    await goLive(page)
    await page.evaluate(() => (window.__feed.off = true))
    await expect(page.getByText('Step back so we can see your shoulders. Good light helps.')).toBeVisible({ timeout: 10000 })
    await page.evaluate(() => (window.__feed.off = false))
    await expect(page.getByText('Tracking your shoulders')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Step back so we can see your shoulders.')).toHaveCount(0)
  })

  test('says it is sized for an average build without saved measurements, and not with them', async ({ page }) => {
    await goLive(page, { profile: false })
    await expect(page.getByText('Sized for an average build. Add your measurements for your real fit.')).toBeVisible()
    // No recommendation, so the middle size (of S, M, L) is the reference.
    await expect(page.locator('[data-ref-size]')).toHaveAttribute('data-ref-size', 'M')
  })

  test('does not say it with saved measurements', async ({ page }) => {
    await goLive(page)
    await expect(page.getByText('Tracking your shoulders')).toBeVisible()
    await expect(page.getByText('Sized for an average build')).toHaveCount(0)
  })

  test('with the camera off the preview says it is not tracked, and tracking stops when it is turned off', async ({ page }) => {
    await feedPoses(page)
    await stubCamera(page, 'live')
    await start(page, { products: [shirt()] })
    await page.goto('/shop/linen-shirt/try-on')
    await expect(page.getByText('Preview: not tracked to your body yet')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Turn on camera' }).click()
    await expect(page.getByText('Tracking your shoulders')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Turn camera off' }).click()
    await expect(page.getByText('Preview: not tracked to your body yet')).toBeVisible()
    await expect(page.locator('[data-tracking="off"]')).toBeVisible()
  })

  test.describe('a full turn', () => {
    test('flips front, back, front once each way, with the placement and size finite and bounded all through', async ({ page }) => {
      await goLive(page)
      const start = await garment(page)
      // The face stays visible all round, as MediaPipe reports it even from behind, so only the turn itself can flip the facing.
      await page.evaluate(() => (window.__feed.face = 0.9))
      // The feed turns 4 degrees a step; the page records each attribute change as it happens.
      const seen = await page.evaluate(async () => {
        const out: { facing: string | null; garment: string | null; sleeves: string | null }[] = []
        const host = document.querySelector<HTMLElement>('[data-garment]')!
        const read = () => out.push({ facing: host.dataset.facing ?? null, garment: host.dataset.garment ?? null, sleeves: host.dataset.sleeves ?? null })
        for (let deg = 0; deg <= 360; deg += 4) {
          window.__feed.yawDeg = deg
          await new Promise((resolve) => setTimeout(resolve, 70))
          read()
        }
        return out
      })
      const order = seen.map((s) => s.facing).filter((f, i, all) => f !== all[i - 1])
      expect(order).toEqual(['front', 'back', 'front'])
      for (const s of seen) {
        const [x, y, roll, yaw, pxPerCm, width] = s.garment!.split(',').map(Number)
        for (const v of [x, y, roll, yaw, pxPerCm, width, ...s.sleeves!.split(',').map(Number)]) expect(Number.isFinite(v)).toBe(true)
        expect(pxPerCm / start.pxPerCm).toBeGreaterThan(0.5)
        expect(pxPerCm / start.pxPerCm).toBeLessThan(1.5)
      }
      await expect(page.locator('[data-facing-source]')).toHaveAttribute('data-facing-source', 'auto')
    })

    test('a peek out to the side and back does not flip the facing', async ({ page }) => {
      await goLive(page)
      await page.evaluate(() => (window.__feed.face = 0.9))
      const order = await page.evaluate(async () => {
        const host = document.querySelector<HTMLElement>('[data-garment]')!
        const seen: (string | undefined)[] = []
        for (const deg of [0, 20, 40, 60, 80, 80, 60, 40, 20, 0, 0, 0, 0]) {
          window.__feed.yawDeg = deg
          await new Promise((resolve) => setTimeout(resolve, 70))
          seen.push(host.dataset.facing)
        }
        return seen
      })
      expect(new Set(order)).toEqual(new Set(['front']))
    })

    test('the flip button corrects the facing by hand until the next automatic flip', async ({ page }) => {
      await goLive(page)
      const button = page.getByRole('button', { name: 'Flip front/back' })
      await expect(button).toBeVisible()
      const box = (await button.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      await expect(button).not.toHaveAttribute('title')
      await button.hover()
      await expect(page.getByRole('tooltip')).toHaveText('Flip front/back')

      await expect.poll(() => facing(page)).toBe('front')
      await button.click()
      await expect.poll(() => facing(page)).toBe('back')
      await expect(page.locator('[data-facing-source]')).toHaveAttribute('data-facing-source', 'manual')
      // It stays put while the person is still facing the camera.
      await page.waitForTimeout(600)
      expect(await facing(page)).toBe('back')
      // Keyboard works too.
      await button.focus()
      await page.keyboard.press('Enter')
      await expect.poll(() => facing(page)).toBe('front')

      // A turn through side-on takes over again.
      await button.click()
      await expect.poll(() => facing(page)).toBe('back')
      await page.evaluate(async () => {
        window.__feed.face = 0.9
        for (let deg = 0; deg <= 180; deg += 4) {
          window.__feed.yawDeg = deg
          await new Promise((resolve) => setTimeout(resolve, 70))
        }
      })
      await expect.poll(() => facing(page)).toBe('front')
      await expect(page.locator('[data-facing-source]')).toHaveAttribute('data-facing-source', 'auto')
    })

    test('stays on the back view while the person faces away, and returns to the front view', async ({ page }) => {
      await goLive(page)
      await expect.poll(() => facing(page)).toBe('front')
      await page.evaluate(() => (window.__feed.yawDeg = 180))
      await expect.poll(() => facing(page), { timeout: 10000 }).toBe('back')
      await page.waitForTimeout(500)
      expect(await facing(page)).toBe('back')
      await page.evaluate(() => (window.__feed.yawDeg = 0))
      await expect.poll(() => facing(page), { timeout: 10000 }).toBe('front')
    })
  })

  // Sleeve angles are the 2D upper-arm angle clamped to [10, 82] degrees (82 is the model's 42 degree A-pose plus 40).
  test.describe('sleeves', () => {
    const hang = { out: 0, down: 100, v: 1 }
    const reach = (deg: number): Elbow => ({ out: 100 * Math.sin((deg * Math.PI) / 180), down: 100 * Math.cos((deg * Math.PI) / 180), v: 1 })

    test('elbows straight below the shoulders put both sleeves at the lowest angle', async ({ page }) => {
      await goLive(page)
      await page.evaluate((e) => Object.assign(window.__feed, { elbowL: e, elbowR: e }), hang)
      await expect.poll(() => sleeves(page), { timeout: 10000 }).toEqual([10, 10])
    })

    test('only the arm that lifts rises, on its own side of the screen', async ({ page }) => {
      await goLive(page)
      await page.evaluate(([h, r]) => Object.assign(window.__feed, { elbowL: r, elbowR: h }), [hang, reach(60)])
      await expect.poll(() => sleeves(page), { timeout: 10000 }).toEqual([60, 10])
      await page.evaluate(([h, r]) => Object.assign(window.__feed, { elbowL: h, elbowR: r }), [hang, reach(60)])
      await expect.poll(() => sleeves(page), { timeout: 10000 }).toEqual([10, 60])
    })

    test('an arm straight out or raised above the shoulder stops at the highest angle', async ({ page }) => {
      await goLive(page)
      await page.evaluate(([h, r]) => Object.assign(window.__feed, { elbowL: r, elbowR: h }), [hang, reach(90)])
      await expect.poll(() => sleeves(page), { timeout: 10000 }).toEqual([82, 10])
      await page.evaluate(([h, up]) => Object.assign(window.__feed, { elbowL: h, elbowR: up }), [hang, { out: 0, down: -100, v: 1 }])
      await expect.poll(() => sleeves(page), { timeout: 10000 }).toEqual([10, 82])
    })

    test('a lost elbow is held for 300 ms, then the sleeve eases to the arms-down angle', async ({ page }) => {
      await goLive(page)
      await page.evaluate((e) => Object.assign(window.__feed, { elbowL: e, elbowR: e }), reach(60))
      await expect.poll(() => sleeves(page), { timeout: 10000 }).toEqual([60, 60])
      await page.evaluate(() => Object.assign(window.__feed, { elbowL: { out: 0, down: 100, v: 0 } }))
      // Settles at 12 degrees on the left only, after about 600 ms.
      await expect.poll(() => sleeves(page), { timeout: 10000 }).toEqual([12, 60])
    })

    test('without elbow landmarks both sleeves read the arms-down angle', async ({ page }) => {
      await goLive(page)
      await expect.poll(() => sleeves(page), { timeout: 10000 }).toEqual([12, 12])
    })
  })
})
