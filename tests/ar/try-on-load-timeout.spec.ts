import { expect, test } from '@playwright/test'
import { start, stubCamera } from '../shared/tryOn'

// The real library with its wasm stalled: after 20 s the tracking load gives up and shows the failed state with its retry.

test('body tracking that has not loaded in 20 s fails with a retry button', async ({ page }) => {
  await page.clock.install()
  await page.clock.resume()
  // Only the fetch of the wasm file itself stalls, not Vite's `?url` module that names it.
  await page.route(/\.wasm$/, () => {})
  await stubCamera(page, 'live')
  await start(page)
  await page.goto('/shop/linen-shirt/try-on')
  await page.getByRole('button', { name: 'Turn on camera' }).click({ timeout: 15000 })
  await expect(page.locator('[data-tracking="loading"]')).toBeVisible({ timeout: 15000 })
  await page.clock.fastForward(10_000)
  await expect(page.locator('[data-tracking="loading"]')).toBeVisible()
  await page.clock.fastForward(11_000)
  await expect(page.locator('[data-tracking="failed"]')).toBeVisible()
  await expect(page.getByText("Body tracking didn't load.")).toBeVisible()
  const retry = page.getByRole('button', { name: 'Try tracking again' })
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
})
