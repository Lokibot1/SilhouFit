import { expect, test, type Page } from '@playwright/test'
import { goLive } from '../shared/arFeed'

// The shirt fitted to the torso, not only the shoulders. The dev feed gives the hips (video px below the shoulder line, 128 px apart at the
// shoulders, so 166 px is the average 1.3 torso); the stage reports data-fit="vy,hip,pitch" (vertical factor, hem width factor, lean in degrees).

async function fit(page: Page) {
  const raw = await page.locator('[data-fit]').getAttribute('data-fit')
  const [vy, hip, pitch] = raw!.split(',').map(Number)
  return { vy, hip, pitch }
}
const hips = (page: Page, h: { down: number; v: number; half?: number; z?: number } | undefined) => page.evaluate((v) => (window.__arFeed.hips = v), h)

test.describe('AR try-on torso fit', () => {
  test('without hip landmarks the shirt is fitted by the shoulders alone', async ({ page }) => {
    await goLive(page)
    await expect(page.locator('[data-fit]')).toHaveAttribute('data-fit', '1.00,1.00,0.0')
    await page.waitForTimeout(500)
    await expect(page.locator('[data-fit]')).toHaveAttribute('data-fit', '1.00,1.00,0.0')
  })

  test('a long torso draws a longer shirt, a short one a shorter one, an average one the natural length', async ({ page }) => {
    await goLive(page)
    await hips(page, { down: 195, v: 1 })
    await expect.poll(async () => (await fit(page)).vy, { timeout: 10000 }).toBeGreaterThan(1.1)
    await hips(page, { down: 140, v: 1 })
    await expect.poll(async () => (await fit(page)).vy, { timeout: 10000 }).toBeLessThan(0.92)
    await hips(page, { down: 166, v: 1 })
    await expect.poll(async () => (await fit(page)).vy, { timeout: 10000 }).toBeCloseTo(1, 1)
    // Hips of the average width leave the hem alone; a wider pair widens it a little.
    expect((await fit(page)).hip).toBeCloseTo(1, 1)
    await hips(page, { down: 166, v: 1, half: 0.065 })
    await expect.poll(async () => (await fit(page)).hip, { timeout: 10000 }).toBeGreaterThan(1.05)
  })

  test('hips that go missing or are barely seen ease the shirt back to the shoulders-only fit', async ({ page }) => {
    await goLive(page)
    await hips(page, { down: 195, v: 1 })
    await expect.poll(async () => (await fit(page)).vy, { timeout: 10000 }).toBeGreaterThan(1.1)
    await hips(page, { down: 195, v: 0.3 })
    await expect.poll(async () => (await fit(page)).vy, { timeout: 10000 }).toBeCloseTo(1, 1)
    await hips(page, { down: 195, v: 1 })
    await expect.poll(async () => (await fit(page)).vy, { timeout: 10000 }).toBeGreaterThan(1.1)
    await hips(page, undefined)
    await expect.poll(async () => (await fit(page)).vy, { timeout: 10000 }).toBeCloseTo(1, 1)
  })

  test('leaning toward the camera is a positive pitch, away a negative one', async ({ page }) => {
    await goLive(page)
    await hips(page, { down: 166, v: 1, z: 0.15 })
    await expect.poll(async () => (await fit(page)).pitch, { timeout: 10000 }).toBeGreaterThan(5)
    await hips(page, { down: 166, v: 1, z: -0.15 })
    await expect.poll(async () => (await fit(page)).pitch, { timeout: 10000 }).toBeLessThan(-5)
  })

  test('the page does not scroll sideways with the hips fitted', async ({ page }) => {
    await goLive(page)
    await hips(page, { down: 195, v: 1, z: 0.15 })
    await expect.poll(async () => (await fit(page)).vy, { timeout: 10000 }).toBeGreaterThan(1.1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })
})
