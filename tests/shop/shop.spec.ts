import { expect, test, type Locator, type Page } from '@playwright/test'
import { DEVICE_MATRIX } from '../shared/viewports'

const WIDTHS = [320, 640, 768, 1024, 1280, 1920]
const MIN_TARGET = 44

test.beforeEach(async ({ page }) => {
  // Keep the cookie banner out of the way; pick the theme per test.
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

const cards = (page: Page) => page.getByRole('article')
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search the catalogue' })
const filtersButton = (page: Page) => page.getByRole('button', { name: /^Filters/ })
const pill = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) })

async function openShop(page: Page, query = '') {
  await page.goto(`/shop${query}`)
  await expect(cards(page).first()).toBeVisible()
}

// Keyboard-only: press Tab from wherever focus is until the target holds it.
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 80; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Never reached the target by pressing Tab')
}

const overflows = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

async function expectTarget(control: Locator, width: number, label: string) {
  await control.scrollIntoViewIfNeeded()
  const box = await control.boundingBox()
  expect(box, `${label} is laid out`).not.toBeNull()
  expect(box!.height, `${label} height at ${width}px`).toBeGreaterThanOrEqual(MIN_TARGET)
  expect(box!.width, `${label} width at ${width}px`).toBeGreaterThanOrEqual(MIN_TARGET)
  expect(box!.x, `${label} starts inside the viewport`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${label} ends inside the viewport`).toBeLessThanOrEqual(width)
}

test('renders the catalogue with its own title, description, one h1 and a footer', async ({ page }) => {
  await openShop(page)
  await expect(page).toHaveTitle('Shop the catalogue — SilhouFit')
  await expect(page.getByRole('heading', { level: 1, name: 'Shop the rail' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(cards(page)).toHaveCount(12)
  await expect(page.getByText(/^24 pieces$/)).toBeVisible()
  await expect(page.getByText(/^Stock synced \d{1,2}:\d{2}\s?[AP]M$/)).toBeVisible()
  await expect(page.getByRole('contentinfo')).toHaveCount(1)

  const description = await page.locator('meta[name="description"]').getAttribute('content')
  expect(description?.length).toBeGreaterThanOrEqual(150)
  expect(description?.length).toBeLessThanOrEqual(160)
})

test('highlights Shop in the navbar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openShop(page)
  await expect(page.locator('a[href="/shop"][aria-current="true"]').first()).toBeVisible()
})

test('links the promo to the AR fitting and sizing sections', async ({ page }) => {
  await openShop(page)
  await expect(page.getByRole('link', { name: 'See how AR fitting works' })).toHaveAttribute('href', '/#ar-fitting')
  await expect(page.getByRole('link', { name: 'How sizing works' })).toHaveAttribute('href', '/about#how-it-works')
})

for (const width of WIDTHS) {
  test(`fits ${width}px wide with 44px controls and no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openShop(page)
    expect(await overflows(page), `/shop overflows horizontally at ${width}px`).toBe(false)

    await expectTarget(search(page), width, 'search')
    await expectTarget(pill(page, 'All'), width, 'All pill')
    await expectTarget(filtersButton(page), width, 'Filters')
    await expectTarget(page.getByRole('button', { name: 'Grid view' }), width, 'Grid view')
    await expectTarget(page.getByRole('button', { name: 'List view' }), width, 'List view')
    await expectTarget(page.getByLabel('Sort by'), width, 'Sort by')
    await expectTarget(page.getByLabel('Pieces per page'), width, 'Pieces per page')
    await expectTarget(page.getByRole('button', { name: /^Save .* to wishlist$/ }).first(), width, 'heart')
    await expectTarget(page.getByRole('button', { name: 'Next' }), width, 'Next')
    await expectTarget(page.getByRole('link', { name: 'See how AR fitting works' }), width, 'promo link')
  })

  test(`list view stays inside ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openShop(page, '?view=list')
    expect(await overflows(page), `list view overflows at ${width}px`).toBe(false)
    await page.getByRole('button', { name: 'Next' }).scrollIntoViewIfNeeded()
    expect(await overflows(page)).toBe(false)
  })
}

for (const { name, width, height } of DEVICE_MATRIX) {
  test(`${name} ${width}x${height}: no horizontal scroll and the filter panel fits`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await openShop(page)
    expect(await overflows(page), `/shop overflows at ${width}x${height}`).toBe(false)

    await filtersButton(page).click()
    const dialog = page.getByRole('dialog', { name: 'Filters' })
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await expect(dialog.getByRole('button', { name: 'Apply' })).toBeInViewport()
  })
}

test('reaches search, pills, Filters, hearts and pagination with the keyboard alone', async ({ page }) => {
  await openShop(page)
  await tabTo(page, pill(page, 'Tops'))
  await page.keyboard.press('Enter')
  await expect(pill(page, 'Tops')).toHaveAttribute('aria-pressed', 'true')
  await tabTo(page, search(page))

  await tabTo(page, filtersButton(page))
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Filters' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(filtersButton(page)).toBeFocused()

  const heart = page.getByRole('button', { name: /^Save .* to wishlist$/ }).first()
  await tabTo(page, heart)
  await page.keyboard.press('Space')
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Saved 1')).toBeVisible()
})

test('keeps focus inside the filter panel while tabbing', async ({ page }) => {
  await openShop(page)
  await filtersButton(page).click()
  const dialog = page.getByRole('dialog', { name: 'Filters' })
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }
})

test('applies filters and keeps them after a reload', async ({ page }) => {
  await openShop(page)
  await filtersButton(page).click()
  const dialog = page.getByRole('dialog', { name: 'Filters' })
  await dialog.getByRole('checkbox', { name: 'AR-ready pieces only' }).check()
  await dialog.getByRole('button', { name: 'Apply' }).click()
  await expect(page).toHaveURL(/ar=1/)
  await expect(filtersButton(page)).toContainText('1')
  const count = await cards(page).count()
  expect(count).toBeLessThan(12)

  await page.reload()
  await expect(cards(page)).toHaveCount(count)
})

test('paginates and resets to page 1 when the category changes', async ({ page }) => {
  await openShop(page)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.getByText('Page 2 of 2').first()).toBeAttached()
  await expect(page.getByRole('heading', { level: 2, name: 'All pieces' })).toBeFocused()

  await pill(page, 'Tops').click()
  await expect(page).toHaveURL(/category=Tops/)
  await expect(page).not.toHaveURL(/page=/)
})

test('Back restores the previous URL state and pill selection', async ({ page }) => {
  await openShop(page)
  await pill(page, 'Tops').click()
  await expect(page).toHaveURL(/category=Tops/)
  await pill(page, 'Knitwear').click()
  await expect(page).toHaveURL(/category=Knitwear/)

  await page.goBack()
  await expect(page).toHaveURL(/category=Tops/)
  await expect(pill(page, 'Tops')).toHaveAttribute('aria-pressed', 'true')
  await page.goBack()
  await expect(pill(page, 'All')).toHaveAttribute('aria-pressed', 'true')
})

test('search shows the empty state and "Clear search and filters" brings the catalogue back', async ({ page }) => {
  await openShop(page)
  await search(page).fill('zzzz')
  await expect(page.getByText('No pieces match "zzzz"')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search and filters' }).click()
  await expect(cards(page)).toHaveCount(12)
  await expect(search(page)).toHaveValue('')
})

test('Back after "Clear search and filters" brings the old search text back', async ({ page }) => {
  await openShop(page)
  await search(page).fill('zzzz')
  await expect(page).toHaveURL(/q=zzzz/)
  await page.getByRole('button', { name: 'Clear search and filters' }).click()
  await expect(search(page)).toHaveValue('')
  await expect(page.getByRole('heading', { level: 2, name: 'All pieces' })).toBeFocused()

  await page.goBack()
  await expect(search(page)).toHaveValue('zzzz')
  await expect(page.getByText('No pieces match "zzzz"')).toBeVisible()
})

test('shows an error with a retry for a failed load, then recovers', async ({ page }) => {
  await page.goto('/shop?fail')
  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText(/did not load/i)

  // The dev-only failure keys off the URL, so drop it before retrying.
  await page.evaluate(() => history.replaceState(null, '', '/shop'))
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(cards(page).first()).toBeVisible()
  await expect(alert).toHaveCount(0)
})

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
  })

  test('renders the catalogue and filter panel with readable text', async ({ page }) => {
    await openShop(page)
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('heading', { level: 1, name: 'Shop the rail' })).toBeVisible()
    await expect(cards(page).first()).toBeVisible()

    const { heading, background } = await page.evaluate(() => ({
      heading: getComputedStyle(document.querySelector('h1')!).color,
      background: getComputedStyle(document.body).backgroundColor,
    }))
    expect(heading).not.toBe(background)

    await filtersButton(page).click()
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible()
  })
})
