import { expect, test } from '@playwright/test'
import { goLive } from '../shared/arFeed'

// A WebGL context the browser takes away mid-session (forced with WEBGL_lose_context): the photo replaces the shirt, says what happened and
// offers a 44 px retry that rebuilds the scene, after which tracking resumes.

test('a lost WebGL context shows why and a retry button that brings the shirt and tracking back', async ({ page }) => {
  await goLive(page)
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-tracking] canvas') as HTMLCanvasElement
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext
    gl.getExtension('WEBGL_lose_context')!.loseContext()
  })
  await expect(page.getByText('The 3D preview stopped because the browser took back the graphics memory', { exact: false })).toBeVisible()
  const retry = page.getByRole('button', { name: 'Try the 3D preview again' })
  await expect(retry).toBeVisible()
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await retry.click()
  await expect(page.locator('[data-tracking="tracking"]')).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Try the 3D preview again' })).toHaveCount(0)
  await expect(page.locator('[data-tracking] canvas')).toHaveCount(1)
  await expect(page.locator('[data-garment]')).toBeVisible()
})
