import { expect, test, type Locator, type Page } from '@playwright/test'
import { contrastRatio } from '../shared/contrast'
import { signedIn } from '../shared/session'
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

test('renders the catalogue with its own title, description, one h1 and a footer', async ({ page }) => {
  await openShop(page)
  await expect(page).toHaveTitle('Shop the catalogue — SilhouFit')
  await expect(page.getByRole('heading', { level: 1, name: 'All pieces' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(cards(page)).toHaveCount(12)
  await expect(page.getByText(/^24 pieces$/)).toBeVisible()
  await expect(page.getByText(/^Stock synced \d{1,2}:\d{2}\s?[AP]M$/)).toBeVisible()
  await expect(page.getByRole('contentinfo')).toHaveCount(1)

  const description = await page.locator('meta[name="description"]').getAttribute('content')
  expect(description?.length).toBeGreaterThanOrEqual(150)
  expect(description?.length).toBeLessThanOrEqual(160)
})

test('has no About Us or Shop links in the navbar, and keeps the logo and a breadcrumb home', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openShop(page)
  await expect(page.locator('header').first().getByRole('link', { name: /About Us|Shop/ })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
  await expect(page.getByRole('checkbox', { name: /Switch to (dark|light) mode/ })).toBeAttached()
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

    for (const name of [/^Add .* to cart$/, /^Buy /]) {
      const button = page.getByRole('button', { name }).first()
      await expectTarget(button, width, `${name} button`, true)
      const clipped = await button.evaluate((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)
      expect(clipped, `${name} button text is clipped at ${width}px`).toBe(false)
    }
    await expectTarget(page.getByRole('button', { name: /^Wishlist/ }), width, 'wishlist')
    await expectTarget(page.getByRole('button', { name: /^Cart/ }), width, 'cart')
    await expectTarget(page.getByRole('link', { name: 'Sign in' }), width, 'sign in')
    if (width >= 1024) await expectTarget(search(page), width, 'search')
    else {
      await expectTarget(page.getByRole('button', { name: 'Open search' }), width, 'search toggle')
    }
    await expectTarget(pill(page, 'All'), width, 'All pill', true)
    await expectTarget(filtersButton(page), width, 'Filters', true)
    await expectTarget(page.getByRole('button', { name: 'Grid view' }), width, 'Grid view', true)
    await expectTarget(page.getByRole('button', { name: 'List view' }), width, 'List view', true)
    await expectTarget(page.getByRole('combobox', { name: 'Sort by' }), width, 'Sort by', true)
    await expectTarget(page.getByRole('combobox', { name: 'Pieces per page' }), width, 'Pieces per page', true)
    await expect(page.getByRole('checkbox', { name: /Switch to (dark|light) mode/ })).toBeAttached()
    await expectTarget(page.getByRole('button', { name: /^Save .* to wishlist$/ }).first(), width, 'heart')
    await expectTarget(page.getByRole('button', { name: 'Next' }), width, 'Next', true)
    await expectTarget(page.getByRole('link', { name: 'See how AR fitting works' }), width, 'promo link')
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
  await openSearch(page)
  await search(page).focus()
  await tabTo(page, page.getByRole('button', { name: /^Wishlist/ }))
  await tabTo(page, pill(page, 'Tops'))
  await page.keyboard.press('Enter')
  await expect(pill(page, 'Tops')).toHaveAttribute('aria-pressed', 'true')

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
  await expect(page.getByRole('heading', { level: 1, name: 'All pieces' })).toBeFocused()

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

for (const width of [360, 1024, 1060, 1099, 1100, 1280]) {
  test(`keeps the navbar to one row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openShop(page)
    const height = await page.locator('header').first().evaluate((el) => el.getBoundingClientRect().height)
    expect(height, `navbar height at ${width}px`).toBeLessThanOrEqual(64)
  })
}

test('shows the toolbar and a first row of products above the fold on a laptop and a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await openShop(page)
  await expect(filtersButton(page)).toBeInViewport()
  const image = await cards(page).first().locator('img').boundingBox()
  expect(image!.y + image!.height, 'first product photo ends inside 720px').toBeLessThanOrEqual(720)

  await page.setViewportSize({ width: 375, height: 667 })
  await openShop(page)
  await expect(pill(page, 'All')).toBeInViewport()
  await expect(filtersButton(page)).toBeInViewport()
  const card = await cards(page).first().boundingBox()
  expect(card!.y, 'first card starts inside 667px').toBeLessThan(667 - 100)
})

test('focuses the search with Ctrl+K and ignores the shortcut while typing in another field', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await openShop(page)
  await page.keyboard.press('Control+k')
  await expect(search(page)).toBeFocused()

  await filtersButton(page).click()
  const dialog = page.getByRole('dialog', { name: 'Filters' })
  await dialog.getByLabel('Minimum').focus()
  await page.keyboard.press('Control+k')
  await expect(dialog.getByLabel('Minimum')).toBeFocused()
})

test('the wishlist icon filters to saved pieces and stays in step with the hearts', async ({ page }) => {
  await openShop(page)
  await page.getByRole('button', { name: 'Save Heritage Polo to wishlist' }).click()
  const wishlist = page.getByRole('button', { name: 'Wishlist, 1 saved' })
  await expect(wishlist).toBeVisible()
  await expect(page.getByText('Saved 1')).toBeVisible()

  await wishlist.click()
  await expect(page).toHaveURL(/saved=1/)
  await expect(cards(page)).toHaveCount(1)
  await expect(wishlist).toHaveAttribute('aria-pressed', 'true')
})

test('Add to cart opens the spec sheet, needs a size, raises the navbar badge and Undo reverts it', async ({ page }) => {
  await signedIn(page)
  await openShop(page)
  await expect(page.getByRole('button', { name: 'Cart, 0 items' })).toBeVisible()
  await page.getByRole('button', { name: 'Add Heritage Polo to cart' }).click()

  const sheet = page.getByRole('dialog', { name: 'Choose options' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Add to cart' }).click()
  await expect(sheet.getByRole('alert')).toHaveText('Choose a size to continue.')

  await sheet.getByRole('radio', { name: 'M', exact: true }).check({ force: true })
  await sheet.getByRole('radio', { name: 'Navy' }).check({ force: true })
  await sheet.getByRole('button', { name: 'Increase quantity' }).click()
  await sheet.getByRole('button', { name: 'Add to cart' }).click()
  await expect(page.getByText('Added to cart: Heritage Polo, M, Navy × 2')).toBeVisible()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('button', { name: 'Cart, 2 items' })).toBeVisible()

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('button', { name: 'Cart, 0 items' })).toBeVisible()
})

test('Buy opens the same sheet, with Buy now as its action', async ({ page }) => {
  await signedIn(page)
  await openShop(page)
  await page.getByRole('button', { name: 'Buy Heritage Polo' }).click()
  const sheet = page.getByRole('dialog', { name: 'Choose options' })
  await expect(sheet.getByRole('button', { name: 'Buy now' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('button', { name: /^Buy Heritage Polo/ })).toBeFocused()
})

test("a guest's Add to cart opens the sheet, adds, raises the badge, and the cart drawer lists it", async ({ page }) => {
  await openShop(page, '?category=Tops')
  await page.getByRole('button', { name: 'Add Rail Tank Set to cart' }).click()
  await expect(page).toHaveURL(/\/shop\?category=Tops$/) // no redirect for a guest
  const sheet = page.getByRole('dialog', { name: 'Choose options' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText("You'll sign in before you pay.")).toBeHidden() // only Buy now says it
  await expect(sheet.getByRole('button', { name: 'Add to cart' })).toBeInViewport({ ratio: 1 }) // fully slid in
  await sheet.getByRole('radio', { name: 'S', exact: true }).check({ force: true })
  await sheet.getByRole('radio', { name: 'White' }).check({ force: true })
  await sheet.getByRole('button', { name: 'Add to cart' }).click()
  await expect(page.getByText('Added to cart: Rail Tank Set, S, White × 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cart, 1 item' })).toBeVisible()

  await page.getByRole('button', { name: 'Cart, 1 item' }).click()
  const cart = page.getByRole('dialog', { name: 'Your cart' })
  await expect(cart.getByRole('heading', { name: 'Rail Tank Set' })).toBeVisible()
  await expect(cart.getByText("You'll sign in before you pay.")).toBeVisible()
  await expect(cart.getByText('Subtotal (1 item)')).toBeVisible()
})

test("a guest's Buy now says they will sign in before paying", async ({ page }) => {
  await openShop(page)
  await page.getByRole('button', { name: 'Buy Heritage Polo' }).click()
  const sheet = page.getByRole('dialog', { name: 'Choose options' })
  await expect(sheet.getByText("You'll sign in before you pay.")).toBeVisible()
})

test('the cart drawer changes quantities, removes with an in-drawer Undo, and is empty after clearing', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('silhoufit-cart', JSON.stringify([{ id: 'p01', size: 'M', color: 'Navy', qty: 2 }])),
  )
  await openShop(page)
  await page.getByRole('button', { name: 'Cart, 2 items' }).click()
  const cart = page.getByRole('dialog', { name: 'Your cart' })
  await expect(cart.getByText('₱3,780.00').first()).toBeVisible()
  await cart.getByRole('button', { name: 'Increase quantity of Heritage Polo' }).click()
  await expect(page.getByRole('button', { name: 'Cart, 3 items' })).toBeVisible()
  await cart.getByRole('button', { name: 'Remove Heritage Polo' }).click()
  await expect(cart.getByRole('status')).toContainText('Removed Heritage Polo.')
  await expect(cart.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible()
  await cart.getByRole('button', { name: /Undo/ }).click()
  await expect(cart.getByRole('heading', { name: 'Heritage Polo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cart, 3 items' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(cart).toBeHidden()
  await expect(page.getByRole('button', { name: 'Cart, 3 items' })).toBeFocused()
})

test('a click on the sheet backdrop returns focus to the button that opened it', async ({ page }) => {
  await openShop(page)
  const buy = page.getByRole('button', { name: 'Buy Heritage Polo' })
  await buy.click()
  const sheet = page.getByRole('dialog', { name: 'Choose options' })
  await expect(sheet.getByRole('button', { name: 'Buy now' })).toBeInViewport({ ratio: 1 })
  await page.mouse.click(4, 4) // the dimmed page behind the sheet
  await expect(sheet).toBeHidden()
  await expect(buy).toBeFocused()
})

test('a link to a sold-out or missing piece says so', async ({ page }) => {
  await page.goto('/shop?item=p24&action=cart')
  await expect(page.getByText('Field Denim Jacket is sold out.')).toBeVisible({ timeout: 15000 })
  await expect(page).toHaveURL(/\/shop$/)
  await page.goto('/shop?item=p999&action=buy')
  await expect(page.getByText('That piece is no longer in the catalogue.')).toBeVisible({ timeout: 15000 })
})

test('sold-out pieces cannot be added or bought', async ({ page }) => {
  await openShop(page, '?perPage=24')
  const add = page.getByRole('button', { name: 'Add Field Denim Jacket to cart, sold out' })
  await expect(add).toHaveAttribute('aria-disabled', 'true')
  await add.scrollIntoViewIfNeeded()
  await add.click({ force: true }) // aria-disabled is not a native disabled state, so force past the actionability wait
  await expect(page.getByRole('button', { name: 'Cart, 0 items' })).toBeVisible()
})

test('opens the Sort dropdown and drives it with the keyboard', async ({ page }) => {
  await openShop(page)
  const sort = page.getByRole('combobox', { name: 'Sort by' })
  await sort.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('listbox', { name: 'Sort by' })).toBeVisible()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/sort=price-desc/)
  await expect(sort).toContainText('Price: high to low')
  await expect(sort).toBeFocused()
  await expect(page.getByRole('listbox')).toHaveCount(0)
})

for (const width of [320, 1280]) {
  test(`an open dropdown fits ${width}px with no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openShop(page)
    await page.getByRole('combobox', { name: 'Pieces per page' }).click()
    const listbox = page.getByRole('listbox', { name: 'Pieces per page' })
    await expect(listbox).toBeVisible()
    const box = (await listbox.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(await overflows(page)).toBe(false)
  })
}

for (const width of [320, 375, 1280]) {
  test(`shows the longest sort label and every option in full at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openShop(page, '?sort=price-desc')
    const sort = page.getByRole('combobox', { name: 'Sort by' })
    await expect(sort).toContainText('Sort: Price: high to low')
    expect(await sort.locator('span').first().evaluate((el) => el.scrollWidth <= el.clientWidth), 'trigger text is cut off').toBe(true)

    await sort.click()
    const options = page.getByRole('listbox', { name: 'Sort by' }).getByRole('option')
    await expect(options).toHaveCount(4)
    for (const option of await options.all()) {
      const clipped = await option.locator('span').first().evaluate((el) => el.scrollWidth > el.clientWidth)
      expect(clipped, `option ${await option.textContent()} is cut off`).toBe(false)
    }
    const box = (await page.getByRole('listbox', { name: 'Sort by' }).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
  })
}

test('keeps card titles in line: one-line category text and single-line badges', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await openShop(page)
  const tops = await page.locator('article h3').evaluateAll((els) => els.slice(0, 4).map((el) => Math.round(el.getBoundingClientRect().top)))
  expect(tops[0], 'titles in a row start together').toBe(tops[1])
  await page.setViewportSize({ width: 320, height: 800 })
  await openShop(page, '?view=list')
  const wrapped = await page.locator('article ul li').evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().height > 22).length)
  expect(wrapped, 'badges wrapping onto two lines').toBe(0)
})

test('shows the Cart tooltip on keyboard focus, inside a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await openShop(page)
  await tabTo(page, page.getByRole('button', { name: /^Cart/ }))
  // Earlier tooltips may still be fading out, so pick this one by its text.
  const tooltip = page.getByRole('tooltip').filter({ hasText: 'Cart (0 items)' })
  await expect(tooltip).toBeVisible()
  const box = (await tooltip.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(320)
  await page.keyboard.press('Escape')
  await expect(tooltip).toHaveCount(0)
})

test('shows the view tooltip on mouse hover after a short delay', async ({ page, isMobile }) => {
  test.skip(isMobile, 'touch screens never show tooltips')
  await openShop(page)
  await page.getByRole('button', { name: 'List view' }).hover()
  await expect(page.getByRole('tooltip').filter({ hasText: 'List view' })).toBeVisible()
})

test('switches view with reduced motion and the list is fully opaque at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openShop(page)
  await page.getByRole('button', { name: 'List view' }).click()
  await expect(page).toHaveURL(/view=list/)
  await expect(page.locator('main ul').first()).toHaveCSS('opacity', '1')
})

test('fades the results in after a change, ending fully opaque', async ({ page }) => {
  await openShop(page)
  await pill(page, 'Tops').click()
  await expect(page.locator('main ul').first()).toHaveCSS('opacity', '1')
  await expect(cards(page).first()).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  test(`skeuomorphic controls have depth and readable faces in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('silhoufit-theme', t), theme)
    await openShop(page)
    const add = page.getByRole('button', { name: 'Add Heritage Polo to cart' })
    const idle = await add.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(idle).not.toBe('none')
    // Hover must read differently from idle (a brighter face and rim, or a bigger lift), and pressed differently again.
    await add.scrollIntoViewIfNeeded()
    await add.hover()
    await page.waitForTimeout(300) // let the 140ms transition finish
    const hovered = await add.evaluate((el) => {
      const css = getComputedStyle(el)
      return `${css.boxShadow}|${css.backgroundImage}|${css.filter}`
    })
    const idleLook = await page.getByRole('button', { name: 'Add Fence-Line Blazer to cart' }).evaluate((el) => {
      const css = getComputedStyle(el)
      return `${css.boxShadow}|${css.backgroundImage}|${css.filter}`
    })
    expect(hovered).not.toBe(idleLook)
    const pressed = page.getByRole('button', { name: /^All/ })
    await expect(pressed).toHaveAttribute('aria-pressed', 'true')
    // The selected pill's face is a sliding indicator that is sunk in (inset shadow).
    expect(await pressed.locator('.skeuo-ink-face').evaluate((el) => getComputedStyle(el).boxShadow)).toContain('inset')

    const tokens = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement)
      const get = (n: string) => css.getPropertyValue(n).trim()
      return {
        fg: get('--fg'), canvas: get('--canvas'),
        faceHi: get('--skeuo-face-hi'), faceLo: get('--skeuo-face-lo'),
        inkHi: get('--skeuo-ink-hi'), inkLo: get('--skeuo-ink-lo'),
        hoverHi: get('--skeuo-face-hi-hover'), hoverLo: get('--skeuo-face-lo-hover'),
      }
    })
    for (const stop of [tokens.faceHi, tokens.faceLo]) expect(contrastRatio(tokens.fg, stop)).toBeGreaterThanOrEqual(4.5)
    for (const stop of [tokens.hoverHi, tokens.hoverLo]) expect(contrastRatio(tokens.fg, stop)).toBeGreaterThanOrEqual(4.5)
    for (const stop of [tokens.inkHi, tokens.inkLo]) expect(contrastRatio(tokens.canvas, stop)).toBeGreaterThanOrEqual(4.5)
  })
}

for (const width of [320, 768, 1280]) {
  test(`the loading skeleton matches the loaded page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/shop', { waitUntil: 'commit' })
    const status = page.getByRole('status', { name: 'Loading the catalogue' })
    await expect(status).toBeVisible({ timeout: 15000 })
    await page.evaluate(() => document.fonts.ready) // a late font swap would move the header
    const grab = (card: string, pager: string) =>
      page.evaluate(([c, g]) => {
        const rect = (el: Element | null) => { const r = el!.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height, right: r.right } }
        return { card: rect(document.querySelector(c)), pager: rect(document.querySelector(g)) }
      }, [card, pager])
    const skeleton = await grab('[role=status] .grid > div', '[role=status] > div:nth-last-child(2)')
    await expect(cards(page).first()).toBeVisible({ timeout: 15000 })
    const loaded = await grab('article', 'nav[aria-label=Pagination]')
    const nav = (await page.locator('nav[aria-label=Pagination]').evaluate((el) => (el.parentElement as HTMLElement).getBoundingClientRect().top + scrollY))

    expect(Math.abs(skeleton.card.x - loaded.card.x), 'first card x').toBeLessThanOrEqual(1)
    expect(Math.abs(skeleton.card.y - loaded.card.y), 'first card y').toBeLessThanOrEqual(1)
    expect(Math.abs(skeleton.card.w - loaded.card.w), 'first card width').toBeLessThanOrEqual(1)
    // Text wraps differently from card to card, so heights match to within a few lines, not to the pixel.
    expect(Math.abs(skeleton.card.h - loaded.card.h), 'first card height').toBeLessThanOrEqual(40)
    expect(Math.abs(skeleton.pager.y - nav), 'pagination row y').toBeLessThanOrEqual(60)
    expect(Math.abs(skeleton.pager.right - loaded.pager.right), 'pagination right edge').toBeLessThanOrEqual(1)
  })
}

test('right-aligns the pagination with the grid edge', async ({ page }) => {
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await openShop(page)
    const edges = await page.evaluate(() => ({
      grid: document.querySelector('main ul')!.getBoundingClientRect().right,
      nav: document.querySelector('nav[aria-label=Pagination]')!.getBoundingClientRect().right,
    }))
    expect(Math.abs(edges.grid - edges.nav), `pagination right edge at ${width}px`).toBeLessThanOrEqual(1)
  }
})

test('links the signed-out user icon to /login and back to the same filtered page', async ({ page }) => {
  await openShop(page, '?category=Tops')
  await page.getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/login\?next=%2Fshop%3Fcategory%3DTops$/)
})

test('the signed-in avatar opens an account panel and Sign out ends the session', async ({ page }) => {
  await signedIn(page)
  await openShop(page)
  const avatar = page.getByRole('button', { name: 'Account, Demo Shopper' })
  await avatar.click()
  const panel = page.getByRole('group', { name: 'Account' })
  await expect(panel).toContainText('demo@silhoufit.com')
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(avatar).toBeFocused()

  await avatar.click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByText('Signed out')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
})

test('search shows the empty state and "Clear search and filters" brings the catalogue back', async ({ page }) => {
  await openShop(page)
  await openSearch(page)
  await search(page).fill('zzzz')
  await expect(page.getByText('No pieces match "zzzz"')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search and filters' }).click()
  await expect(cards(page)).toHaveCount(12)
  await expect(search(page)).toHaveValue('')
})

test('Back after "Clear search and filters" brings the old search text back', async ({ page }) => {
  await openShop(page)
  await openSearch(page)
  await search(page).fill('zzzz')
  await expect(page).toHaveURL(/q=zzzz/)
  await page.getByRole('button', { name: 'Clear search and filters' }).click()
  await expect(search(page)).toHaveValue('')
  await expect(page.getByRole('heading', { level: 1, name: 'All pieces' })).toBeFocused()

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
  await expect(cards(page).first()).toBeVisible({ timeout: 15000 }) // a cold dev server compiles the page on first hit
  await expect(alert).toHaveCount(0)
})

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
  })

  test('renders the catalogue and filter panel with readable text', async ({ page }) => {
    await openShop(page)
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('heading', { level: 1, name: 'All pieces' })).toBeVisible()
    await expect(cards(page).first()).toBeVisible({ timeout: 15000 }) // a cold dev server compiles the page on first hit

    const { heading, background } = await page.evaluate(() => ({
      heading: getComputedStyle(document.querySelector('h1')!).color,
      background: getComputedStyle(document.body).backgroundColor,
    }))
    expect(heading).not.toBe(background)

    await filtersButton(page).click()
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible()
  })
})
