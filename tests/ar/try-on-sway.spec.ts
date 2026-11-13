import { expect, test, type Page } from '@playwright/test'
import { goLive } from '../shared/arFeed'

// The hem and cuffs lag the body (arLook.ts Sway). The stage reports the offset in px as data-sway; the specs read that, never pixels.

const sway = async (page: Page) => Number(await page.locator('[data-sway]').getAttribute('data-sway'))
const swing = (page: Page) =>
  page.evaluate(() => {
    const t0 = performance.now()
    ;(window as unknown as { __swing: number }).__swing = window.setInterval(() => (window.__arFeed.centreX = 0.5 + 0.12 * Math.sin((performance.now() - t0) / 250)), 16)
  })
const stopSwing = (page: Page) =>
  page.evaluate(() => {
    clearInterval((window as unknown as { __swing: number }).__swing)
    window.__arFeed.centreX = 0.5
  })

test.describe('AR try-on fabric sway', () => {
  test('is at rest while the person is still, lags while they move, and settles again when they stop', async ({ page }) => {
    await goLive(page)
    await expect(page.locator('[data-sway]')).toHaveAttribute('data-sway', '0.0', { timeout: 10000 })
    await swing(page)
    await expect.poll(() => sway(page), { timeout: 10000 }).toBeGreaterThan(1)
    // Never more than 2.5% of the drawn garment width (data-garment's last number).
    const width = Number((await page.locator('[data-garment]').getAttribute('data-garment'))!.split(',')[5])
    for (let i = 0; i < 10; i++) {
      expect(await sway(page)).toBeLessThanOrEqual(0.025 * width + 0.1)
      await page.waitForTimeout(100)
    }
    await stopSwing(page)
    await expect(page.locator('[data-sway]')).toHaveAttribute('data-sway', '0.0', { timeout: 10000 })
  })

  test('stays at zero with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await goLive(page)
    await swing(page)
    await page.waitForTimeout(1500)
    expect(await sway(page)).toBe(0)
  })

  test('is gone with the camera', async ({ page }) => {
    await goLive(page)
    await expect(page.locator('[data-sway]')).toBeVisible()
    await page.getByRole('button', { name: 'Turn camera off' }).click()
    await expect(page.locator('[data-sway]')).toHaveCount(0)
  })
})
