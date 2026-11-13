import { expect, test } from '@playwright/test'
import { start, stubCamera } from '../shared/tryOn'

// The REAL MediaPipe library (no dev pose feed) on the stub camera. Its logger posts usage to odml.pa.googleapis.com on a 60 s timer and when a
// landmarker closes; the page must never send it. The stub video has no body, so tracking settles on "lost" (detect ran without error).

test.describe('AR try-on privacy', () => {
  test('no request goes to the MediaPipe telemetry host, while tracking still runs', async ({ page }) => {
    // Slow under load: loading the real model takes most of the default 30 s.
    test.setTimeout(60000)
    const sent: string[] = []
    page.on('request', (r) => {
      if (new URL(r.url()).hostname === 'odml.pa.googleapis.com') sent.push(r.url())
    })
    await page.route('https://odml.pa.googleapis.com/**', (route) => {
      sent.push(route.request().url())
      return route.abort()
    })
    await stubCamera(page, 'live')
    await start(page)
    await page.goto('/shop/linen-shirt/try-on')
    await page.getByRole('button', { name: 'Turn on camera' }).click({ timeout: 15000 })
    await expect(page.locator('[data-tracking="lost"]')).toBeVisible({ timeout: 60000 })
    // Let a few detections run, then leave the page in the app: unmounting closes the landmarker, which flushes the logger.
    await page.waitForTimeout(2000)
    await expect(page.locator('[data-tracking="failed"]')).toHaveCount(0)
    await page.goBack()
    await page.waitForTimeout(1500)
    expect(sent).toEqual([])
  })
})
