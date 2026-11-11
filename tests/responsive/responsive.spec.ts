import { expect, test, type Locator, type Page } from '@playwright/test'
import { mockChat, OLD, SAM, msg, openMessages } from '../chat/chatMock'
import { setupOrderShop, signInViaForm, type OrderShop } from '../shared/checkoutOrders'
import { NAVY_M, buyNow, POLO } from '../shared/checkoutShop'
import { apiShipment, mockOrders, order, orderId, type ApiOrder } from '../shared/ordersApi'
import { mockPsgc } from '../shared/psgc'
import { RESPONSIVE_MATRIX } from '../shared/viewports'

// Every customer-facing screen, loaded once and then resized through RESPONSIVE_MATRIX. Per size: no sideways scroll, the
// route's key controls visible and inside the viewport width, and its primary action not covered by something fixed (chat
// button, bottom bar, cookie banner). A second block, with a touch device, checks the key controls are 44px targets up to 1024.
// Failures are soft, so one run lists every route and size that breaks. Desktop project only: the matrix sets the sizes itself.

const TOUCH_MIN = 44
const TOUCH_MAX_WIDTH = 1024
const SLUG = 'heritage-polo'

interface Screen {
  name: string
  /** Mocks everything the screen needs, opens it and waits until it is ready. */
  open: (page: Page) => Promise<void>
  /** The one to three controls a visitor needs here. */
  keys: (page: Page) => Locator[]
  /** The action the screen is for; must not sit under anything. */
  primary?: (page: Page) => Locator
  /** Open the chat dock and minimise it to its head before the sweep, as a customer who started a chat would have it. */
  chatHead?: boolean
}

const SHIPPED: ApiOrder = order(1, {
  status: 'OUT_FOR_DELIVERY',
  paymentStatus: 'PAID',
  paidAt: '2026-10-02T03:00:00.000Z',
  shipment: apiShipment(),
  items: [
    {
      id: '00000000-0000-4000-8000-000000500001',
      orderId: orderId(1),
      variantId: NAVY_M.id,
      productName: 'Heritage Polo',
      variantSku: 'SKU-1',
      variantSize: 'M',
      variantColor: 'Navy',
      unitPrice: 1890,
      quantity: 1,
      totalPrice: 1890,
      imageUrl: null,
      createdAt: '2026-10-26T02:30:00.000Z',
      updatedAt: '2026-10-26T02:30:00.000Z',
    },
  ],
})
const PENDING: ApiOrder = order(2)

/** The shop, addresses, chat and orders mocked; signed in through the form unless `guest`. */
async function start(page: Page, { guest = false, orders }: { guest?: boolean; orders?: ApiOrder[] } = {}): Promise<OrderShop> {
  const shop = await setupOrderShop(page)
  await mockPsgc(page)
  await mockChat(page, 'customer', { messages: [msg('Hi, how can we help?', SAM, OLD(1))] })
  if (orders) await mockOrders(page, orders, { cart: shop.cart, products: shop.api })
  // The courier's tracking page sits in an iframe on a shipped order.
  await page.route('https://track.example.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>Tracking</p>' }))
  await page.route('**/users/me/body-profile', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
      : route.fulfill({ status: 404, json: {}, headers: { 'access-control-allow-origin': '*' } }),
  )
  if (!guest) await signInViaForm(page)
  return shop
}

const wishlist = async (page: Page, ids: string[]) =>
  page.route((url) => url.origin !== 'http://localhost:5173' && /^\/wishlist(\/|$)/.test(url.pathname), (route) => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const ids$ = new URL(route.request().url()).pathname.endsWith('/ids')
    return route.fulfill({
      json: ids$ ? { productIds: ids } : { items: ids.map((productId) => ({ productId, createdAt: '2026-11-01T12:00:00.000Z' })) },
      headers,
    })
  })

const go = async (page: Page, path: string, ready: Locator) => {
  await page.goto(path)
  await expect(ready.first()).toBeVisible({ timeout: 20000 })
}
const heading = (page: Page, name: string | RegExp, level?: number) => page.getByRole('heading', { level, name })
const guestScreen = (name: string, path: string, h: string | RegExp, keys: Screen['keys'], primary?: Screen['primary']): Screen => ({
  name,
  open: async (page) => {
    await start(page, { guest: true })
    await go(page, path, heading(page, h))
  },
  keys,
  primary,
})
const legal = (name: string, path: string, h: RegExp) =>
  guestScreen(name, path, h, (page) => [page.getByRole('link', { name: 'KRAL home' }).first()])
const emailPassword = (page: Page) => page.getByLabel('Email', { exact: true })
const submit = (page: Page) => page.locator('main form button[type="submit"]').first()

const cart: Screen = {
  name: 'cart',
  open: async (page) => {
    const shop = await start(page)
    shop.cart.seed(NAVY_M.id, 1)
    await go(page, '/cart', heading(page, 'Heritage Polo', 2))
    await page.locator('label', { has: page.getByRole('checkbox', { name: 'Select all items' }) }).click()
  },
  keys: (page) => [page.getByRole('button', { name: 'Checkout' })],
  primary: (page) => page.getByRole('button', { name: 'Checkout' }),
}
// Phones switch to Edit; wider screens keep the toolbar, which has the same two actions.
const cartEdit: Screen = {
  name: 'cart in edit mode',
  open: async (page) => {
    await cart.open(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Edit cart' }).click()
  },
  keys: (page) => [page.getByRole('button', { name: 'Remove selected' }), page.getByRole('button', { name: 'Clear cart' })],
  primary: (page) => page.getByRole('button', { name: 'Clear cart' }),
}
const checkout: Screen = {
  name: 'checkout',
  open: async (page) => {
    await start(page)
    await go(page, buyNow(POLO, NAVY_M.id), heading(page, 'Heritage Polo'))
    await expect(page.getByRole('heading', { name: 'Delivery address' }).locator('xpath=ancestor::section')).toContainText('12 Rizal Avenue', { timeout: 15000 })
  },
  keys: (page) => [page.getByRole('button', { name: /Place order|Placing order/ })],
  primary: (page) => page.getByRole('button', { name: /Place order|Placing order/ }),
}
const product: Screen = {
  name: 'product',
  open: async (page) => {
    await start(page)
    await go(page, `/shop/${SLUG}`, heading(page, 'Heritage Polo', 1))
  },
  keys: (page) => [page.getByRole('button', { name: 'Add to cart' }), page.getByRole('button', { name: 'Buy now' })],
  primary: (page) => page.getByRole('button', { name: 'Buy now' }),
}

const SCREENS: Screen[] = [
  guestScreen('landing', '/', /.*/, (page) => [page.getByRole('link', { name: 'KRAL home' }).first()]),
  {
    name: 'shop',
    open: async (page) => {
      await start(page, { guest: true })
      await go(page, '/shop', page.getByRole('article'))
    },
    keys: (page) => {
      const card = page.getByRole('article').first()
      return [card.getByRole('heading').getByRole('link'), card.getByRole('button', { name: /^Save .* to wishlist$/ }), card.getByRole('button', { name: /^Add .* to cart$/ }), card.getByRole('button', { name: /^Buy / })]
    },
  },
  product,
  {
    name: 'wishlist',
    open: async (page) => {
      const shop = await start(page)
      await wishlist(page, [shop.api.rows[0].id])
      await go(page, '/wishlist', page.getByText('1 piece saved'))
    },
    keys: (page) => [page.getByRole('button', { name: 'Add to cart' }).first()],
  },
  cart,
  cartEdit,
  checkout,
  {
    name: 'checkout success',
    open: async (page) => {
      await start(page)
      await go(page, buyNow(POLO, NAVY_M.id), heading(page, 'Heritage Polo'))
      await expect(page.getByRole('heading', { name: 'Delivery address' }).locator('xpath=ancestor::section')).toContainText('12 Rizal Avenue', { timeout: 15000 })
      await page.getByRole('button', { name: /Place order/ }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeVisible({ timeout: 15000 })
    },
    keys: (page) => [page.getByRole('link', { name: /View order|My orders|Back to shop|Continue shopping/ }).first()],
  },
  {
    name: 'orders',
    open: async (page) => {
      await start(page, { orders: [SHIPPED, PENDING] })
      await go(page, '/orders', heading(page, 'My orders'))
      await expect(page.getByRole('link', { name: /^View order/ }).first()).toBeVisible()
    },
    keys: (page) => [page.getByRole('group', { name: 'Order status' }).getByRole('button').first(), page.getByRole('link', { name: /^View order/ }).first()],
    primary: (page) => page.getByRole('link', { name: /^View order/ }).first(),
  },
  {
    name: 'order with shipment',
    open: async (page) => {
      await start(page, { orders: [SHIPPED] })
      await go(page, `/orders/${orderId(1)}`, heading(page, order(1).orderNumber))
    },
    keys: (page) => [page.getByRole('link', { name: /Map not showing/ })],
    primary: (page) => page.getByRole('link', { name: /Map not showing/ }),
  },
  {
    name: 'profile',
    open: async (page) => {
      await start(page)
      await go(page, '/profile', heading(page, 'Demo Shopper'))
    },
    keys: (page) => [page.getByRole('link', { name: /orders/i }).last()],
  },
  {
    name: 'messages',
    open: async (page) => {
      await start(page)
      await go(page, '/messages', page.getByRole('textbox', { name: 'Message', exact: true }))
    },
    keys: (page) => [page.getByRole('textbox', { name: 'Message', exact: true }), page.getByRole('button', { name: /^Send/ })],
    primary: (page) => page.getByRole('button', { name: /^Send/ }),
  },
  {
    name: 'body measurements',
    open: async (page) => {
      await start(page)
      await go(page, '/profile/measurements', page.getByRole('region', { name: 'Choose a body model' }))
    },
    keys: (page) => [page.getByRole('button', { name: /Close avatar setup/ })],
  },
  guestScreen('about', '/about', /.*/, (page) => [page.getByRole('navigation', { name: 'On this page' }).getByRole('link').first()]),
  {
    name: 'contact',
    open: async (page) => {
      await start(page, { guest: true })
      await go(page, '/contact', page.getByRole('form', { name: 'Contact the team' }))
    },
    keys: (page) => [page.getByRole('form', { name: 'Contact the team' }).locator('button[type="submit"]')],
    primary: (page) => page.getByRole('form', { name: 'Contact the team' }).locator('button[type="submit"]'),
  },
  legal('privacy policy', '/privacy-policy', /privacy/i),
  legal('terms of service', '/terms-of-service', /terms/i),
  legal('refund policy', '/refund-policy', /refund/i),
  legal('cookie policy', '/cookie-policy', /cookie/i),
  {
    name: 'login',
    open: async (page) => {
      await start(page, { guest: true })
      await go(page, '/login', emailPassword(page))
    },
    keys: (page) => [emailPassword(page), page.getByRole('button', { name: 'Sign in', exact: true }), page.getByRole('link', { name: 'Forgot password?' })],
    primary: (page) => page.getByRole('button', { name: 'Sign in', exact: true }),
  },
  {
    name: 'signup',
    open: async (page) => {
      await start(page, { guest: true })
      await go(page, '/signup', emailPassword(page))
    },
    keys: (page) => [emailPassword(page), submit(page)],
    primary: submit,
  },
  {
    name: 'forgot password',
    open: async (page) => {
      await start(page, { guest: true })
      await go(page, '/forgot-password', emailPassword(page))
    },
    keys: (page) => [emailPassword(page), submit(page)],
    primary: submit,
  },
  {
    name: '500',
    open: async (page) => {
      await start(page, { guest: true })
      await go(page, '/500', heading(page, /our side\. not yours/i))
    },
    keys: (page) => [page.getByRole('button', { name: 'Try again' }), page.getByRole('link', { name: 'Go home' })],
    primary: (page) => page.getByRole('link', { name: 'Go home' }),
  },
  {
    name: '404',
    open: async (page) => {
      await start(page, { guest: true })
      await go(page, '/no-such-page', page.getByRole('link', { name: 'KRAL home' }))
    },
    keys: (page) => [page.getByRole('link', { name: /shop/i }).last(), page.getByRole('link', { name: /contact/i }).last()],
    primary: (page) => page.getByRole('link', { name: /shop/i }).last(),
  },
  // The minimised chat button floats bottom-right; it must not cover a bottom bar's action.
  { ...cart, name: 'cart with chat head', chatHead: true },
  { ...cartEdit, name: 'cart in edit mode with chat head', chatHead: true },
  { ...checkout, name: 'checkout with chat head', chatHead: true },
  { ...product, name: 'product with chat head', chatHead: true },
]

test.beforeEach(({ browserName: _browser }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the matrix sets its own sizes')
})

async function minimiseChat(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openMessages(page)
  await expect(page.getByRole('region', { name: 'Chat with KRAL' })).toBeVisible()
  await page.getByRole('button', { name: 'Minimize chat with KRAL' }).click()
  await expect(page.getByRole('region', { name: 'Chat with KRAL' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Open chat with KRAL/ })).toBeVisible()
}

const settle = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 150)))))

async function insideWidth(loc: Locator, width: number) {
  const box = await loc.boundingBox()
  return !!box && box.x >= -0.5 && box.x + box.width <= width + 0.5
}

/** What sits over the control's centre once it is scrolled into the middle, or null when nothing does. */
const coveredBy = (loc: Locator) =>
  loc.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }) // the page smooth-scrolls by default
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    if (!hit || el === hit || el.contains(hit)) return null
    return `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 60)} ${hit.getAttribute('aria-label') ?? hit.textContent?.slice(0, 30) ?? ''}`
  })

for (const screen of SCREENS) {
  test(`${screen.name} holds at every size`, async ({ page }) => {
    test.setTimeout(180_000)
    await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
    await page.setViewportSize({ width: 1366, height: 768 })
    await screen.open(page)
    if (screen.chatHead) await minimiseChat(page)
    for (const { width, height } of RESPONSIVE_MATRIX) {
      const at = `${screen.name} at ${width}x${height}`
      await page.setViewportSize({ width, height })
      await settle(page)
      const spill = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect.soft(spill, `${at}: scrolls sideways by ${spill}px`).toBeLessThanOrEqual(0)
      for (const [i, key] of screen.keys(page).entries()) {
        const target = key.first()
        const shown = await target.isVisible()
        expect.soft(shown, `${at}: key control ${i + 1} is not visible`).toBe(true)
        if (shown) expect.soft(await insideWidth(target, width), `${at}: key control ${i + 1} leaves the viewport width`).toBe(true)
      }
      if (screen.primary) {
        const target = screen.primary(page).first()
        if (await target.isVisible()) expect.soft(await coveredBy(target), `${at}: primary action is covered`).toBeNull()
      }
      if (screen.chatHead) {
        const head = page.getByRole('button', { name: /^Open chat with KRAL/ })
        if (await head.isVisible()) {
          expect.soft(await insideWidth(head, width), `${at}: chat button leaves the viewport width`).toBe(true)
          // The chat button sits bottom right; a bottom bar's action must not run under it.
          const [h, p] = [await head.boundingBox(), screen.primary ? await screen.primary(page).first().boundingBox() : null]
          const overlaps = !!h && !!p && h.x < p.x + p.width && p.x < h.x + h.width && h.y < p.y + p.height && p.y < h.y + h.height
          expect.soft(overlaps, `${at}: chat button overlaps the primary action`).toBe(false)
        }
      }
    }
  })
}

test.describe('touch targets', () => {
  test.use({ hasTouch: true, isMobile: true })

  for (const screen of SCREENS.filter((s) => !s.chatHead)) {
    test(`${screen.name} key controls are at least ${TOUCH_MIN}px`, async ({ page }) => {
      test.setTimeout(180_000)
      await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
      await screen.open(page)
      for (const { width, height } of RESPONSIVE_MATRIX.filter((s) => s.width <= TOUCH_MAX_WIDTH)) {
        await page.setViewportSize({ width, height })
        await settle(page)
        for (const [i, key] of screen.keys(page).entries()) {
          const box = await key.first().boundingBox()
          expect.soft(box && Math.min(box.width, box.height), `${screen.name} at ${width}x${height}: key control ${i + 1} is under ${TOUCH_MIN}px`).toBeGreaterThanOrEqual(TOUCH_MIN - 0.5)
        }
      }
    })
  }
})

test('a shipped order keeps its live map short in landscape (844x390)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await page.setViewportSize({ width: 844, height: 390 })
  await start(page, { orders: [SHIPPED] })
  await go(page, `/orders/${orderId(1)}`, heading(page, order(1).orderNumber))
  const map = page.getByTitle('Live delivery map').locator('xpath=..')
  await map.scrollIntoViewIfNeeded()
  const box = (await map.boundingBox())!
  expect(box.height, 'the map should leave room for the page around it').toBeLessThanOrEqual(390 * 0.6)
})

test('the checkout terms line clears the pinned Place order bar at the end of the page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await checkout.open(page)
  for (const { width, height } of RESPONSIVE_MATRIX.filter((s) => s.width < 1024)) {
    await page.setViewportSize({ width, height })
    await settle(page)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await settle(page)
    const terms = (await page.getByRole('link', { name: 'Privacy Policy' }).boundingBox())!
    const place = (await page.getByRole('button', { name: /Place order|Placing order/ }).boundingBox())!
    expect.soft(terms.y + terms.height, `${width}x${height}: the terms line runs under the bar`).toBeLessThanOrEqual(place.y)
  }
})

// F9: the 404 and 500 screens fill the screen and may scroll only when their content does not fit. After scrolling to the end of the
// page, both actions must be fully on screen (and the heading on screen at the top), on short landscape phones and with the text doubled.
for (const screen of SCREENS.filter((s) => s.name === '404' || s.name === '500')) {
  for (const [label, width, height, zoom] of [
    ['568x320', 568, 320, false],
    ['667x375', 667, 375, false],
    ['320x568 with text at 200%', 320, 568, true],
    ['1366x768 with text at 200%', 1366, 768, true],
  ] as const) {
    test(`${screen.name} screen keeps its heading and actions reachable at ${label}`, async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
      await screen.open(page)
      await page.setViewportSize({ width, height })
      if (zoom) await page.addStyleTag({ content: 'html { font-size: 200% }' })
      await settle(page)
      await expect.soft(page.getByRole('heading', { level: 1 })).toBeInViewport()
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await settle(page)
      for (const [i, key] of screen.keys(page).entries()) await expect.soft(key.first(), `action ${i + 1}`).toBeInViewport({ ratio: 1 })
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    })
  }
}

test('the legal pages hide Back to top once the footer is on screen, so it never covers the credits', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await start(page, { guest: true })
  await go(page, '/privacy-policy', heading(page, /privacy/i))
  for (const { width, height } of RESPONSIVE_MATRIX) {
    await page.setViewportSize({ width, height })
    await settle(page)
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
    await settle(page)
    const covered = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Back to top'))
      const footer = document.querySelector('footer')
      if (!button || !footer) return false
      const [b, f] = [button.getBoundingClientRect(), footer.getBoundingClientRect()]
      return b.left < f.right && f.left < b.right && b.top < f.bottom && f.top < b.bottom
    })
    expect.soft(covered, `${width}x${height}: Back to top covers the footer`).toBe(false)
  }
})
