import { expect, test, type Page } from '@playwright/test'
import { shirt, stage, start, stubCamera } from '../shared/tryOn'

// The shirt following the customer's shoulders. MediaPipe is never loaded here: in development the stage reads poses from
// window.__silhoufitPoseFeed, which these specs drive. The specs assert the DOM and data attributes, never pixels, as WebGL may be software here.

declare global {
  interface Window {
    __feed: { centreX: number; y: number; off: boolean }
  }
}

/** A person facing the camera whose shoulders are 0.2 of the frame apart, centred at raw x `centreX`; `off` is no body in view. */
async function feedPoses(page: Page) {
  await page.addInitScript(() => {
    window.__feed = { centreX: 0.5, y: 0.4, off: false }
    window.__silhoufitPoseFeed = () => {
      const f = window.__feed
      if (f.off) return null
      const image = []
      const world = []
      image[11] = { x: f.centreX + 0.1, y: f.y, visibility: 1 }
      image[12] = { x: f.centreX - 0.1, y: f.y, visibility: 1 }
      world[11] = { x: 0.2, y: 0, z: 0 }
      world[12] = { x: -0.2, y: 0, z: 0 }
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
})
