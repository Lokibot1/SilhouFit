import { expect, test } from '@playwright/test'
import { goLive } from '../shared/arFeed'

// The person mask that cuts the shirt to the silhouette. A synthetic mask (64 x 48, a centred box) comes from the dev feed; the specs read
// data-mask (waiting, on, off) and data-mask-coverage and never pixels or mask bytes.

const BOX: [number, number, number, number] = [16, 12, 48, 36]

test.describe('AR try-on person mask', () => {
  test('waits without a mask, and is on with the box share as coverage once one arrives', async ({ page }) => {
    await goLive(page)
    await expect(page.locator('[data-mask]')).toHaveAttribute('data-mask', 'waiting')
    await page.waitForTimeout(500)
    await expect(page.locator('[data-mask]')).toHaveAttribute('data-mask', 'waiting')
    await page.evaluate((box) => (window.__arFeed.mask = { w: 64, h: 48, box }), BOX)
    await expect(page.locator('[data-mask]')).toHaveAttribute('data-mask', 'on', { timeout: 10000 })
    // 32 x 24 of 64 x 48.
    await expect(page.locator('[data-mask]')).toHaveAttribute('data-mask-coverage', '0.25')
    await page.evaluate(() => (window.__arFeed.mask = { w: 64, h: 48, box: [0, 0, 64, 48] }))
    await expect(page.locator('[data-mask]')).toHaveAttribute('data-mask-coverage', '1.00', { timeout: 10000 })
  })

  test('stays on while the body is lost for a moment', async ({ page }) => {
    await goLive(page)
    await page.evaluate((box) => (window.__arFeed.mask = { w: 64, h: 48, box }), BOX)
    await expect(page.locator('[data-mask]')).toHaveAttribute('data-mask', 'on', { timeout: 10000 })
    await page.evaluate(() => (window.__arFeed.off = true))
    await expect(page.locator('[data-mask]')).toHaveAttribute('data-mask', 'on')
    await page.waitForTimeout(150)
    await expect(page.locator('[data-mask]')).toHaveAttribute('data-mask', 'on')
  })

  test('a busy device drops the mask before tracking is called too slow', async ({ page }) => {
    await goLive(page)
    await page.evaluate((box) => Object.assign(window.__arFeed, { mask: { w: 64, h: 48, box }, busyMs: 40 }), BOX)
    await expect(page.locator('[data-mask]')).toHaveAttribute('data-mask', 'on', { timeout: 10000 })
    await expect(page.locator('[data-mask]')).toHaveAttribute('data-mask', 'off', { timeout: 15000 })
    await expect(page.locator('[data-tracking]')).not.toHaveAttribute('data-tracking', 'slow')
  })
})
