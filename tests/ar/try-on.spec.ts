import { expect, test, type Page } from '@playwright/test'
import { CORS, shirt, stage, start, stubCamera } from '../shared/tryOn'

// The AR try-on page. Linen Shirt (Shirt, AR ready) comes in S, M, L (with standard rows) and XL (without one), in Navy and Black.
// The camera is stubbed, so no hardware is needed; the specs assert the page's state, never pixels, as WebGL may be software here.

const noPageScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test.describe('AR try-on', () => {
  test('preselects the recommended size and colour, and a size change updates the fit and the model scale', async ({ page }) => {
    await start(page)
    await page.goto('/shop/linen-shirt/try-on?color=Black')
    await expect(page.getByRole('radio', { name: 'M', exact: true })).toBeChecked({ timeout: 15000 })
    await expect(page.getByRole('radio', { name: 'Black' })).toBeChecked()
    await expect(page.getByRole('radio', { name: /^XL/ })).toBeDisabled()
    await expect(page.getByText('Preview: not tracked to your body yet')).toBeVisible()
    await expect(stage(page)).toHaveAttribute('data-size', 'M')
    await expect(page.getByRole('status').filter({ hasText: 'Size M in Black: regular fit' })).toBeVisible()
    await expect(page.getByRole('table')).toContainText('Regular fit')
    const before = await stage(page).getAttribute('data-scale')

    await page.getByRole('radio', { name: 'L', exact: true }).check({ force: true })
    await expect(stage(page)).toHaveAttribute('data-size', 'L')
    await expect(stage(page)).not.toHaveAttribute('data-scale', before!)
    await expect(page.getByRole('table')).toContainText('Loose fit')
    await expect(page.getByRole('table')).toContainText('+16.0 cm')
    await expect(page.getByRole('status').filter({ hasText: 'Size L in Black: loose fit' })).toBeVisible()
    expect(await noPageScroll(page)).toBe(true)
  })

  test('asks for consent, then shows the camera and turns it off', async ({ page }) => {
    await stubCamera(page, 'live')
    await start(page)
    await page.goto('/shop/linen-shirt/try-on')
    await expect(page.getByText('Your camera feed stays on this device. Nothing is recorded or uploaded.', { exact: false })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Turn on camera' }).click()
    await expect(page.getByRole('button', { name: 'Turn camera off' })).toBeVisible()
    await page.getByRole('button', { name: 'Turn camera off' }).click()
    await expect(page.getByRole('button', { name: 'Turn on camera' })).toBeVisible()
  })

  for (const width of [320, 768]) {
    test(`the consent card does not cover the stage at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await start(page)
      await page.goto('/shop/linen-shirt/try-on')
      const card = page.getByRole('group', { name: 'Camera' })
      await expect(card).toBeVisible({ timeout: 15000 })
      await expect(card).toContainText('Body tracking runs on this device. The first time, it downloads about 20 MB of tracking files.')
      const [stageBox, cardBox] = await Promise.all([stage(page).boundingBox(), card.boundingBox()])
      expect(cardBox!.y).toBeGreaterThanOrEqual(stageBox!.y + stageBox!.height - 1)
      expect(await noPageScroll(page)).toBe(true)
    })
  }

  for (const [name, title] of [
    ['NotAllowedError', 'Camera access is blocked'],
    ['NotFoundError', 'No camera found'],
    ['NotReadableError', 'The camera is busy'],
  ]) {
    test(`${name} shows ${title} and the page keeps working without the camera`, async ({ page }) => {
      await stubCamera(page, name)
      await start(page)
      await page.goto('/shop/linen-shirt/try-on')
      await page.getByRole('button', { name: 'Turn on camera' }).click({ timeout: 15000 })
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
      await page.getByRole('button', { name: 'Continue without camera' }).click()
      await expect(page.getByRole('heading', { name: title })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Turn on camera' })).toBeVisible()
      await page.getByRole('radio', { name: 'L', exact: true }).check({ force: true })
      await expect(stage(page)).toHaveAttribute('data-size', 'L')
    })
  }

  test('without a saved body profile it says how to get fit details and links to the measurements', async ({ page }) => {
    await start(page, { profile: false })
    await page.goto('/shop/linen-shirt/try-on')
    await expect(page.getByText('Add your measurements to see how each size fits')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('link', { name: 'Add measurements' })).toHaveAttribute('href', '/profile/measurements')
    await expect(stage(page)).toHaveAttribute('data-size', 'S')
  })

  test('a failed product request shows the error, and Try again recovers', async ({ page }) => {
    await start(page)
    let failed = false
    await page.route('**/products/slug/linen-shirt', (route) => {
      if (route.request().method() === 'OPTIONS' || failed) return route.fallback()
      failed = true
      return route.fulfill({ status: 500, json: { message: 'boom' }, headers: CORS })
    })
    await page.goto('/shop/linen-shirt/try-on')
    await expect(page.getByRole('alert')).toContainText('This piece did not load', { timeout: 30000 })
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(stage(page)).toBeVisible({ timeout: 15000 })
  })

  test('a piece that is not a shirt says AR try-on is not available', async ({ page }) => {
    await start(page, { products: [shirt({ category: 'Hoodie' })] })
    await page.goto('/shop/linen-shirt/try-on')
    await expect(page.getByRole('heading', { name: "AR try-on isn't available for this piece yet" })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('link', { name: 'Back to product' })).toHaveAttribute('href', '/shop/linen-shirt')
  })
})
