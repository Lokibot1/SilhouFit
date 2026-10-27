import { expect, test, type Page } from '@playwright/test'
import { mockProducts, seedCatalogue, type MockProduct } from '../shared/products'
import { mockAuth } from '../shared/session'
import { mockSizeMeasurements, sizeRow, type SizeMeasurementsMock } from '../shared/sizeMeasurements'

// The size guide on the product page. Linen Shirt (Hoodie) comes in S and M; Wool Trousers (Pants) in 30. Base rows come from the
// mockSizeMeasurements stand-in for GET /size-measurements, which the backend has not shipped yet.

const BASE = [
  sizeRow({ category: 'Hoodie', size: 'S', chestWidthCm: 52, totalLengthCm: 66 }),
  sizeRow({ category: 'Hoodie', size: 'M', chestWidthCm: 55, totalLengthCm: 70 }),
  sizeRow({ category: 'Pants', size: '30', chestWidthCm: null, waistWidthCm: 39, hipWidthCm: 50, inseamCm: 78, thighCm: 29, totalLengthCm: 100, shoulderWidthCm: null, sleeveLengthCm: null, neckCm: null }),
]
const OWN = { chestWidthCm: 58, waistWidthCm: null, hipWidthCm: 57, totalLengthCm: 72, inseamCm: null, shoulderWidthCm: null, sleeveLengthCm: null, neckCm: null, thighCm: null }

let sizes: SizeMeasurementsMock

async function start(page: Page, { unavailable = false, products = seedCatalogue() }: { unavailable?: boolean; products?: MockProduct[] } = {}) {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await mockAuth(page)
  await mockProducts(page, products)
  sizes = await mockSizeMeasurements(page, BASE, { unavailable })
}

async function openGuide(page: Page, slug: string) {
  await page.goto(`/shop/${slug}`)
  const button = page.getByRole('button', { name: 'Size guide' })
  await expect(button).toBeVisible({ timeout: 15000 })
  await button.click()
  const dialog = page.getByRole('dialog', { name: 'Size guide' })
  await expect(dialog).toBeVisible()
  return { button, dialog }
}

const noPageScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 375, height: 667 }]] as const) {
  test.describe(name, () => {
    test.use({ viewport })
    // The table shows from md up, the cards below it; only one is visible at a time.
    const grid = (page: Page) => (viewport.width >= 768 ? page.getByRole('table') : page.getByRole('dialog').getByRole('list'))

    test('opens from the product page and shows the standard values per category', async ({ page }) => {
      await start(page)
      const { dialog } = await openGuide(page, 'linen-shirt')
      await expect(dialog.getByText('Garment measurements in cm')).toBeVisible()
      await expect(grid(page)).toContainText('52')
      await expect(grid(page)).toContainText('70')
      await expect(grid(page)).toContainText('Standard for Hoodie')
      expect(sizes.of('GET').map((c) => c.query.category)).toEqual(['Hoodie'])
    })

    test('uses the standard Pants columns for a pair of trousers', async ({ page }) => {
      await start(page)
      await openGuide(page, 'wool-trousers')
      await expect(grid(page)).toContainText('Standard for Pants')
      await expect(grid(page)).toContainText('78')
      await expect(grid(page)).toContainText(/Inseam/)
    })

    test('replaces the standard row with the piece measurements where it has them', async ({ page }) => {
      const products = seedCatalogue()
      products[0].variants[1].measurements = OWN // Linen Shirt M, Black
      await start(page, { products })
      await openGuide(page, 'linen-shirt')
      await expect(grid(page)).toContainText('This piece')
      await expect(grid(page)).toContainText('58')
      await expect(grid(page)).toContainText('57')
      await expect(grid(page)).toContainText('Hip width')
      await expect(grid(page)).not.toContainText('55')
      await expect(grid(page)).toContainText('52') // S stays standard
    })

    test('highlights the picked size', async ({ page }) => {
      await start(page)
      await page.goto('/shop/linen-shirt')
      await page.getByRole('radio', { name: 'M', exact: true }).check({ force: true })
      await page.getByRole('button', { name: 'Size guide' }).click()
      const current = page.getByRole('dialog').locator('[aria-current="true"]:visible')
      await expect(current).toHaveCount(1)
      await expect(current).toContainText('M')
    })

    test('falls back quietly while the measurements service answers 404', async ({ page }) => {
      await start(page, { unavailable: true })
      const { dialog } = await openGuide(page, 'linen-shirt')
      await expect(dialog.getByText("Size guide isn't available for this piece yet")).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(page.getByRole('table')).toHaveCount(0)
    })

    test('shows the piece measurements when the service answers 404', async ({ page }) => {
      const products = seedCatalogue()
      products[0].variants[1].measurements = OWN
      await start(page, { unavailable: true, products })
      await openGuide(page, 'linen-shirt')
      await expect(grid(page)).toContainText('58')
      await expect(grid(page)).toContainText('Not available') // S has neither source
    })
  })
}

test.describe('small screens and keyboard', () => {
  test('has no horizontal scroll at 320px, open or closed', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await start(page)
    await openGuide(page, 'linen-shirt')
    expect(await noPageScroll(page)).toBe(true)
    const dialog = await page.getByRole('dialog', { name: 'Size guide' }).evaluate((el) => el.scrollWidth <= el.clientWidth)
    expect(dialog).toBe(true)
  })

  test('Escape closes it and focus returns to the Size guide button', async ({ page }) => {
    await start(page)
    const { button, dialog } = await openGuide(page, 'linen-shirt')
    await expect(dialog).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(button).toBeFocused()
  })

  test('Tab stays inside the dialog', async ({ page }) => {
    await start(page)
    const { dialog } = await openGuide(page, 'linen-shirt')
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
  })
})

test.describe('dark mode', () => {
  test('renders readable text on the dialog surface', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
    await start(page)
    const { dialog } = await openGuide(page, 'linen-shirt')
    await expect(page.locator('html')).toHaveClass(/dark/)
    const { text, surface } = await dialog.evaluate((el) => ({
      text: getComputedStyle(el.querySelector('p')!).color,
      surface: getComputedStyle(el).backgroundColor,
    }))
    expect(text).not.toBe(surface)
  })
})
