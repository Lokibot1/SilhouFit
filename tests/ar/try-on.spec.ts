import { expect, test, type Page } from '@playwright/test'
import { signInViaForm } from '../shared/checkoutOrders'
import { mockProducts, product, variant, type MockProduct } from '../shared/products'
import { mockAuth } from '../shared/session'
import { mockSizeMeasurements, sizeRow } from '../shared/sizeMeasurements'

// The AR try-on page. Linen Shirt (Shirt, AR ready) comes in S, M, L (with standard rows) and XL (without one), in Navy and Black.
// The camera is stubbed, so no hardware is needed; the specs assert the page's state, never pixels, as WebGL may be software here.

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const BASE = [
  sizeRow({ category: 'Shirt', size: 'S', chestWidthCm: 48, totalLengthCm: 66, shoulderWidthCm: 42, sleeveLengthCm: 20 }),
  sizeRow({ category: 'Shirt', size: 'M', chestWidthCm: 52, totalLengthCm: 70, shoulderWidthCm: 44, sleeveLengthCm: 21 }),
  sizeRow({ category: 'Shirt', size: 'L', chestWidthCm: 56, totalLengthCm: 72, shoulderWidthCm: 46, sleeveLengthCm: 22 }),
]
// Chest 96 cm, no sleeve length (a short sleeve is compared with the whole arm): S is too tight at the shoulders, M regular (+8.0), L loose (+16.0).
const PROFILE = {
  heightCm: 175, weightKg: null, shoulderWidthCm: 44, chestCm: 96, bustCm: null, torsoLengthCm: null, waistCm: 82, hipsCm: null,
  inseamCm: null, outseamCm: null, thighCm: null, armLengthCm: null, bodyModel: 'male', bodyBuild: 'regular',
}

const shirt = (overrides: Partial<MockProduct> = {}) =>
  product({
    category: 'Shirt',
    isArReady: true,
    variants: ['S', 'M', 'L', 'XL'].flatMap((size) => [
      variant({ size, color: 'Navy', colorHex: '#1b2a49', sku: `LS-NAVY-${size}` }),
      variant({ size, color: 'Black', colorHex: '#111111', sku: `LS-BLACK-${size}` }),
    ]),
    ...overrides,
  })

async function start(page: Page, { products = [shirt()], profile = true }: { products?: MockProduct[]; profile?: boolean } = {}) {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await mockAuth(page)
  await mockProducts(page, products)
  await mockSizeMeasurements(page, BASE)
  await page.route('**/users/me/body-profile', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    return profile ? route.fulfill({ json: PROFILE, headers: CORS }) : route.fulfill({ status: 404, json: {}, headers: CORS })
  })
  await signInViaForm(page)
}

/** Stands in for the camera: a live stream from a canvas, or a rejection with the DOMException name of that failure. */
async function stubCamera(page: Page, mode: string) {
  await page.addInitScript((m) => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          if (m !== 'live') return Promise.reject(new DOMException('stub', m))
          return Promise.resolve(document.createElement('canvas').captureStream())
        },
      },
    })
  }, mode)
}

const stage = (page: Page) => page.getByRole('group', { name: 'AR try-on preview' })
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
