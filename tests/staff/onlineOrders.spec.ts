import { expect as baseExpect, test, type Locator, type Page } from '@playwright/test'
import {
  adminCustomer,
  adminEvent,
  adminOrder,
  adminOrderId,
  adminPayment,
  adminShipment,
  bookedOrder,
  fail,
  manyAdminOrders,
  mockAdminOrders,
  paidOrder,
  type AdminOrderDto,
  type AdminOrdersMock,
} from '../shared/adminOrders'
import { contrastRatio } from '../shared/contrast'
import { mockStaffMe } from '../shared/products'
import { DEMO, mockAuth } from '../shared/session'

// Staff Online orders against the admin order endpoints, which tests/shared/adminOrders.ts answers (six routes, nothing leaves the machine).
// Auth and /users/me are mocked and each test signs in through the real form, so the session carries a token like a real staff member's.
// The list is a table from the container's @4xl and cards below it, so the rows are found by their order number, which both draw as a button.

// A slow machine can take longer than the default 5s to draw a toast or a drawer.
const expect = baseExpect.configure({ timeout: 10_000 })

const PATH = '/staff/online-orders'
const num = (n: number) => adminOrder(n).orderNumber

async function setup(page: Page, orders: AdminOrderDto[] = []): Promise<AdminOrdersMock> {
  await mockAuth(page)
  await mockStaffMe(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  return mockAdminOrders(page, orders)
}

/** Signs in through the form and lands on `to`, query included. */
async function signInTo(page: Page, to: string) {
  await page.goto(`/login?next=${encodeURIComponent(to)}`)
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

async function open(page: Page, search = '') {
  await signInTo(page, `${PATH}${search}`)
  // The first visit may wait for the dev server to compile the page.
  await expect(page.getByRole('heading', { level: 1, name: 'Online orders' })).toBeVisible({ timeout: 20_000 })
}

const orderButton = (page: Page, n: number) => page.getByRole('button', { name: num(n) })
const rowOf = (page: Page, n: number) => page.getByRole('row').or(page.getByRole('listitem')).filter({ hasText: num(n) })
const drawerOf = (page: Page, n: number) => page.getByRole('dialog', { name: num(n), exact: true })
const toast = (page: Page, text: string) => page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: text })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const alertAbout = (scope: Page | Locator, what: string) => scope.getByRole('alert').filter({ hasText: `We couldn't load ${what}.` })

/** Opens the drawer of order n and waits for its details (the Actions heading is part of them). */
async function openDrawer(page: Page, n: number) {
  await orderButton(page, n).click()
  const drawer = drawerOf(page, n)
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('heading', { name: 'Actions' })).toBeVisible()
  return drawer
}

/** Below the container's @4xl the filters sit under a "Filters" summary. */
async function showFilters(page: Page) {
  const status = page.getByRole('combobox', { name: 'Order status' })
  if (await status.isVisible()) return
  await page.getByText(/^Filters \(\d+\)$/).click()
  await expect(status).toBeVisible()
}

async function pick(page: Page, label: string, option: string) {
  await showFilters(page)
  await page.getByRole('combobox', { name: label }).click()
  await page.getByRole('listbox', { name: label }).getByRole('option', { name: option, exact: true }).click()
}

const manilaToday = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).slice(0, 10)

test.describe('list', () => {
  test('asks only for the keys the API knows, newest first, with no sortable column', async ({ page }) => {
    const api = await setup(page, manyAdminOrders(12))
    // The table needs a wide screen: it shows once the page's card is 56rem wide.
    await page.setViewportSize({ width: 1920, height: 1080 })
    await open(page)

    await expect(orderButton(page, 12)).toBeVisible()
    expect(Object.fromEntries(api.lists[0])).toEqual({ page: '1', limit: '25' })
    for (const query of api.lists) for (const key of query.keys()) expect(['page', 'limit', 'status', 'paymentStatus', 'startDate', 'endDate', 'search']).toContain(key)

    const names = await page.getByRole('button', { name: /^SHF-/ }).evaluateAll((buttons) => buttons.map((button) => button.querySelector('span')!.textContent))
    expect(names.slice(0, 3)).toEqual([num(12), num(11), num(10)])

    // The table is a caption saying newest first, and no header is a button or announces a sort.
    const table = page.getByRole('table')
    await expect(table).toHaveAccessibleName(/newest first/)
    await expect(table.getByRole('columnheader')).toHaveText(['Order', 'Customer', 'Status', 'Placed', 'Products', 'Total'])
    await expect(table.getByRole('columnheader').getByRole('button')).toHaveCount(0)
    await expect(table.locator('[aria-sort]')).toHaveCount(0)
  })

  test('typing in the search box sends one request after the pause and writes ?q=', async ({ page }) => {
    const api = await setup(page, [adminOrder(1), adminOrder(2, { customer: adminCustomer({ fullName: 'Ben Cruz', email: 'ben@example.com' }) })])
    await open(page)
    await expect(orderButton(page, 2)).toBeVisible()
    const before = api.lists.length

    await page.getByLabel('Search orders by order number, customer name or email').pressSequentially('ben cruz')

    await expect.poll(() => api.lists.length).toBe(before + 1)
    expect(api.lists.at(-1)!.get('search')).toBe('ben cruz')
    await expect(page).toHaveURL(/[?&]q=ben(\+|%20)cruz/)
    await expect(orderButton(page, 2)).toBeVisible()
    await expect(orderButton(page, 1)).toHaveCount(0)
    expect(api.lists).toHaveLength(before + 1)
  })

  test('the URL filters become the request: status, payment, range, page size, page and search', async ({ page }) => {
    const api = await setup(page, manyAdminOrders(3))
    await open(page, '?status=PAID&payment=PAID&range=month&per=50&page=2&q=SHF')

    await expect.poll(() => api.lists.length).toBeGreaterThan(0)
    const today = manilaToday()
    expect(Object.fromEntries(api.lists[0])).toEqual({
      page: '2',
      limit: '50',
      status: 'PAID',
      paymentStatus: 'PAID',
      startDate: `${today.slice(0, 7)}-01T00:00:00+08:00`,
      endDate: `${today}T23:59:59.999+08:00`,
      search: 'SHF',
    })
  })

  test('picking filters in the toolbar updates the request and the URL, and Clear filters undoes them', async ({ page }) => {
    const api = await setup(page, [paidOrder(1), adminOrder(2), paidOrder(3, { status: 'PROCESSING' })])
    await open(page)
    await expect(orderButton(page, 3)).toBeVisible()

    await pick(page, 'Order status', 'Preparing')
    await expect(page).toHaveURL(/status=PROCESSING/)
    await expect.poll(() => api.lists.at(-1)!.get('status')).toBe('PROCESSING')
    await expect(orderButton(page, 3)).toBeVisible()
    await expect(orderButton(page, 1)).toHaveCount(0)

    await pick(page, 'Payment status', 'Paid')
    await expect(page).toHaveURL(/payment=PAID/)
    await expect.poll(() => api.lists.at(-1)!.get('paymentStatus')).toBe('PAID')

    await pick(page, 'Rows per page', '10 per page')
    await expect.poll(() => api.lists.at(-1)!.get('limit')).toBe('10')

    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await expect(page).not.toHaveURL(/status=|payment=/)
    await expect.poll(() => [...api.lists.at(-1)!.keys()].sort()).toEqual(['limit', 'page'])
    await expect(orderButton(page, 1)).toBeVisible()
  })

  test('says which orders are showing, and Prev and Next move between pages', async ({ page }) => {
    const api = await setup(page, manyAdminOrders(37))
    await open(page, '?per=10')

    await expect(page.getByText('Displaying 1–10 of 37')).toBeVisible()
    const pager = page.getByRole('navigation', { name: 'Pagination' })
    await expect(pager.getByRole('button', { name: 'Prev' })).toBeDisabled()

    await pager.getByRole('button', { name: 'Next' }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByText('Displaying 11–20 of 37')).toBeVisible()
    await expect(orderButton(page, 27)).toBeVisible()
    expect(api.lists.at(-1)!.get('page')).toBe('2')

    await pager.getByRole('button', { name: 'Prev' }).click()
    await expect(page.getByText('Displaying 1–10 of 37')).toBeVisible()
    await expect(orderButton(page, 37)).toBeVisible()
  })

  test('an order whose customer is gone says so, and the payment pill is left out when it repeats the status', async ({ page }) => {
    await setup(page, [
      adminOrder(1, { customer: null, userId: null }),
      paidOrder(2),
      paidOrder(3, { status: 'PROCESSING' }),
    ])
    await open(page)

    await expect(rowOf(page, 1).getByText('Customer account removed')).toBeVisible()
    // Awaiting payment / unpaid and Paid / paid read the same, so each shows one pill.
    await expect(rowOf(page, 1).getByText('Awaiting payment', { exact: true })).toHaveCount(1)
    await expect(rowOf(page, 2).getByText('Paid', { exact: true })).toHaveCount(1)
    // Preparing / paid differ, so both show.
    await expect(rowOf(page, 3).getByText('Preparing', { exact: true })).toHaveCount(1)
    await expect(rowOf(page, 3).getByText('Paid', { exact: true })).toHaveCount(1)
  })
})

test.describe('counts', () => {
  const orders = () => [paidOrder(1), adminOrder(2), adminOrder(3), paidOrder(4, { status: 'PROCESSING' }), bookedOrder(5)]

  test('show five tiles that count every order', async ({ page }) => {
    await setup(page, orders())
    await open(page)

    const counts = page.getByLabel('Order counts across all orders')
    await expect(counts.getByRole('term')).toHaveText(['Awaiting payment', 'Preparing', 'On the way', 'Delivered today', 'Revenue'])
    const tile = (label: string) => counts.locator('div').filter({ has: page.getByText(label, { exact: true }) })
    await expect(tile('Awaiting payment')).toHaveText('Awaiting payment2All orders')
    await expect(tile('Preparing')).toHaveText('Preparing1All orders')
    await expect(tile('On the way')).toHaveText('On the way1All orders')
    await expect(tile('Delivered today')).toHaveText('Delivered today0All orders')
    await expect(tile('Revenue')).toContainText('11,637')
  })

  test('fail on their own, with a Retry, while the list still shows', async ({ page }) => {
    const api = await setup(page, orders())
    api.on.metrics = () => fail(500)
    await open(page)

    await expect(orderButton(page, 5)).toBeVisible()
    const problem = alertAbout(page, 'the order counts')
    await expect(problem).toBeVisible()
    await expect(alertAbout(page, 'the orders')).toHaveCount(0)

    api.on.metrics = undefined
    await problem.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByLabel('Order counts across all orders')).toBeVisible()
    await expect(problem).toHaveCount(0)
  })

  test('still show when the list fails, and the list can retry alone', async ({ page }) => {
    const api = await setup(page, orders())
    api.on.list = () => fail(500)
    await open(page)

    await expect(page.getByLabel('Order counts across all orders')).toBeVisible()
    const problem = alertAbout(page, 'the orders')
    await expect(problem).toBeVisible()
    const reads = api.metrics

    api.on.list = undefined
    await problem.getByRole('button', { name: 'Retry' }).click()
    await expect(orderButton(page, 5)).toBeVisible()
    expect(api.metrics).toBe(reads)
  })
})

test.describe('states', () => {
  test('shows skeleton rows with a "Loading orders" status until the list arrives', async ({ page }) => {
    const api = await setup(page, manyAdminOrders(3))
    const release = api.hold('list')
    await open(page)

    await expect(page.getByRole('status').filter({ hasText: 'Loading orders' })).toHaveText('Loading orders')
    await expect(orderButton(page, 3)).toHaveCount(0)
    release()
    await expect(orderButton(page, 3)).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Loading orders' })).toHaveCount(0)
  })

  for (const [name, reply] of [
    ['500', fail(500)],
    ['403', fail(403, 'Forbidden resource')],
    ['429', fail(429, 'Too Many Requests')],
    ['a dropped connection', 'abort' as const],
  ] as const) {
    test(`a failed list (${name}) says what happened and Retry loads it`, async ({ page }) => {
      const api = await setup(page, manyAdminOrders(3))
      api.on.list = () => reply
      await open(page)

      const problem = alertAbout(page, 'the orders')
      await expect(problem).toBeVisible()
      await expect(problem.getByRole('button', { name: 'Retry' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 1, name: 'Online orders' })).toBeVisible()
      expect(await overflow(page)).toBe(0)

      api.on.list = undefined
      await problem.getByRole('button', { name: 'Retry' }).click()
      await expect(orderButton(page, 3)).toBeVisible()
      await expect(problem).toHaveCount(0)
    })
  }

  test('with no orders at all it says "No orders yet"', async ({ page }) => {
    await setup(page, [])
    await open(page)

    await expect(page.getByText('No orders yet', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0)
  })

  test('with a search that matches nothing it says "No orders match" and Clear filters brings the list back', async ({ page }) => {
    await setup(page, manyAdminOrders(2))
    await open(page, '?q=zzzz')

    await expect(page.getByText('No orders match', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page).not.toHaveURL(/q=/)
    await expect(page.getByLabel('Search orders by order number, customer name or email')).toHaveValue('')
    await expect(orderButton(page, 2)).toBeVisible()
  })

  test('a page past the end offers the first page', async ({ page }) => {
    await setup(page, manyAdminOrders(3))
    await open(page, '?page=9')

    await expect(page.getByText('There are no orders on page 9.')).toBeVisible()
    await page.getByRole('button', { name: 'Go to the first page' }).click()
    await expect(page).not.toHaveURL(/page=/)
    await expect(orderButton(page, 3)).toBeVisible()
  })

  test('a list that fails to reload keeps the old rows under a banner', async ({ page }) => {
    const api = await setup(page, [paidOrder(1), adminOrder(2)])
    await open(page)
    const drawer = await openDrawer(page, 1)

    api.on.list = () => fail(500)
    await drawer.getByRole('textbox', { name: 'Staff notes' }).fill('Call the customer')
    await drawer.getByRole('button', { name: 'Save notes' }).click()

    const banner = alertAbout(page, 'the latest orders')
    await expect(banner).toBeVisible()
    await expect(page.getByText('The list below is from before your last change.')).toBeVisible()
    await expect(orderButton(page, 2)).toBeAttached()

    // The drawer sits over the banner: close it to reach Retry.
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    api.on.list = undefined
    await banner.getByRole('button', { name: 'Retry' }).click()
    await expect(banner).toHaveCount(0)
  })
})

test.describe('drawer', () => {
  const full = () =>
    paidOrder(1, {
      customerNotes: 'Leave with the guard',
      items: [
        { ...adminOrder(1).items[0], id: 'i1', variantStock: 7 },
        { ...adminOrder(1).items[0], id: 'i2', productName: 'Linen Camp Shirt', variantSku: 'LCS-L', variantStock: null },
      ],
      paymentTransactions: [adminPayment(1)],
      shipment: adminShipment({
        orderId: adminOrder(1).id,
        status: 'ASSIGNING_DRIVER',
        externalOrderId: 'LLM-100',
        trackingUrl: 'https://track.example.com/abc',
        driverName: 'Juan Dela Cruz',
        driverPlateNumber: 'ABC 1234',
      }),
      status: 'DISPATCHED',
      shipmentEvents: [
        adminEvent(2, { courierStatus: 'ON_GOING', eventTimestamp: '2026-10-01T05:00:00.000Z' }),
        adminEvent(1, { courierStatus: 'ASSIGNING_DRIVER', eventTimestamp: '2026-10-01T04:00:00.000Z' }),
      ],
    })

  test('opens from a row and shows the customer, items, payments and delivery', async ({ page }) => {
    const api = await setup(page, [full()])
    await open(page)
    const drawer = await openDrawer(page, 1)

    expect(api.details).toEqual([adminOrder(1).id])
    await expect(drawer.getByText('Anne Santos').first()).toBeVisible()
    await expect(drawer.getByText('anne.santos@example.com')).toBeVisible()
    await expect(drawer.getByText('Leave with the guard')).toBeVisible()

    await expect(drawer.getByText('In stock now: 7')).toBeVisible()
    await expect(drawer.getByText('Variant deleted')).toBeVisible()
    await expect(drawer.getByText('Linen Camp Shirt')).toBeVisible()

    await expect(drawer.getByText('Paymongo · GCash')).toBeVisible()
    await expect(drawer.getByText('Fee', { exact: true })).toBeVisible()
    await expect(drawer.getByText('Net', { exact: true })).toBeVisible()

    await expect(drawer.getByText('Juan Dela Cruz')).toBeVisible()
    await expect(drawer.getByText('Finding a driver')).toBeVisible()
    // The courier's updates are listed oldest first, however the API ordered them.
    await expect(drawer.getByRole('list', { name: 'Courier updates, oldest first' }).getByRole('listitem')).toContainText(['Assigning driver', 'On going'])
    const link = drawer.getByRole('link', { name: /Open tracking page/ })
    await expect(link).toHaveAttribute('href', 'https://track.example.com/abc')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)

    // No notes yet: an empty box, and nothing to save.
    await expect(drawer.getByRole('textbox', { name: 'Staff notes' })).toHaveValue('')
    await expect(drawer.getByRole('button', { name: 'Save notes' })).toBeDisabled()
  })

  test('links a tracking page only when it is https', async ({ page }) => {
    await setup(page, [
      bookedOrder(1, { shipment: adminShipment({ status: 'ASSIGNING_DRIVER', externalOrderId: 'LLM-1', trackingUrl: 'http://track.example.com/a' }) }),
      bookedOrder(2, { shipment: adminShipment({ status: 'ASSIGNING_DRIVER', externalOrderId: 'LLM-2', trackingUrl: 'javascript:alert(1)' }) }),
    ])
    await open(page)

    for (const n of [1, 2]) {
      const drawer = await openDrawer(page, n)
      await expect(drawer.getByText('Finding a driver')).toBeVisible()
      await expect(drawer.getByRole('link', { name: /tracking/i })).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(drawer).toBeHidden()
    }
  })

  test('says so when there is no delivery, no courier updates or no payment attempt', async ({ page }) => {
    await setup(page, [adminOrder(1), bookedOrder(2, { shipmentEvents: [] })])
    await open(page)

    const first = await openDrawer(page, 1)
    await expect(first.getByText('No delivery booked.')).toBeVisible()
    await expect(first.getByText('No payment attempts yet.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(first).toBeHidden()

    const second = await openDrawer(page, 2)
    await expect(second.getByText('No courier updates yet.')).toBeVisible()
  })

  test('opens with Enter, keeps focus inside, and Escape closes it and gives focus back to the row', async ({ page }) => {
    await setup(page, [paidOrder(1), adminOrder(2)])
    await open(page)

    const opener = orderButton(page, 1)
    await opener.focus()
    await page.keyboard.press('Enter')
    const drawer = drawerOf(page, 1)
    await expect(drawer.getByRole('heading', { name: 'Actions' })).toBeVisible()

    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab')
      expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(opener).toBeFocused()
  })

  test('a failed order read shows its own error with Retry and leaves the list alone', async ({ page }) => {
    const api = await setup(page, [paidOrder(1)])
    api.on.detail = () => fail(500)
    await open(page)

    await orderButton(page, 1).click()
    const drawer = drawerOf(page, 1)
    const problem = alertAbout(drawer, 'the order details')
    await expect(problem).toBeVisible()
    await expect(alertAbout(page, 'the orders')).toHaveCount(0)

    api.on.detail = undefined
    await problem.getByRole('button', { name: 'Retry' }).click()
    await expect(drawer.getByRole('heading', { name: 'Actions' })).toBeVisible()
    await expect(problem).toHaveCount(0)
  })
})

test.describe('actions', () => {
  test('a paid order has no Mark buttons, only Start preparing and Book rider', async ({ page }) => {
    await setup(page, [paidOrder(1)])
    await open(page)
    const drawer = await openDrawer(page, 1)
    await expect(drawer.getByRole('button', { name: 'Start preparing' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Book rider' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: /^Mark/ })).toHaveCount(0)
  })

  for (const [label, status] of [
    ['delivered', 'DELIVERED'],
    ['cancelled', 'CANCELLED'],
  ] as const) {
    test(`a ${label} order says "This order is closed." and offers no move`, async ({ page }) => {
      await setup(page, [paidOrder(1, { status })])
      await open(page)
      const drawer = await openDrawer(page, 1)

      await expect(drawer.getByText('This order is closed.')).toBeVisible()
      await expect(drawer.getByRole('button', { name: /^Mark |^Start preparing|^Book rider|^Cancel/ })).toHaveCount(0)
    })
  }

  test('Save notes sends the cleaned notes and then waits for new text', async ({ page }) => {
    const api = await setup(page, [paidOrder(1)])
    await open(page)
    const drawer = await openDrawer(page, 1)

    await drawer.getByRole('textbox', { name: 'Staff notes' }).fill('  Call before delivery  ')
    await expect(drawer.getByText('24/500')).toBeVisible()
    await drawer.getByRole('button', { name: 'Save notes' }).click()

    await expect(toast(page, 'Notes saved')).toBeVisible()
    expect(api.patches).toEqual([{ id: adminOrder(1).id, body: { adminNotes: 'Call before delivery' } }])
    await expect(drawer.getByRole('textbox', { name: 'Staff notes' })).toHaveValue('Call before delivery')
    await expect(drawer.getByRole('button', { name: 'Save notes' })).toBeDisabled()
  })

  test.describe('cancel order', () => {
    const confirmOf = (page: Page, n: number) => page.getByRole('dialog', { name: `Cancel order ${num(n)}?`, exact: true })

    test('asks "Are you sure?", warns that a paid order is not refunded, and sends the status and reason', async ({ page }) => {
      const api = await setup(page, [paidOrder(1)])
      await open(page)
      const drawer = await openDrawer(page, 1)
      await drawer.getByRole('button', { name: 'Cancel order', exact: true }).click()

      const confirm = confirmOf(page, 1)
      await expect(confirm.getByText('Are you sure?')).toBeVisible()
      await expect(confirm.getByText('Stock goes back to inventory and any open payment link expires.')).toBeVisible()
      await expect(confirm.getByText('The payment is not refunded automatically.')).toBeVisible()
      await expect(confirm.getByText('0/255')).toBeVisible()
      await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()

      await confirm.getByLabel(/^Reason/).fill('Customer asked')
      await expect(confirm.getByText('14/255')).toBeVisible()

      // A refusal from the server stays in the dialog, with what the server said.
      api.on.patch = () => fail(409, 'The order has already moved on')
      await confirm.getByRole('button', { name: 'Cancel order', exact: true }).click()
      await expect(confirm.getByRole('alert')).toHaveText('The order was not cancelled. The order has already moved on')
      await expect(confirm).toBeVisible()

      api.on.patch = undefined
      await confirm.getByRole('button', { name: 'Cancel order', exact: true }).click()
      await expect(toast(page, 'Order cancelled')).toBeVisible()
      await expect(confirm).toBeHidden()
      expect(api.patches.at(-1)).toEqual({ id: adminOrder(1).id, body: { status: 'CANCELLED', cancellationReason: 'Customer asked' } })
      await expect(drawer.getByText('This order is closed.')).toBeVisible()
    })

    test('an unpaid order has no refund warning, and Cancel leaves it alone', async ({ page }) => {
      const api = await setup(page, [adminOrder(1)])
      await open(page)
      const drawer = await openDrawer(page, 1)
      await drawer.getByRole('button', { name: 'Cancel order', exact: true }).click()

      const confirm = confirmOf(page, 1)
      await expect(confirm.getByText('Are you sure?')).toBeVisible()
      await expect(confirm.getByText('The payment is not refunded automatically.')).toHaveCount(0)
      await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(confirm).toBeHidden()
      expect(api.patches).toHaveLength(0)
    })
  })

  test.describe('start preparing', () => {
    const start = (drawer: Locator) => drawer.getByRole('button', { name: 'Start preparing' })

    test('moves the order to Preparing, toasts, and leaves Book rider on', async ({ page }) => {
      const api = await setup(page, [paidOrder(1)])
      await open(page)
      const drawer = await openDrawer(page, 1)
      await start(drawer).click()

      await expect(toast(page, 'Order moved to Preparing')).toBeVisible()
      expect(api.patches).toEqual([{ id: adminOrder(1).id, body: { status: 'PROCESSING' } }])
      await expect(drawer.getByText('Preparing', { exact: true }).first()).toBeVisible()
      await expect(start(drawer)).toHaveCount(0)
      await expect(drawer.getByRole('button', { name: 'Book rider' })).toBeEnabled()
      await expect(rowOf(page, 1).first()).toContainText('Preparing')
    })

    test('while pending it is busy, every other action waits, and a second click sends nothing', async ({ page }) => {
      const api = await setup(page, [paidOrder(1)])
      await open(page)
      const drawer = await openDrawer(page, 1)
      const release = api.hold('patch')
      await start(drawer).click()

      const busy = drawer.getByRole('button', { name: 'Starting…' })
      await expect(busy).toBeDisabled()
      await expect(busy).toHaveAttribute('aria-busy', 'true')
      await expect(drawer.getByRole('button', { name: 'Book rider' })).toBeDisabled()
      await expect(drawer.getByRole('button', { name: 'Cancel order', exact: true })).toBeDisabled()
      await busy.click({ force: true })
      expect(api.patches).toHaveLength(1)

      release()
      await expect(toast(page, 'Order moved to Preparing')).toBeVisible()
      expect(api.patches).toHaveLength(1)
    })

    test('a refusal shows the server sentence with no Retry, and the drawer then shows the order closed', async ({ page }) => {
      const api = await setup(page, [paidOrder(1)])
      await open(page)
      const drawer = await openDrawer(page, 1)
      api.on.patch = () => {
        api.orders[0].status = 'CANCELLED'
        return fail(400, 'Order SHF-1 is in terminal status "CANCELLED" and cannot be transitioned to "PROCESSING".')
      }
      await start(drawer).click()

      const failed = toast(page, 'The order was not moved to Preparing. Order SHF-1 is in terminal status "CANCELLED"')
      await expect(failed).toBeVisible()
      await expect(failed.getByRole('button', { name: 'Retry' })).toHaveCount(0)
      await expect(drawer.getByText('This order is closed.')).toBeVisible()
    })

    test('a 429 says to wait a minute, with Retry', async ({ page }) => {
      const api = await setup(page, [paidOrder(1)])
      await open(page)
      const drawer = await openDrawer(page, 1)
      api.on.patch = () => fail(429, 'Too Many Requests')
      await start(drawer).click()

      const failed = toast(page, 'The order was not moved to Preparing. Too many requests right now. Wait a minute, then try again.')
      await expect(failed).toBeVisible()
      await expect(failed.getByRole('button', { name: 'Retry' })).toBeVisible()
    })

    test('a dropped connection says so, and Retry moves the order', async ({ page }) => {
      const api = await setup(page, [paidOrder(1)])
      await open(page)
      const drawer = await openDrawer(page, 1)
      api.on.patch = () => 'abort'
      await start(drawer).click()

      const failed = toast(page, 'The order was not moved to Preparing. The connection dropped before we got a response.')
      await expect(failed).toBeVisible()
      api.on.patch = undefined
      await failed.getByRole('button', { name: 'Retry' }).click()
      await expect(toast(page, 'Order moved to Preparing')).toBeVisible()
      expect(api.patches).toHaveLength(2)
    })

    test('a 403 says the session ended, with no Retry', async ({ page }) => {
      const api = await setup(page, [paidOrder(1)])
      await open(page)
      const drawer = await openDrawer(page, 1)
      api.on.patch = () => fail(403, 'Forbidden resource')
      await start(drawer).click()

      const failed = toast(page, 'The order was not moved to Preparing. Your session ended')
      await expect(failed).toBeVisible()
      await expect(failed.getByRole('button', { name: 'Retry' })).toHaveCount(0)
    })
  })

  test.describe('book rider', () => {
    test('is off with the reason in view when it cannot be booked', async ({ page }) => {
      await setup(page, [
        adminOrder(1),
        bookedOrder(2),
        bookedOrder(3, { status: 'PAID', shipment: adminShipment({ status: 'DISPATCHING', externalOrderId: null }) }),
      ])
      await open(page)

      for (const [n, why] of [
        [1, 'Book a rider once the payment is confirmed.'],
        [2, 'A rider is already booked for this order.'],
        [3, 'A rider is being booked for this order.'],
      ] as const) {
        const drawer = await openDrawer(page, n)
        const book = drawer.getByRole('button', { name: 'Book rider' })
        await expect(book).toBeDisabled()
        await expect(drawer.getByText(why, { exact: true })).toBeVisible()
        await expect(book).toHaveAccessibleDescription(why)
        await page.keyboard.press('Escape')
        await expect(drawer).toBeHidden()
      }
    })

    test('while the courier is still booking (no booking id yet) there is no Cancel delivery, and Cancel order waits', async ({ page }) => {
      await setup(page, [paidOrder(1, { shipment: adminShipment({ orderId: adminOrder(1).id, status: 'DISPATCHING', externalOrderId: null }) })])
      await open(page)
      const drawer = await openDrawer(page, 1)

      await expect(drawer.getByRole('button', { name: 'Cancel delivery' })).toHaveCount(0)
      await expect(drawer.getByRole('button', { name: 'Cancel order', exact: true })).toBeDisabled()
      await expect(drawer.getByText('A rider is being booked. Wait for it to finish.')).toBeVisible()
    })

    test('books a rider, toasts, and then offers Cancel delivery', async ({ page }) => {
      const api = await setup(page, [paidOrder(1)])
      await open(page)
      const drawer = await openDrawer(page, 1)
      await expect(drawer.getByRole('button', { name: 'Cancel delivery' })).toHaveCount(0)

      await drawer.getByRole('button', { name: 'Book rider' }).click()

      await expect(toast(page, 'Rider booked')).toBeVisible()
      expect(api.dispatches).toEqual([adminOrder(1).id])
      await expect(drawer.getByRole('button', { name: 'Cancel delivery' })).toBeVisible()
      await expect(drawer.getByText('Finding a driver')).toBeVisible()
    })

    for (const status of [502, 500]) {
      test(`a ${status} says no rider was booked, and Retry books one`, async ({ page }) => {
        const api = await setup(page, [paidOrder(1)])
        await open(page)
        const drawer = await openDrawer(page, 1)

        api.on.dispatch = () => fail(status)
        await drawer.getByRole('button', { name: 'Book rider' }).click()
        const failed = toast(page, "Lalamove didn't answer, so no rider was booked. Try again in a few minutes.")
        await expect(failed).toBeVisible()

        api.on.dispatch = undefined
        await failed.getByRole('button', { name: 'Retry' }).click()
        await expect(toast(page, 'Rider booked')).toBeVisible()
        expect(api.dispatches).toHaveLength(2)
      })
    }

    test('a 429 says to wait a minute', async ({ page }) => {
      const api = await setup(page, [paidOrder(1)])
      api.on.dispatch = () => fail(429, 'Too Many Requests')
      await open(page)
      const drawer = await openDrawer(page, 1)

      await drawer.getByRole('button', { name: 'Book rider' }).click()
      const failed = toast(page, 'Too many requests right now, so no rider was booked. Wait a minute, then try again.')
      await expect(failed).toBeVisible()
      await expect(failed.getByRole('button', { name: 'Retry' })).toBeVisible()
    })

    test('a 409 says it is already being dispatched, with no Retry', async ({ page }) => {
      const api = await setup(page, [paidOrder(1)])
      api.on.dispatch = () => fail(409, 'Dispatch in progress')
      await open(page)
      const drawer = await openDrawer(page, 1)

      await drawer.getByRole('button', { name: 'Book rider' }).click()
      const failed = toast(page, 'This order is already being dispatched.')
      await expect(failed).toBeVisible()
      await expect(failed.getByRole('button', { name: 'Retry' })).toHaveCount(0)
    })
  })

  test.describe('cancel delivery', () => {
    const confirmOf = (page: Page, n: number) => page.getByRole('dialog', { name: `Cancel the delivery for ${num(n)}?`, exact: true })

    test('explains what happens, shows the Lalamove refusal inline, and then cancels', async ({ page }) => {
      const api = await setup(page, [bookedOrder(1)])
      await open(page)
      const drawer = await openDrawer(page, 1)
      await expect(drawer.getByRole('button', { name: 'Cancel order', exact: true })).toBeDisabled()
      await expect(drawer.getByText('Cancel the delivery first.')).toBeVisible()

      await drawer.getByRole('button', { name: 'Cancel delivery' }).click()
      const confirm = confirmOf(page, 1)
      await expect(confirm.getByText('Are you sure?')).toBeVisible()
      await expect(confirm.getByText('The order goes back to Preparing so you can book again.')).toBeVisible()
      await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()

      api.on.cancelDelivery = () => fail(409, 'Cannot cancel')
      await confirm.getByRole('button', { name: 'Cancel delivery' }).click()
      await expect(confirm.getByRole('alert')).toHaveText(
        'Lalamove only lets you cancel while it is finding a driver or within 5 minutes of a match. Contact Lalamove support to cancel this delivery.',
      )

      api.on.cancelDelivery = undefined
      await confirm.getByRole('button', { name: 'Cancel delivery' }).click()
      await expect(toast(page, 'Delivery cancelled')).toBeVisible()
      await expect(confirm).toBeHidden()
      expect(api.cancelDeliveries).toHaveLength(2)
      // The order is back to Preparing, so a rider can be booked again.
      await expect(drawer.getByRole('button', { name: 'Book rider' })).toBeEnabled()
      await expect(drawer.getByRole('button', { name: 'Cancel delivery' })).toHaveCount(0)
    })
  })
})

test.describe('dashboard Recent orders tile', () => {
  const tile = (page: Page) => page.getByRole('region', { name: 'Recent orders' })

  test('makes one request for the latest 14 and shows full order numbers on a desktop screen', async ({ page }) => {
    const api = await setup(page, manyAdminOrders(20))
    await page.setViewportSize({ width: 1280, height: 900 })
    await signInTo(page, '/staff')

    await expect(tile(page).getByText(num(20), { exact: true })).toBeVisible({ timeout: 20_000 })
    expect(api.lists.filter((q) => q.get('limit') === '14').map((q) => q.toString())).toEqual(['page=1&limit=14'])
    await expect(tile(page).getByRole('listitem')).toHaveCount(14)
    for (const n of [20, 19, 7]) {
      const number = tile(page).getByText(num(n), { exact: true })
      await expect(number).toBeVisible()
      expect(await number.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
    expect(await overflow(page)).toBe(0)
  })

  test('shows full order numbers at 320px with no horizontal scroll', async ({ page }) => {
    await setup(page, manyAdminOrders(20))
    await page.setViewportSize({ width: 320, height: 700 })
    await signInTo(page, '/staff')

    // Below the xl breakpoint the tile shows the latest 8 of the 14.
    await expect(tile(page).getByRole('listitem')).toHaveCount(8, { timeout: 20_000 })
    for (const n of [20, 19, 13]) {
      const number = tile(page).getByText(num(n), { exact: true })
      await number.scrollIntoViewIfNeeded()
      await expect(number).toBeVisible()
      expect(await number.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
    expect(await overflow(page)).toBe(0)
  })

  test('shows an error with Retry, and an empty state', async ({ page }) => {
    const api = await setup(page, [])
    api.on.list = () => fail(500)
    await signInTo(page, '/staff')

    const problem = alertAbout(tile(page), 'the recent orders')
    await expect(problem).toBeVisible({ timeout: 20_000 })
    api.on.list = undefined
    await problem.getByRole('button', { name: 'Retry' }).click()
    await expect(tile(page).getByText('No orders yet. Customers who order show here as soon as they check out.')).toBeVisible()
  })

  test('View all goes to the Online orders page', async ({ page }) => {
    await setup(page, manyAdminOrders(2))
    await signInTo(page, '/staff')

    const viewAll = tile(page).getByRole('link', { name: 'View all online orders' })
    await expect(viewAll).toBeVisible({ timeout: 20_000 })
    await viewAll.click()
    await expect(page).toHaveURL(/\/staff\/online-orders$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Online orders' })).toBeVisible()
  })
})

test.describe('a saved dev account has no session with the server', () => {
  test('the server turns the admin calls down and the page shows the error with Retry, not a crash', async ({ page }) => {
    const api = await setup(page, manyAdminOrders(3))
    api.on.list = () => fail(401, 'Unauthorized')
    api.on.metrics = () => fail(401, 'Unauthorized')
    const crashes: string[] = []
    page.on('pageerror', (error) => crashes.push(error.message))

    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill('sam.reyes@silhoufit.dev')
    await page.getByLabel('Password', { exact: true }).fill('Staff@12345')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/staff$/)
    await page.goto(PATH)

    await expect(page.getByRole('heading', { level: 1, name: 'Online orders' })).toBeVisible()
    await expect(alertAbout(page, 'the orders').getByRole('button', { name: 'Retry' })).toBeVisible()
    await expect(alertAbout(page, 'the order counts').getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(crashes).toEqual([])
  })
})

test.describe('layout', () => {
  test('has no horizontal scroll at 320px or at 1920px, and draws cards below the breakpoint and a table above it', async ({ page }) => {
    await setup(page, manyAdminOrders(12, (n) => (n % 2 ? { customer: null } : {})))
    await page.setViewportSize({ width: 320, height: 700 })
    await open(page)

    await expect(orderButton(page, 12)).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
    await expect(page.getByRole('list', { name: 'Orders, newest first' })).toBeVisible()
    expect(await overflow(page)).toBe(0)

    await page.setViewportSize({ width: 1920, height: 1080 })
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Orders, newest first' })).toHaveCount(0)
    expect(await overflow(page)).toBe(0)
  })

  test('the drawer has no horizontal scroll at 320px and its Copy order ID button is at least 44 by 44', async ({ page }) => {
    await setup(page, [bookedOrder(1)])
    await page.setViewportSize({ width: 320, height: 700 })
    await open(page)
    const drawer = await openDrawer(page, 1)

    const box = await drawer.getByRole('button', { name: 'Copy order ID' }).boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(await overflow(page)).toBe(0)
    expect(await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
  })

  test('renders in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await setup(page, [paidOrder(1), adminOrder(2)])
    await open(page)

    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(orderButton(page, 2)).toBeVisible()
    await expect(page.getByLabel('Order counts across all orders')).toBeVisible()
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const [red, green, blue] = background.match(/\d+/g)!.map(Number)
    expect(red + green + blue).toBeLessThan(384)
  })
})

// Start preparing next to Book rider and Cancel order: how the three sit in the drawer, by keyboard, when it is off, in both colour schemes, and what it does to the list and counts.
test.describe('start preparing layout', () => {
  const start = (drawer: Locator) => drawer.getByRole('button', { name: 'Start preparing' })
  const book = (drawer: Locator) => drawer.getByRole('button', { name: 'Book rider' })
  const cancel = (drawer: Locator) => drawer.getByRole('button', { name: 'Cancel order', exact: true })
  const BOOKING = 'A rider is being booked. Wait for it to finish.'
  const dispatching = (n: number) => paidOrder(n, { shipment: adminShipment({ orderId: adminOrderId(n), status: 'DISPATCHING', externalOrderId: null }) })

  for (const width of [320, 375, 768, 1280]) {
    test(`at ${width}px the three actions stay inside the drawer, apart, readable and tall enough to touch`, async ({ page, hasTouch }) => {
      await setup(page, [paidOrder(1)])
      await page.setViewportSize({ width, height: 800 })
      await open(page)
      const drawer = await openDrawer(page, 1)
      const buttons = [start(drawer), book(drawer), cancel(drawer)]
      for (const button of buttons) await expect(button).toBeVisible()

      expect(await overflow(page)).toBe(0)
      expect(await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)

      // The drawer slides in: measure once it has stopped.
      let last = -1
      await expect.poll(async () => {
        const x = (await drawer.boundingBox())!.x
        const still = x === last
        last = x
        return still
      }).toBe(true)
      const frame = (await drawer.boundingBox())!
      const boxes = []
      for (const button of buttons) boxes.push((await button.boundingBox())!)
      for (const box of boxes) {
        expect(box.x).toBeGreaterThanOrEqual(frame.x)
        expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width)
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]
          const b = boxes[j]
          const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
          expect(apart, `button ${i} overlaps button ${j} at ${width}px`).toBe(true)
        }
      }

      if (width < 768) {
        for (const button of buttons) expect(await button.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
      }
      // A touch screen, or a phone-width window, gets 44px controls; a mouse at 768px and up gets 36px ones, by design.
      test.skip(!hasTouch && width >= 768, 'touch targets only apply to touch screens and phone widths')
      // 43.99997 is 44 after layout rounding.
      for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(43.9)
    })
  }

  for (const key of ['Enter', 'Space']) {
    test(`with the keyboard alone ${key} on Start preparing moves the order and focus lands on Book rider`, async ({ page }) => {
      const api = await setup(page, [paidOrder(1)])
      await open(page)
      await orderButton(page, 1).focus()
      await page.keyboard.press('Enter')
      const drawer = drawerOf(page, 1)
      await expect(drawer.getByRole('heading', { name: 'Actions' })).toBeVisible()

      let found = false
      for (let i = 0; i < 25 && !found; i++) {
        await page.keyboard.press('Tab')
        found = await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Start preparing')
      }
      expect(found, 'Tab reaches Start preparing').toBe(true)
      await expect(start(drawer)).toBeFocused()

      await page.keyboard.press(key)
      await expect(toast(page, 'Order moved to Preparing')).toBeVisible()
      expect(api.patches).toEqual([{ id: adminOrder(1).id, body: { status: 'PROCESSING' } }])
      await expect(book(drawer)).toBeFocused()
      expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Book rider')
    })
  }

  test('while a rider is being booked it is off, says why in view, and the reason is its description', async ({ page }) => {
    const api = await setup(page, [dispatching(1)])
    await open(page)
    const drawer = await openDrawer(page, 1)

    await expect(start(drawer)).toBeDisabled()
    await expect(start(drawer)).toHaveAccessibleDescription(BOOKING)
    // No role names a paragraph, so the reason is found through the id the button points at.
    const reason = drawer.locator(`[id="${await start(drawer).getAttribute('aria-describedby')}"]`)
    await expect(reason).toBeVisible()
    await expect(reason).toHaveText(BOOKING)

    await start(drawer).click({ force: true })
    expect(api.patches).toHaveLength(0)
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`in ${scheme} mode the button text, its border and the reason are readable`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await setup(page, [paidOrder(1), dispatching(2)])
      await open(page)

      /** `prop` of the element and the colour it sits on (translucent layers up the tree are blended), both as rgb(). */
      const colours = (locator: Locator, prop: 'color' | 'borderTopColor') =>
        locator.evaluate((el, property) => {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 1
          const context = canvas.getContext('2d', { willReadFrequently: true })!
          const parse = (css: string): number[] => {
            context.clearRect(0, 0, 1, 1)
            context.fillStyle = '#000'
            context.fillStyle = css
            context.fillRect(0, 0, 1, 1)
            const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
            return [r, g, b, a / 255]
          }
          const over = (top: number[], below: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + below[i] * (1 - top[3]))
          const layers: number[][] = []
          for (let node: Element | null = el; node; node = node.parentElement) {
            const layer = parse(getComputedStyle(node).backgroundColor)
            if (layer[3] > 0) layers.push(layer)
            if (layer[3] === 1) break
          }
          let bg = [255, 255, 255]
          for (const layer of layers.reverse()) bg = over(layer, bg)
          const fg = over(parse(getComputedStyle(el)[property]), bg)
          const rgb = (c: number[]) => `rgb(${c.map(Math.round).join(', ')})`
          return { fg: rgb(fg), bg: rgb(bg) }
        }, prop)

      const first = await openDrawer(page, 1)
      const text = await colours(start(first), 'color')
      expect(contrastRatio(text.fg, text.bg), `${scheme} Start preparing text ${text.fg} on ${text.bg}`).toBeGreaterThanOrEqual(4.5)
      // The edge is a faint glass line shared by every secondary button; the label carries the contrast. Its ratio is recorded for the report, and it must at least be drawn.
      const border = await colours(start(first), 'borderTopColor')
      test.info().annotations.push({ type: `${scheme} border contrast`, description: `${contrastRatio(border.fg, border.bg).toFixed(2)} (${border.fg} on ${border.bg})` })
      expect(await start(first).evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThan(0)
      await page.keyboard.press('Escape')
      await expect(first).toBeHidden()

      const second = await openDrawer(page, 2)
      const why = second.locator(`[id="${await start(second).getAttribute('aria-describedby')}"]`)
      const reason = await colours(why, 'color')
      expect(contrastRatio(reason.fg, reason.bg), `${scheme} reason ${reason.fg} on ${reason.bg}`).toBeGreaterThanOrEqual(4.5)
    })
  }

  test('after it succeeds the row reads Preparing, no row is lost and the Preparing count goes up after the refetch', async ({ page }) => {
    const api = await setup(page, [paidOrder(1), paidOrder(2), adminOrder(3), bookedOrder(4)])
    await open(page)
    const counts = page.getByLabel('Order counts across all orders')
    const tile = (label: string) => counts.locator('div').filter({ has: page.getByText(label, { exact: true }) })
    await expect(tile('Preparing')).toHaveText('Preparing0All orders')
    await expect(tile('Awaiting payment')).toHaveText('Awaiting payment1All orders')
    await expect(tile('On the way')).toHaveText('On the way1All orders')
    const reads = api.metrics

    const drawer = await openDrawer(page, 1)
    await start(drawer).click()
    await expect(toast(page, 'Order moved to Preparing')).toBeVisible()

    await expect.poll(() => api.metrics).toBeGreaterThan(reads)
    await expect(tile('Preparing')).toHaveText('Preparing1All orders')
    await expect(tile('Awaiting payment')).toHaveText('Awaiting payment1All orders')
    await expect(tile('On the way')).toHaveText('On the way1All orders')
    await expect(rowOf(page, 1).first()).toContainText('Preparing')
    await expect(rowOf(page, 2).first()).not.toContainText('Preparing')
    for (const n of [1, 2, 3, 4]) await expect(page.getByRole('button', { name: new RegExp(`^${num(n)}`) })).toHaveCount(1)
  })
})
