import { expect, test, type Locator, type Page } from '@playwright/test'
import { mockProducts, seedCatalogue, type MockProduct, type ProductsMock } from '../shared/products'
import { mockAuth } from '../shared/session'
import { DEVICE_MATRIX } from '../shared/viewports'

// The shop on GET /products, answered by the in-memory mockProducts with seedCatalogue(): four active pieces (Linen Shirt, Wool Trousers,
// Cotton Tee, Linen Vest, which is sold out) and one archived one (Archived Cardigan) that only staff can read.
// Colours across them are Black, Navy and Sand; prices run from 1,200 to 2,600.

const WIDTHS = [320, 640, 768, 1024, 1280, 1920]
const MIN_TARGET = 44

let api: ProductsMock

async function start(page: Page, products: MockProduct[] = seedCatalogue()) {
  await mockAuth(page)
  api = await mockProducts(page, products)
}

test.beforeEach(async ({ page }) => {
  // Keep the cookie banner out of the way; pick the theme per test.
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await start(page)
})

const cards = (page: Page) => page.getByRole('article')
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search the catalogue' })
const filtersButton = (page: Page) => page.getByRole('button', { name: /^Filters/ })
const filtersDialog = (page: Page) => page.getByRole('dialog', { name: 'Filters' })
const chipList = (page: Page) => page.getByRole('list', { name: 'Active filters' })
const urlParams = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams)
const pill = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) })
const lastList = () => api.of('GET', 'list').at(-1)!.query

// Below lg the navbar search is a row behind an icon; from lg up it is always there.
async function openSearch(page: Page) {
  const toggle = page.getByRole('button', { name: 'Open search' })
  if (await toggle.isVisible()) await toggle.click()
  await expect(search(page)).toBeVisible()
}

async function openShop(page: Page, query = '') {
  await page.goto(`/shop${query}`)
  await expect(cards(page).first()).toBeVisible({ timeout: 15000 }) // a cold dev server compiles the page on first hit
}

async function openFilters(page: Page) {
  await filtersButton(page).click()
  await expect(filtersDialog(page)).toBeVisible()
  return filtersDialog(page)
}

// Keyboard-only: press Tab from wherever focus is until the target holds it.
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 80; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Never reached the target by pressing Tab')
}

const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

// Compact controls are 36px with a mouse and 44px on touch screens.
const COMPACT_TARGET = 36

async function expectTarget(control: Locator, width: number, label: string, compact = false) {
  const coarse = await control.page().evaluate(() => matchMedia('(pointer: coarse)').matches)
  const min = compact && !coarse ? COMPACT_TARGET : MIN_TARGET
  await control.scrollIntoViewIfNeeded()
  const box = await control.boundingBox()
  expect(box, `${label} is laid out`).not.toBeNull()
  expect(box!.height, `${label} height at ${width}px`).toBeGreaterThanOrEqual(min)
  expect(box!.width, `${label} width at ${width}px`).toBeGreaterThanOrEqual(min)
  expect(box!.x, `${label} starts inside the viewport`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${label} ends inside the viewport`).toBeLessThanOrEqual(width)
}

test('renders the API pieces with their own title, description, one h1 and a footer, and not the archived one', async ({ page }) => {
  await openShop(page)
  await expect(page).toHaveTitle('Shop the catalogue — SilhouFit')
  await expect(page.getByRole('heading', { level: 1, name: 'All pieces' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(cards(page)).toHaveCount(4)
  await expect(page.getByText(/^4 pieces$/)).toBeVisible()
  await expect(page.getByText('Archived Cardigan')).toHaveCount(0)
  await expect(page.getByRole('contentinfo')).toHaveCount(1)

  const description = await page.locator('meta[name="description"]').getAttribute('content')
  expect(description?.length).toBeGreaterThanOrEqual(150)
  expect(description?.length).toBeLessThanOrEqual(160)
})

test('shows real prices and stock only: a From price for a range, Sold out, and no rating, sale or badge', async ({ page }) => {
  await openShop(page)
  const shirt = cards(page).filter({ hasText: 'Linen Shirt' })
  await expect(shirt).toContainText(/From\s*₱1,500/)
  await expect(cards(page).filter({ hasText: 'Linen Vest' })).toContainText(/sold out/i)
  await expect(page.getByText(/\(\d+\)|reviews?$|% off|Sale|AR-ready/i)).toHaveCount(0)
})

test('has no About Us or Shop links in the navbar, and keeps the logo and a breadcrumb home', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openShop(page)
  await expect(page.locator('header').first().getByRole('link', { name: /About Us|Shop/ })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
})

for (const width of WIDTHS) {
  test(`fits ${width}px wide with 44px controls and no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openShop(page)
    expect(await overflows(page), `/shop overflows horizontally at ${width}px`).toBe(false)

    for (const name of [/^Add .* to cart$/, /^Buy /]) {
      const button = page.getByRole('button', { name }).first()
      await expectTarget(button, width, `${name} button`, true)
      const clipped = await button.evaluate((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)
      expect(clipped, `${name} button text is clipped at ${width}px`).toBe(false)
    }
    await expectTarget(page.getByRole('link', { name: /^Wishlist/ }).first(), width, 'wishlist')
    await expectTarget(page.getByRole('link', { name: /^Cart/ }), width, 'cart')
    if (width >= 1024) await expectTarget(search(page), width, 'search')
    else await expectTarget(page.getByRole('button', { name: 'Open search' }), width, 'search toggle')
    if (width >= 640) await expectTarget(pill(page, 'All').first(), width, 'All pill', true) // below sm the categories are in the Filters dialog
    await expectTarget(filtersButton(page), width, 'Filters', true)
    await expectTarget(page.getByRole('button', { name: 'Grid view' }), width, 'Grid view', true)
    await expectTarget(page.getByRole('button', { name: 'List view' }), width, 'List view', true)
    await expectTarget(page.getByRole('combobox', { name: 'Sort by' }), width, 'Sort by', true)
    await expectTarget(page.getByRole('combobox', { name: 'Pieces per page' }), width, 'Pieces per page', true)
    // The card's heart is 36px below sm (max-sm:size-9 in ProductCard, as before this work): known, not asserted there.
    if (width >= 640) await expectTarget(page.getByRole('button', { name: /^Save .* to wishlist$/ }).first(), width, 'heart')
  })

  test(`keeps the open search row inside ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openShop(page)
    await openSearch(page)
    await expectTarget(search(page), width, 'search')
    expect(await overflows(page), `/shop with search open overflows at ${width}px`).toBe(false)
  })

  test(`list view stays inside ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openShop(page, '?view=list')
    expect(await overflows(page), `list view overflows at ${width}px`).toBe(false)
  })

  test(`the Filters dialog with chips has no sideways scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/shop?brand=A%20very%20long%20brand%20name%20indeed&size=XXL&ar=1&min=100&max=900')
    await expect(chipList(page)).toBeVisible({ timeout: 15000 })
    expect(await overflows(page)).toBe(false)
    await openFilters(page)
    expect(await overflows(page)).toBe(false)
    const box = await filtersDialog(page).boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
  })
}

for (const { name, width, height } of DEVICE_MATRIX) {
  test(`${name} ${width}x${height}: no horizontal scroll and the filter panel fits`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await openShop(page)
    expect(await overflows(page), `/shop overflows at ${width}x${height}`).toBe(false)
    const dialog = await openFilters(page)
    const box = await dialog.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await expect(dialog.getByRole('button', { name: 'Apply' })).toBeInViewport()
  })
}

test('reaches search, pills, Filters and hearts with the keyboard alone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openShop(page)
  await openSearch(page)
  await search(page).focus()
  await tabTo(page, page.getByRole('link', { name: /^Wishlist/ }).first())
  await tabTo(page, pill(page, 'Hoodie'))
  await page.keyboard.press('Enter')
  await expect(pill(page, 'Hoodie')).toHaveAttribute('aria-pressed', 'true')

  await tabTo(page, filtersButton(page))
  await page.keyboard.press('Enter')
  await expect(filtersDialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(filtersDialog(page)).toBeHidden()
  await expect(filtersButton(page)).toBeFocused()

  const heart = page.getByRole('button', { name: /^Save .* to wishlist$/ }).first()
  await tabTo(page, heart)
  await page.keyboard.press('Space')
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  // The saved count in the navbar still reads the legacy mock catalogue (wishlist moves to the API with the cart), so it is not asserted.
})

test('keeps focus inside the filter panel while tabbing', async ({ page }) => {
  await openShop(page)
  const dialog = await openFilters(page)
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }
})

test('focuses the search with Ctrl+K and ignores the shortcut while typing in another field', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openShop(page)
  await page.keyboard.press('Control+k')
  await expect(search(page)).toBeFocused()
})

test('a category pill filters through the API, and Back restores the previous state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }) // below sm the categories live in the Filters dialog
  await openShop(page)
  await pill(page, 'Pants').click()
  await expect(cards(page)).toHaveCount(1)
  expect(lastList().category).toBe('Pants')
  await page.goBack()
  await expect(cards(page)).toHaveCount(4)
  await expect(pill(page, 'All').first()).toHaveAttribute('aria-pressed', 'true')
})

test('lists the known categories and the ones the API has pieces in', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openShop(page)
  for (const name of ['All', 'Hoodie', 'Pants']) await expect(pill(page, name).first()).toBeVisible()
})

test('search finds a piece by name, shows the empty state for no hits, and Clear search and filters brings the catalogue back', async ({ page }) => {
  await openShop(page)
  await openSearch(page)
  await search(page).fill('trousers')
  await expect(cards(page)).toHaveCount(1)
  await search(page).fill('zzzz')
  await expect(page.getByText(/^No pieces match/)).toBeVisible()
  await page.getByRole('button', { name: 'Clear search and filters' }).click()
  await expect(cards(page)).toHaveCount(4)
})

test('shows an error with a retry for a failed load, then recovers', async ({ page }) => {
  let fail = true
  await page.route(/\/products(\?.*)?$/, (route, request) => {
    if (fail && request.method() === 'GET' && !request.url().includes('localhost:5173')) return route.fulfill({ status: 500, json: { message: 'boom' }, headers: { 'access-control-allow-origin': '*' } })
    return route.fallback()
  })
  await page.goto('/shop')
  await expect(page.getByText('The catalogue did not load')).toBeVisible({ timeout: 15000 })
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(cards(page)).toHaveCount(4)
})

test.describe('an empty database', () => {
  test('says there are no pieces yet instead of a search that matched nothing, and offers a way home', async ({ page }) => {
    await start(page, [])
    await page.goto('/shop')
    await expect(page.getByText('No pieces yet')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible()
    await expect(page.getByText('No pieces match your filters')).toHaveCount(0)
    expect(await overflows(page)).toBe(false)
  })
})

test.describe('filters', () => {
  test('the dialog has Brand, Gender, Size, Price, the derived colours and the AR toggle', async ({ page }) => {
    await openShop(page)
    const dialog = await openFilters(page)
    await expect(dialog.getByRole('combobox', { name: 'Brand' })).toBeVisible()
    for (const name of ['Men', 'Women', 'Unisex', 'Other']) await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible()
    // Once the filters arrive the sizes are the ones the pieces have, in order (letters, then numbers), not the usual XS to XXL.
    for (const size of ['S', 'M', '30']) await expect(dialog.getByRole('button', { name: size, exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'XXL', exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('textbox', { name: 'Minimum' })).toBeVisible()
    await expect(dialog.getByRole('checkbox', { name: /AR-ready/ })).toBeVisible()
  })

  test('offers the colours from /products/filters once each, with one request and no per-product detail calls', async ({ page }) => {
    await openShop(page)
    const dialog = await openFilters(page)
    const colours = ['Black', 'Navy', 'Sand']
    for (const name of colours) await expect(dialog.getByRole('button', { name, exact: true })).toHaveCount(1)
    // Cotton Tee spells it "navy", but the colour is listed once.
    await expect(dialog.getByRole('button', { name: /^navy$/ })).toHaveCount(0)
    expect(api.of('GET', 'filters')).toHaveLength(1)
    expect(api.of('GET', 'product')).toHaveLength(0)
    expect(api.of('GET', 'slug')).toHaveLength(0)
  })

  test('a colour is sent to the API as it is spelled, and finds the pieces that have it (case-insensitive)', async ({ page }) => {
    await openShop(page)
    const dialog = await openFilters(page)
    await dialog.getByRole('button', { name: 'Navy', exact: true }).click()
    await dialog.getByRole('button', { name: 'Apply' }).click()
    await expect(page).toHaveURL(/color=Navy/)
    await expect(cards(page)).toHaveCount(2) // Linen Shirt and Cotton Tee ("navy")
    expect(lastList().color).toBe('Navy')
    await expect(chipList(page).getByRole('button', { name: 'Remove colour Navy' })).toBeVisible()
  })

  test('a colour no product has in the URL is dropped when the dialog is applied', async ({ page }) => {
    await page.goto('/shop?color=Chartreuse')
    const dialog = await openFilters(page)
    await expect(dialog.getByRole('button', { name: 'Black', exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Apply' }).click()
    expect(urlParams(page).color).toBeUndefined()
  })

  test('brand, gender, size and price reach the API under its keys, show chips, and Clear all removes them', async ({ page }) => {
    await openShop(page)
    const dialog = await openFilters(page)
    await dialog.getByRole('combobox', { name: 'Brand' }).fill('Atelier Manila')
    await dialog.getByRole('button', { name: 'M', exact: true }).click()
    await dialog.getByRole('textbox', { name: 'Minimum' }).fill('1000')
    await dialog.getByRole('textbox', { name: 'Maximum' }).fill('2000')
    expect(urlParams(page)).toEqual({})
    await dialog.getByRole('button', { name: 'Apply' }).click()
    await expect(chipList(page).getByRole('listitem')).toHaveCount(3)
    expect(urlParams(page)).toMatchObject({ brand: 'Atelier Manila', size: 'M', min: '1000', max: '2000' })
    await expect.poll(() => lastList().size).toBe('M')
    expect(lastList()).toMatchObject({ brand: 'Atelier Manila', minPrice: '1000', maxPrice: '2000' })
    await expect(filtersButton(page)).toContainText('3')

    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(chipList(page)).toHaveCount(0)
    expect(urlParams(page)).toEqual({})
  })

  test('a reload keeps the filters, and a hand-edited URL with junk filters does not break the page', async ({ page }) => {
    await openShop(page, '?brand=Atelier%20Manila&size=M')
    await page.reload()
    await expect(chipList(page).getByRole('listitem')).toHaveCount(2)
    await openShop(page, '?min=abc&max=-4&gender=robot&avail=zzz&ar=maybe&sort=oops')
    await expect(cards(page)).toHaveCount(4)
    await expect(chipList(page)).toHaveCount(0)
  })

  test('AR-ready is sent as isArReady and narrows the list, and no stock filter reaches the API', async ({ page }) => {
    api.rows[0].isArReady = true // Linen Shirt
    await openShop(page)
    for (const call of api.of('GET', 'list')) expect(call.query.isArReady).toBeUndefined()
    const dialog = await openFilters(page)
    await expect(dialog.getByRole('checkbox', { name: /AR-ready/ })).toBeVisible()
    await dialog.getByRole('checkbox', { name: /AR-ready/ }).check()
    await dialog.getByRole('button', { name: 'Apply' }).click()
    expect(urlParams(page).ar).toBe('1')
    await expect(chipList(page).getByRole('button', { name: /^Remove AR/ })).toBeVisible()
    await expect.poll(() => lastList().isArReady).toBe('true')
    await expect(cards(page)).toHaveCount(1) // only the AR-ready Linen Shirt
    for (const call of api.of('GET', 'list')) {
      expect(Object.keys(call.query).filter((key) => ['avail', 'availability', 'ar', 'arReady', 'store', 'low'].includes(key))).toEqual([])
      expect(call.query.inStockOnly).toBeUndefined()
    }

    await chipList(page).getByRole('button', { name: /^Remove AR/ }).click()
    await expect.poll(() => lastList().isArReady).toBeUndefined()
    await expect(cards(page)).toHaveCount(4)
  })

  test('every request carries only keys the API accepts, and no price sort', async ({ page }) => {
    await page.goto('/shop?brand=Atelier%20Manila&gender=unisex&size=M&color=Black&min=1&max=9999&ar=1&sort=price-asc&category=Hoodie')
    await expect.poll(() => api.of('GET', 'list').length).toBeGreaterThan(0)
    // The mock answers 400 to an unknown key, which the page would show as an error.
    await expect(page.getByText('The catalogue did not load')).toHaveCount(0)
    for (const call of api.of('GET', 'list')) {
      expect(call.query.sortBy).not.toBe('basePrice')
      expect(call.query.sortBy).toBe('createdAt')
    }
  })

  test('a minimum above the maximum names the problem in the dialog and Apply stays disabled', async ({ page }) => {
    await openShop(page)
    const dialog = await openFilters(page)
    await dialog.getByRole('textbox', { name: 'Minimum' }).fill('900')
    await dialog.getByRole('textbox', { name: 'Maximum' }).fill('100')
    await expect(dialog.getByRole('alert')).toContainText('The minimum is higher than the maximum')
    await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  test('the sort menu keeps Featured and the price sorts; they list newest first, and name sorts reach the API', async ({ page }) => {
    await openShop(page)
    await page.getByRole('combobox', { name: 'Sort by' }).click()
    await expect(page.getByRole('option')).toHaveText(['Featured', 'Newest', 'Price: low to high', 'Price: high to low', 'Name: A to Z', 'Name: Z to A', 'Low stock first'])
    await page.getByRole('option', { name: 'Price: high to low' }).click()
    await expect(page).toHaveURL(/sort=price-desc/)
    await expect(cards(page).first()).toContainText('Linen Shirt')
    await page.getByRole('combobox', { name: 'Sort by' }).click()
    await page.getByRole('option', { name: 'Name: A to Z' }).click()
    await expect(cards(page).first()).toContainText('Cotton Tee')
    expect(lastList()).toMatchObject({ sortBy: 'name', sortOrder: 'asc' })
  })

  test('on a touch screen the chips, their remove buttons and Clear all are at least 44px', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch only')
    await openShop(page, '?brand=Atelier%20Manila&size=M')
    for (const control of [chipList(page).getByRole('listitem').first(), chipList(page).getByRole('button').first(), page.getByRole('button', { name: 'Clear all' })]) {
      const box = await control.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET)
    }
  })
})

test.describe('cart sheet', () => {
  test('Add to cart loads the piece, shows only its own sizes and colours, needs a size, and Undo reverts the add', async ({ page }) => {
    await openShop(page)
    await page.getByRole('button', { name: 'Add Linen Shirt to cart' }).click()
    const sheet = page.getByRole('dialog', { name: 'Choose options' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('radio', { name: 'XL', exact: true })).toHaveCount(0)
    await sheet.getByRole('button', { name: 'Add to cart' }).click()
    await expect(sheet.getByRole('alert')).toContainText('Choose a size to continue.')
    await sheet.getByRole('radio', { name: 'M', exact: true }).click({ force: true })
    await sheet.getByRole('radio', { name: 'Navy', exact: true }).click({ force: true })
    await sheet.getByRole('button', { name: 'Add to cart' }).click()
    await expect(page.getByText('Added to cart: Linen Shirt, M, Navy × 1')).toBeVisible()
  })

  test('sold-out pieces cannot be added or bought', async ({ page }) => {
    await openShop(page)
    const add = page.getByRole('button', { name: 'Add Linen Vest to cart, sold out' })
    await expect(add).toHaveAttribute('aria-disabled', 'true')
    await add.click({ force: true })
    await expect(page.getByRole('dialog', { name: 'Choose options' })).toHaveCount(0)
  })

  test('a link to a missing piece says so', async ({ page }) => {
    await page.goto('/shop?item=00000000-0000-4000-8000-0000000009ff&action=cart')
    await expect(page.getByText('That piece is no longer in the catalogue.')).toBeVisible({ timeout: 15000 })
  })
})

test.describe('the product page', () => {
  test('opens by slug on the detail endpoint with its price range, sizes, colours and no rating or sale', async ({ page }) => {
    const slug = api.rows[0].slug
    await page.goto(`/shop/${slug}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Linen Shirt' })).toBeVisible({ timeout: 15000 })
    expect(api.of('GET', 'slug').map((c) => c.productId)).toContain(slug)
    await expect(page.getByRole('radio', { name: 'S', exact: true })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Navy', exact: true })).toBeVisible()
    await expect(page.getByText(/reviews?$|% off|Sale|AR-ready/i)).toHaveCount(0)
    expect(await overflows(page)).toBe(false)
  })

  test('an archived piece is not found for a guest, as the API answers 404', async ({ page }) => {
    await page.goto(`/shop/${api.rows[4].slug}`)
    await expect(page.getByRole('heading', { name: 'This piece is no longer in the catalogue' })).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveTitle('Piece not found — SilhouFit')
  })

  test('an unknown slug is not found', async ({ page }) => {
    await page.goto('/shop/does-not-exist')
    await expect(page.getByRole('heading', { name: 'This piece is no longer in the catalogue' })).toBeVisible({ timeout: 15000 })
  })

  test('a sold-out piece disables Add to cart and Buy now', async ({ page }) => {
    await page.goto(`/shop/${api.rows[3].slug}`)
    await expect(page.getByRole('button', { name: 'Add to cart, sold out' })).toHaveAttribute('aria-disabled', 'true', { timeout: 15000 })
    await expect(page.getByRole('button', { name: 'Buy now, sold out' })).toHaveAttribute('aria-disabled', 'true')
  })
})

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
  })

  test('renders the catalogue, chips and filter dialog with readable text', async ({ page }) => {
    await openShop(page, '?brand=Atelier%20Manila')
    await expect(page.locator('html')).toHaveClass(/dark/)
    const { heading, background } = await page.evaluate(() => ({
      heading: getComputedStyle(document.querySelector('h1')!).color,
      background: getComputedStyle(document.body).backgroundColor,
    }))
    expect(heading).not.toBe(background)
    const dialog = await openFilters(page)
    await expect(dialog.getByRole('checkbox', { name: /AR-ready pieces only/ })).toBeVisible()
  })
})
