import { expect, test, type Page } from '@playwright/test'
import { apiShipment, mockOrders, order, orderId, type ApiOrder, type OrdersMock } from '../shared/ordersApi'
import { mockAuth, signedIn } from '../shared/session'

// My orders (/orders) and one order (/orders/:id), against a mocked orders API. Only the statuses the backend can reach today are
// PENDING_PAYMENT and CANCELLED; the others are exercised from fixtures here.

const item = (name: string, over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-${String(500000 + name.length * 7 + name.charCodeAt(0)).padStart(12, '0')}`,
  orderId: 'x',
  variantId: '00000000-0000-4000-8000-000000000201',
  productName: name,
  variantSku: `SKU-${name.length}`,
  variantSize: 'M',
  variantColor: 'Navy',
  unitPrice: 1890,
  quantity: 1,
  totalPrice: 1890,
  imageUrl: null,
  createdAt: '2026-10-26T02:30:00.000Z',
  updatedAt: '2026-10-26T02:30:00.000Z',
  ...over,
})

const named = (n: number, name: string, over: Record<string, unknown> = {}) => order(n, { items: [item(name)], ...over })

const PAID_AT = '2026-10-02T03:00:00.000Z'

/** One order per status, numbered 1-9 (9 = newest): the list answers 9 first. */
const everyStatus = (): ApiOrder[] => [
  named(1, 'Pending Polo'),
  named(2, 'Failed Frock', { status: 'PAYMENT_FAILED', paymentStatus: 'FAILED' }),
  named(3, 'Paid Parka', { status: 'PAID', paymentStatus: 'PAID', paidAt: PAID_AT }),
  named(4, 'Prepared Pants', { status: 'PROCESSING', paymentStatus: 'PAID', paidAt: PAID_AT }),
  named(5, 'Shipped Shirt', { status: 'DISPATCHED', paymentStatus: 'PAID', paidAt: PAID_AT, shipment: apiShipment({ status: 'PICKED_UP' }) }),
  named(6, 'Rolling Romper', { status: 'OUT_FOR_DELIVERY', paymentStatus: 'PAID', paidAt: PAID_AT, shipment: apiShipment() }),
  named(7, 'Delivered Dress', { status: 'DELIVERED', paymentStatus: 'PAID', paidAt: PAID_AT, shipment: apiShipment({ status: 'COMPLETED', deliveredAt: '2026-10-08T05:00:00.000Z' }) }),
  named(8, 'Cancelled Cardigan', { status: 'CANCELLED', cancelledAt: '2026-10-08T05:00:00.000Z', cancellationReason: 'Wrong size' }),
  named(9, 'Refunded Robe', { status: 'REFUNDED', paymentStatus: 'REFUNDED', paidAt: PAID_AT }),
]

const num = (n: number) => `SHF-20261001-${String(n).padStart(6, '0')}`
const card = (page: Page, n: number) => page.getByRole('article', { name: num(n) })
const cards = (page: Page) => page.getByRole('article')
const tab = (page: Page, name: string) => page.getByRole('group', { name: 'Order status' }).getByRole('button', { name })
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
// The chip is a plain span: it carries data-status because no role or label exists for it (the words repeat in the timeline and banner).
const chip = (page: Page, status: string) => page.locator(`[data-status="${status}"]`)

async function openList(page: Page, orders: ApiOrder[], path = '/orders'): Promise<OrdersMock> {
  const mock = await mockOrders(page, orders)
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: 'My orders' })).toBeVisible({ timeout: 15000 })
  return mock
}

async function openOrder(page: Page, orders: ApiOrder[], n: number): Promise<OrdersMock> {
  const mock = await mockOrders(page, orders)
  await page.goto(`/orders/${orderId(n)}`)
  await expect(page.getByRole('heading', { level: 1, name: num(n) })).toBeVisible({ timeout: 15000 })
  return mock
}

// Keyboard-only: press Tab from wherever focus is until the target holds it.
async function tabTo(page: Page, target: ReturnType<Page['locator']>) {
  for (let i = 0; i < 120; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Never reached the target by pressing Tab')
}

test.beforeEach(async ({ page }) => {
  await mockAuth(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

test.describe('signed out', () => {
  test('a signed-out visit to /orders goes to login and remembers where to come back', async ({ page }) => {
    await mockOrders(page, [])
    await page.goto('/orders')
    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.search === '?next=%2Forders')
  })

  test('a signed-out visit to one order keeps its address and the tab in the next parameter', async ({ page }) => {
    await mockOrders(page, [])
    await page.goto(`/orders/${orderId(1)}`)
    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('next') === `/orders/${orderId(1)}`)
  })
})

test.describe('the orders list', () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page)
  })

  test('each tab shows its own orders and its own count, and refunded ones under All and Returns/Refund', async ({ page }) => {
    await openList(page, everyStatus())
    await expect(page.getByRole('status').filter({ hasText: 'orders' })).toHaveText('9 orders')
    await expect(cards(page)).toHaveCount(9)

    const expected: [string, number[]][] = [
      ['To pay', [1, 2]],
      ['To ship', [3, 4]],
      ['To receive', [5, 6]],
      ['Completed', [7]],
      ['Cancelled', [8]],
      ['Returns/Refund', [9]],
    ]
    await expect(tab(page, 'All')).toHaveAttribute('aria-pressed', 'true')
    for (const [name, numbers] of expected) {
      await tab(page, name).click()
      await expect(tab(page, name)).toHaveAttribute('aria-pressed', 'true')
      await expect(cards(page)).toHaveCount(numbers.length)
      for (const n of numbers) await expect(card(page, n)).toBeVisible()
      if (name !== 'Returns/Refund') await expect(card(page, 9)).toHaveCount(0) // refunded shows only under All and Returns/Refund
    }
    await tab(page, 'All').click()
    await expect(card(page, 9)).toBeVisible()
    await expect(chip(page, 'REFUNDED')).toHaveText('Refunded')
  })

  test('every status reads as words on its chip', async ({ page }) => {
    await openList(page, everyStatus())
    const words: [number, string][] = [
      [1, 'Awaiting payment'], [2, 'Payment failed'], [3, 'Paid'], [4, 'Preparing'], [5, 'Shipped'],
      [6, 'Out for delivery'], [7, 'Delivered'], [8, 'Cancelled'], [9, 'Refunded'],
    ]
    for (const [n, label] of words) await expect(card(page, n)).toContainText(label)
  })

  test('the tab and the page live in the URL, so a reload keeps them', async ({ page }) => {
    await openList(page, everyStatus())
    await tab(page, 'To pay').click()
    await expect(page).toHaveURL(/\/orders\?tab=to-pay$/)
    await page.reload()
    await expect(tab(page, 'To pay')).toHaveAttribute('aria-pressed', 'true')
    await expect(cards(page)).toHaveCount(2)
  })

  test('a tab with no orders says so and offers View all orders', async ({ page }) => {
    await openList(page, [named(1, 'Pending Polo')])
    await expect(tab(page, 'To ship')).toBeVisible()
    await tab(page, 'To ship').click()
    await expect(page.getByRole('heading', { level: 2, name: 'Nothing being prepared' })).toBeVisible()
    await expect(page.getByText('Once you have paid, your order shows here while we pack it for delivery.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '/shop')
    await page.getByRole('button', { name: 'View all orders' }).click()
    await expect(tab(page, 'All')).toHaveAttribute('aria-pressed', 'true')
    await expect(card(page, 1)).toBeVisible()
    await expect(page).toHaveURL(/\/orders$/)
  })

  test('with no orders at all it says so and links back to the shop', async ({ page }) => {
    await openList(page, [])
    await expect(page.getByRole('heading', { level: 2, name: 'No orders yet' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Order status' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Back to shop' }).click()
    await expect(page).toHaveURL(/\/shop$/)
  })

  test('searching by product name or order number narrows the list, a miss offers Clear search', async ({ page }) => {
    await openList(page, everyStatus())
    const search = page.getByRole('searchbox', { name: 'Search orders by order number or product' })

    await search.fill('rolling')
    await expect(cards(page)).toHaveCount(1)
    await expect(card(page, 6)).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'orders' }).or(page.getByRole('status').filter({ hasText: 'order' }))).toContainText('matching “rolling”')

    await search.fill(num(3))
    await expect(cards(page)).toHaveCount(1)
    await expect(card(page, 3)).toBeVisible()

    await search.fill('zzz nothing')
    await expect(page.getByRole('heading', { level: 2, name: 'No orders match your search' })).toBeVisible()
    await expect(page.getByText(/Check the spelling, or clear the search/)).toBeVisible()
    await expect(cards(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(search).toHaveValue('')
    await expect(cards(page)).toHaveCount(9)
  })

  test('more than ten orders paginate, the page is in the URL, and Back returns to the first page', async ({ page }) => {
    const many = Array.from({ length: 23 }, (_, i) => named(i + 1, `Polo ${i + 1}`))
    await openList(page, many)
    await expect(cards(page)).toHaveCount(10)
    await expect(page.getByText(/Displaying 1.10 of 23/)).toBeVisible()
    await expect(card(page, 23)).toBeVisible() // newest first
    await expect(page.getByRole('button', { name: 'Prev' })).toBeDisabled()

    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page).toHaveURL(/\/orders\?page=2$/)
    await expect(page.getByText(/Displaying 11.20 of 23/)).toBeVisible()
    await expect(card(page, 13)).toBeVisible()
    await expect(card(page, 23)).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: 'My orders' })).toBeFocused() // a new page is announced from the top

    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page).toHaveURL(/page=3/)
    await expect(cards(page)).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()

    await page.goBack()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByText(/Displaying 11.20 of 23/)).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/orders$/)
    await expect(card(page, 23)).toBeVisible()
  })

  test('a page number past the end falls back to the last page', async ({ page }) => {
    await openList(page, Array.from({ length: 12 }, (_, i) => named(i + 1, `Polo ${i + 1}`)), '/orders?page=9')
    await expect(page.getByText(/Displaying 11.12 of 12/)).toBeVisible()
    await expect(cards(page)).toHaveCount(2)
  })

  test('while orders load it shows a skeleton, not an empty state', async ({ page }) => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const mock = await mockOrders(page, [named(1, 'Pending Polo')])
    mock.on.list = () => undefined
    await page.route(
      (url) => url.origin !== 'http://localhost:5173' && url.pathname === '/orders',
      async (route) => {
        if (route.request().method() === 'GET') await gate
        await route.fallback()
      },
    )
    await page.goto('/orders')
    await expect(page.getByRole('heading', { level: 1, name: 'My orders' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'No orders yet' })).toHaveCount(0)
    await expect(cards(page)).toHaveCount(0)
    release()
    await expect(card(page, 1)).toBeVisible()
  })

  test('a 500 shows the error panel with the details kept out, and Try again loads the orders', async ({ page }) => {
    let failing = true
    const mock = await mockOrders(page, [named(1, 'Pending Polo')])
    mock.on.list = () => (failing ? { status: 500, json: { statusCode: 500, message: 'Internal server error' } } : undefined)
    await page.goto('/orders')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Your orders did not load', { timeout: 15000 })
    await expect(alert).toContainText('Check your connection, then try again.')
    await expect(alert).not.toContainText('Internal server error')
    await expect(page.getByRole('group', { name: 'Order status' })).toHaveCount(0)

    failing = false
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(card(page, 1)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('a dropped connection shows the same panel and recovers on retry', async ({ page }) => {
    let failing = true
    const mock = await mockOrders(page, [named(1, 'Pending Polo')])
    mock.on.list = () => (failing ? 'abort' : undefined)
    await page.goto('/orders')
    await expect(page.getByRole('alert')).toContainText('Your orders did not load', { timeout: 15000 })
    failing = false
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(card(page, 1)).toBeVisible()
  })

  test('a card opens its order, from the number and from View order', async ({ page }) => {
    await openList(page, everyStatus())
    await card(page, 3).getByRole('link', { name: num(3), exact: true }).click()
    await expect(page).toHaveURL(`/orders/${orderId(3)}`)
    await expect(page.getByRole('heading', { level: 1, name: num(3) })).toBeVisible()
    await page.goBack()
    await card(page, 4).getByRole('link', { name: `View order ${num(4)}` }).click()
    await expect(page).toHaveURL(`/orders/${orderId(4)}`)
  })

  test('Cancel order is only offered on an unpaid order, and Track delivery only once it ships', async ({ page }) => {
    await openList(page, everyStatus())
    for (let n = 1; n <= 9; n++) {
      const cancel = card(page, n).getByRole('button', { name: 'Cancel order' })
      await expect(cancel, `cancel on order ${n}`).toHaveCount(n === 1 ? 1 : 0) // PAYMENT_FAILED cannot be cancelled either
      const track = card(page, n).getByRole('link', { name: /Track delivery/ })
      await expect(track, `track on order ${n}`).toHaveCount(n === 5 || n === 6 ? 1 : 0)
    }
  })

  test('cancelling from the list moves the order to the Cancelled tab', async ({ page }) => {
    const mock = await openList(page, [named(1, 'Pending Polo'), named(2, 'Second Skirt')])
    await card(page, 1).getByRole('button', { name: 'Cancel order' }).click()
    const dialog = page.getByRole('dialog', { name: 'Cancel this order?' })
    await expect(dialog.getByRole('button', { name: 'Keep order' })).toBeFocused()
    await dialog.getByRole('button', { name: 'Cancel order' }).click()
    await expect(page.getByText(`Order ${num(1)} cancelled.`)).toBeVisible()
    await expect(dialog).toBeHidden()
    expect(mock.cancels).toEqual([{ id: orderId(1), body: {} }])
    await expect(tab(page, 'Cancelled')).toBeVisible()
    await expect(tab(page, 'To pay')).toBeVisible()
    await tab(page, 'Cancelled').click()
    await expect(card(page, 1)).toContainText('Cancelled')
  })
})

test.describe('one order', () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page)
  })

  test('shows the items, the server totals, the address and the timeline of an unpaid order', async ({ page }) => {
    const unpaid = named(1, 'Pending Polo', {
      customerNotes: 'Please gift wrap.',
      items: [item('Pending Polo', { quantity: 2, totalPrice: 3780 })],
      subtotalAmount: 3780,
      totalAmount: 3879,
    })
    await openOrder(page, [unpaid], 1)
    await expect(chip(page, 'PENDING_PAYMENT')).toHaveText('Awaiting payment')
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    const summary = page.getByRole('complementary')
    await expect(summary).toContainText('₱3,780.00')
    await expect(summary).toContainText('₱99.00')
    await expect(summary).toContainText('₱3,879.00')
    await expect(summary).not.toContainText('Discount')
    await expect(summary).toContainText('Anne Santos')
    await expect(summary).toContainText('12 Rizal Avenue')
    await expect(summary.getByText('Online payment is coming soon. Your order is held until then.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'Pending Polo' })).toBeVisible()
    await expect(page.getByText('₱1,890.00 × 2')).toBeVisible()
    await expect(page.getByText('Please gift wrap.')).toBeVisible()
    const steps = page.getByRole('list', { name: 'Order progress' }).getByRole('listitem')
    await expect(steps).toHaveCount(6)
    await expect(steps.nth(1)).toHaveAttribute('aria-current', 'step') // waiting on payment
    await expect(page).toHaveTitle('Order SHF-20261001-000001 — SilhouFit')
  })

  test('Pay now does not exist yet and Cancel order is offered', async ({ page }) => {
    await openOrder(page, [named(1, 'Pending Polo')], 1)
    await expect(page.getByRole('button', { name: /Pay now/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cancel order' })).toBeVisible()
  })

  test('an order that does not exist says so with a way back', async ({ page }) => {
    await mockOrders(page, [])
    await page.goto(`/orders/${orderId(404)}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Order not found' })).toBeVisible({ timeout: 15000 })
    await page.getByRole('link', { name: 'Back to my orders' }).click()
    await expect(page).toHaveURL(/\/orders$/)
  })

  test('a failing order read shows an error panel, and Try again loads it', async ({ page }) => {
    const mock = await mockOrders(page, [named(1, 'Pending Polo')])
    let failing = true
    await page.route(
      (url) => url.origin !== 'http://localhost:5173' && url.pathname === `/orders/${orderId(1)}`,
      (route) => (failing && route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { message: 'boom' }, headers: { 'access-control-allow-origin': '*' } }) : route.fallback()),
    )
    await page.goto(`/orders/${orderId(1)}`)
    await expect(page.getByRole('alert')).toContainText('This order did not load', { timeout: 15000 })
    failing = false
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('heading', { level: 1, name: num(1) })).toBeVisible()
    expect(mock.details.length).toBeGreaterThan(0)
  })

  test('the tracking link appears from DISPATCHED on, and never earlier', async ({ page }) => {
    test.setTimeout(90_000) // five page loads
    const orders = everyStatus()
    await mockOrders(page, orders)
    for (const n of [1, 4, 5, 6, 7]) {
      await page.goto(`/orders/${orderId(n)}`)
      await expect(page.getByRole('heading', { level: 1, name: num(n) })).toBeVisible({ timeout: 15000 })
      const track = page.getByRole('link', { name: /Open it in a new tab/ })
      const map = page.getByTitle('Live delivery map')
      if (n === 5 || n === 6) {
        await expect(map, `order ${n}`).toHaveAttribute('src', 'https://track.example.com/abc')
        await expect(track.first()).toHaveAttribute('href', 'https://track.example.com/abc')
        await expect(track.first()).toHaveAttribute('rel', 'noopener noreferrer')
        await expect(track.first()).toHaveAttribute('target', '_blank')
      } else {
        await expect(track, `order ${n}`).toHaveCount(0)
        await expect(map, `order ${n}`).toHaveCount(0)
      }
    }
  })

  test('the courier is shown from DISPATCHED, and the driver phone only while out for delivery', async ({ page }) => {
    await mockOrders(page, everyStatus())
    await page.goto(`/orders/${orderId(5)}`) // DISPATCHED
    await expect(page.getByRole('heading', { level: 2, name: 'Delivery' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Lalamove · Motorcycle')).toBeVisible()
    await expect(page.getByText('Juan Dela Cruz')).toBeVisible()
    await expect(page.getByText('ABC 1234')).toBeVisible()
    await expect(page.getByRole('link', { name: '+639171112222' })).toHaveCount(0)

    await page.goto(`/orders/${orderId(6)}`) // OUT_FOR_DELIVERY
    await expect(page.getByRole('link', { name: '+639171112222' })).toHaveAttribute('href', 'tel:+639171112222')

    await page.goto(`/orders/${orderId(7)}`) // DELIVERED
    await expect(page.getByRole('heading', { level: 2, name: 'Delivery' })).toBeVisible()
    await expect(page.getByRole('link', { name: '+639171112222' })).toHaveCount(0)
    await expect(page.getByTitle('Live delivery map')).toHaveCount(0)
  })

  test('a tracking address that is not http(s) is never linked', async ({ page }) => {
    const bad = named(5, 'Shipped Shirt', { status: 'DISPATCHED', paymentStatus: 'PAID', shipment: apiShipment({ trackingUrl: 'javascript:alert(1)' }) })
    await openOrder(page, [bad], 5)
    await expect(page.getByRole('link', { name: /Open it in a new tab/ })).toHaveCount(0)
    await expect(page.getByTitle('Live delivery map')).toHaveCount(0)
  })

  test.describe('cancelling', () => {
    test('the dialog opens with focus inside, Escape closes it, and Keep order sends nothing', async ({ page }) => {
      const mock = await openOrder(page, [named(1, 'Pending Polo')], 1)
      const opener = page.getByRole('button', { name: 'Cancel order' })
      await opener.click()
      const dialog = page.getByRole('dialog', { name: 'Cancel this order?' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Are you sure?')).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Keep order' })).toBeFocused()
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
      // Tab stays inside the dialog.
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab')
        expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `focus after Tab ${i + 1}`).toBe(true)
      }

      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(opener).toBeFocused() // focus returns to where it was

      await opener.click()
      await dialog.getByRole('button', { name: 'Keep order' }).click()
      await expect(dialog).toBeHidden()
      expect(mock.cancels).toHaveLength(0)
      await expect(chip(page, 'PENDING_PAYMENT')).toBeVisible()
    })

    test('Cancel order sends the reason, shows a toast, turns the chip to Cancelled and lists it under Cancelled', async ({ page }) => {
      const mock = await openOrder(page, [named(1, 'Pending Polo'), named(2, 'Second Skirt')], 1)
      await page.getByRole('button', { name: 'Cancel order' }).click()
      const dialog = page.getByRole('dialog', { name: 'Cancel this order?' })
      await dialog.getByLabel('Reason (optional)').fill('Ordered by mistake')
      await expect(dialog.getByText('18/255')).toBeVisible()
      await dialog.getByRole('button', { name: 'Cancel order' }).click()

      await expect(page.getByText(`Order ${num(1)} cancelled.`)).toBeVisible()
      await expect(dialog).toBeHidden()
      expect(mock.cancels).toEqual([{ id: orderId(1), body: { cancellationReason: 'Ordered by mistake' } }])
      await expect(chip(page, 'CANCELLED')).toHaveText('Cancelled')
      await expect(page.getByRole('heading', { level: 2, name: 'This order was cancelled' })).toBeVisible()
      await expect(page.getByText('Reason: Ordered by mistake')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Buy again' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Download receipt' })).toHaveCount(0)

      await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Orders' }).click()
      await expect(tab(page, 'Cancelled')).toBeVisible()
      await tab(page, 'Cancelled').click()
      await expect(card(page, 1)).toContainText('Cancelled')
      await expect(cards(page)).toHaveCount(1)
    })

    test('both buttons wait while the request is in flight', async ({ page }) => {
      let release: () => void = () => {}
      const mock = await openOrder(page, [named(1, 'Pending Polo')], 1)
      mock.on.gate = new Promise<void>((resolve) => (release = resolve))
      await page.getByRole('button', { name: 'Cancel order' }).click()
      const dialog = page.getByRole('dialog', { name: 'Cancel this order?' })
      await dialog.getByRole('button', { name: 'Cancel order' }).click()
      await expect(dialog.getByRole('button', { name: 'Cancel order' })).toBeDisabled()
      await expect(dialog.getByRole('button', { name: 'Keep order' })).toBeDisabled()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeVisible() // cannot be dismissed mid-request
      release()
      await expect(dialog).toBeHidden()
      expect(mock.cancels).toHaveLength(1)
    })

    test('a cancel the server rejects with 400 explains, closes the dialog and refreshes the order', async ({ page }) => {
      const orders = [named(1, 'Pending Polo')]
      const mock = await openOrder(page, orders, 1)
      // Meanwhile the order was paid, so the API refuses.
      mock.on.cancel = () => {
        orders[0].status = 'PAID'
        orders[0].paymentStatus = 'PAID'
        return { status: 400, json: { statusCode: 400, message: 'Only unpaid orders with PENDING_PAYMENT status can be cancelled', error: 'Bad Request' } }
      }
      await page.getByRole('button', { name: 'Cancel order' }).click()
      await page.getByRole('dialog', { name: 'Cancel this order?' }).getByRole('button', { name: 'Cancel order' }).click()
      await expect(page.getByText("This order has already moved on and can't be cancelled.")).toBeVisible()
      await expect(page.getByRole('dialog', { name: 'Cancel this order?' })).toBeHidden()
      await expect(chip(page, 'PAID')).toHaveText('Paid')
      await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0)
      expect(mock.cancels).toHaveLength(1)
    })

    test('a dropped connection keeps the dialog open with the reason and says what to do', async ({ page }) => {
      const mock = await openOrder(page, [named(1, 'Pending Polo')], 1)
      mock.on.cancel = () => 'abort'
      await page.getByRole('button', { name: 'Cancel order' }).click()
      const dialog = page.getByRole('dialog', { name: 'Cancel this order?' })
      await dialog.getByLabel('Reason (optional)').fill('Changed my mind')
      await dialog.getByRole('button', { name: 'Cancel order' }).click()
      await expect(dialog.getByRole('alert')).toContainText("The order wasn't cancelled because the connection dropped")
      await expect(dialog.getByLabel('Reason (optional)')).toHaveValue('Changed my mind')
      mock.on.cancel = undefined
      await dialog.getByRole('button', { name: 'Cancel order' }).click()
      await expect(chip(page, 'CANCELLED')).toBeVisible()
    })
  })
})

test.describe('navigation and keyboard', () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page)
  })

  test('the account menu has an Orders item that opens My orders', async ({ page }) => {
    await mockOrders(page, [named(1, 'Pending Polo')])
    await page.goto('/shop')
    await page.getByRole('button', { name: 'Account, Demo Shopper' }).click()
    await page.getByRole('link', { name: 'Orders' }).click()
    await expect(page).toHaveURL(/\/orders$/)
    await expect(page.getByRole('heading', { level: 1, name: 'My orders' })).toBeVisible()
    await expect(card(page, 1)).toBeVisible()
  })

  test('tabs and a card work with the keyboard alone', async ({ page }) => {
    await openList(page, everyStatus())
    await tabTo(page, tab(page, 'To pay'))
    await page.keyboard.press('Enter')
    await expect(tab(page, 'To pay')).toHaveAttribute('aria-pressed', 'true')
    await expect(cards(page)).toHaveCount(2)
    await tabTo(page, tab(page, 'Cancelled'))
    await page.keyboard.press('Space')
    await expect(cards(page)).toHaveCount(1)
    await expect(card(page, 8)).toBeVisible()

    await tabTo(page, card(page, 8).getByRole('link', { name: num(8), exact: true }))
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(`/orders/${orderId(8)}`)
    await expect(page.getByRole('heading', { level: 1, name: num(8) })).toBeFocused()
  })

  test('the cancel dialog can be driven from the keyboard on a card', async ({ page }) => {
    const mock = await openList(page, [named(1, 'Pending Polo')])
    await tabTo(page, card(page, 1).getByRole('button', { name: 'Cancel order' }))
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Cancel this order?' })
    await expect(dialog.getByRole('button', { name: 'Keep order' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    expect(mock.cancels).toHaveLength(0)
    await expect(card(page, 1).getByRole('button', { name: 'Cancel order' })).toBeFocused()
  })
})

test.describe('small screens', () => {
  for (const width of [320, 390]) {
    test(`the list and an order fit ${width}px with no horizontal scroll and 44px targets`, async ({ page }) => {
      await signedIn(page)
      await page.setViewportSize({ width, height: 800 })
      const long = named(10, 'Showroom Denim Jacket With A Very Long Name That Keeps Going', {
        items: [item('Long Name Piece Number 1', { id: '00000000-0000-4000-8000-000000000041' }), item('Long Name Piece Number 2', { id: '00000000-0000-4000-8000-000000000042' })],
        status: 'DISPATCHED',
        paymentStatus: 'PAID',
        shipment: apiShipment(),
      })
      const orders = [...everyStatus(), long]
      await openList(page, orders)
      await expect(cards(page)).toHaveCount(10)
      expect(await overflows(page), `/orders at ${width}px`).toBe(false)
      await expect(card(page, 10)).toContainText('Long Name Piece Number 1')
      await expect(card(page, 10)).toContainText('Long Name Piece Number 2')

      const buttons = await page.getByRole('main').or(page.locator('#root')).first().evaluate(() => {
        const rows: { name: string; h: number }[] = []
        for (const el of document.querySelectorAll<HTMLElement>('article button, article a[href]:not(h2 a), [aria-label="Order status"] button, input[type=search]')) {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.height > 0) rows.push({ name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30), h: r.height })
        }
        return rows
      })
      expect(buttons.length).toBeGreaterThan(5)
      for (const { name, h } of buttons) expect(h, `${name} height`).toBeGreaterThanOrEqual(43.5)

      for (const n of [1, 6, 8, 10]) {
        await page.goto(`/orders/${orderId(n)}`)
        await expect(page.getByRole('heading', { level: 1, name: num(n) })).toBeVisible({ timeout: 15000 })
        expect(await overflows(page), `order ${n} at ${width}px`).toBe(false)
      }
      for (const control of await page.getByRole('complementary').getByRole('button').all()) {
        const box = (await control.boundingBox())!
        expect(box.height).toBeGreaterThanOrEqual(43.5)
      }
    })
  }

  test('an order with four lines shows two and says how many more, inside the card at 320px', async ({ page }) => {
    await signedIn(page)
    await page.setViewportSize({ width: 320, height: 800 })
    const four = named(10, 'Pending Polo', { items: [1, 2, 3, 4].map((i) => item(`Long Name Piece Number ${i}`, { id: `00000000-0000-4000-8000-00000000004${i}` })) })
    await openList(page, [four])
    await expect(card(page, 10)).toContainText('+2 more items')
    expect(await overflows(page)).toBe(false)
  })

  test('the status tabs stay under the header while the list scrolls', async ({ page }) => {
    await signedIn(page)
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 700 })
      const many = Array.from({ length: 10 }, (_, i) => named(i + 1, `Piece ${i + 1}`))
      await openList(page, many)
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      const top = await page.getByRole('group', { name: 'Order status' }).evaluate((el) => el.getBoundingClientRect().top)
      expect(top, `tabs top at ${width}px`).toBeGreaterThanOrEqual(0)
      expect(top, `tabs top at ${width}px`).toBeLessThan(120)
      // nothing from the list shows through or over the strip: it is solid
      for (let y = 0; y < 700; y += 240) {
        await page.evaluate((to) => window.scrollTo(0, to), y)
        const covered = await page.getByRole('group', { name: 'Order status' }).evaluate((el) => {
          const r = el.getBoundingClientRect()
          const hit = document.elementFromPoint(r.left + 8, r.top + r.height / 2)
          return r.top > 0 && r.top < 120 && !!hit && !el.contains(hit) && !hit.contains(el)
        })
        expect(covered, `strip covered at scroll ${y}, ${width}px`).toBe(false)
      }
    }
  })

  test('the status tabs scroll inside their own row, show the next one cut off, and the page does not', async ({ page }) => {
    await signedIn(page)
    await page.setViewportSize({ width: 320, height: 800 })
    await openList(page, everyStatus())
    const row = page.getByRole('group', { name: 'Order status' })
    const { inner, outer } = await row.evaluate((el) => ({ inner: el.scrollWidth, outer: el.clientWidth }))
    expect(inner).toBeGreaterThan(outer)
    expect(await overflows(page)).toBe(false)
    // a chip is partly in view at the right edge, which is what tells a person there is more
    const cut = await row.getByRole('button').evaluateAll((els, edge) => els.some((el) => { const r = el.getBoundingClientRect(); return r.left < edge && r.right > edge }), 320)
    expect(cut).toBe(true)
    await tab(page, 'Cancelled').click()
    await expect(tab(page, 'Cancelled')).toBeInViewport() // the chosen tab is scrolled into view
  })
})

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
    await signedIn(page)
  })

  test('the list, an order and the cancel dialog render dark without overflow', async ({ page }) => {
    await openList(page, everyStatus())
    await expect(page.locator('html')).toHaveClass(/dark/)
    const { heading, background } = await page.evaluate(() => ({
      heading: getComputedStyle(document.querySelector('h1')!).color,
      background: getComputedStyle(document.body).backgroundColor,
    }))
    expect(heading).not.toBe(background)
    expect(await overflows(page)).toBe(false)
    for (const n of [1, 5, 8]) await expect(card(page, n)).toBeVisible()

    await page.goto(`/orders/${orderId(1)}`)
    await expect(page.getByRole('heading', { level: 1, name: num(1) })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/dark/)
    expect(await overflows(page)).toBe(false)
    await page.getByRole('button', { name: 'Cancel order' }).click()
    await expect(page.getByRole('dialog', { name: 'Cancel this order?' })).toBeVisible()
    expect(await overflows(page)).toBe(false)
  })

  test('at 320px the dark list still fits', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await openList(page, everyStatus())
    await expect(page.locator('html')).toHaveClass(/dark/)
    expect(await overflows(page)).toBe(false)
  })
})

test.describe('live status updates', () => {
  test('an order page follows a status change made on the server, without a reload, and stops once it is delivered', async ({ page }) => {
    await signedIn(page)
    await page.clock.install()
    const mock = await openOrder(page, [named(6, 'Rolling Romper', { status: 'DISPATCHED', paymentStatus: 'PAID', paidAt: PAID_AT, shipment: apiShipment({ status: 'PICKED_UP' }) })], 6)
    await expect(chip(page, 'DISPATCHED')).toBeVisible()
    await page.evaluate(() => (window.__marker = 'same page'))

    // A webhook moves the order between two polls.
    mock.orders[0] = named(6, 'Rolling Romper', { status: 'OUT_FOR_DELIVERY', paymentStatus: 'PAID', paidAt: PAID_AT, shipment: apiShipment() })
    await page.clock.runFor(25_000)
    await expect(chip(page, 'OUT_FOR_DELIVERY')).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Your order is out for delivery.' })).toBeAttached()
    expect(await page.evaluate(() => window.__marker)).toBe('same page')

    mock.orders[0] = named(6, 'Rolling Romper', { status: 'DELIVERED', paymentStatus: 'PAID', paidAt: PAID_AT, shipment: apiShipment({ status: 'COMPLETED', deliveredAt: '2026-10-08T05:00:00.000Z' }) })
    await page.clock.runFor(25_000)
    await expect(chip(page, 'DELIVERED')).toBeVisible()
    const reads = mock.details.length
    await page.clock.runFor(120_000)
    expect(mock.details.length).toBe(reads)
  })
})

declare global {
  interface Window {
    __marker?: string
  }
}
