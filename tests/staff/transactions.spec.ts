import { expect as baseExpect, test, type Download, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { adminCustomer, adminOrderId, fail } from '../shared/adminOrders'
import {
  adminTransaction,
  manyAdminTransactions,
  mockAdminTransactions,
  transactionId,
  transactionOrderNumber as num,
  type AdminTransactionDto,
  type AdminTransactionsMock,
} from '../shared/adminTransactions'
import { contrastRatio } from '../shared/contrast'
import { mockStaffMe } from '../shared/products'
import { DEMO, mockAuth } from '../shared/session'

// Staff Transactions against the three admin transaction endpoints, which tests/shared/adminTransactions.ts answers (nothing leaves the machine).
// Auth and /users/me are mocked and each test signs in through the real form with DEMO, a non-simulated account, so the page reads the real API.
// The list is a table from the card's @4xl (about 1100px of viewport with the sidebar) and cards below it; rows are found by their order number button.

// A slow machine can take longer than the default 5s to draw a drawer or finish a debounce.
const expect = baseExpect.configure({ timeout: 10_000 })

const PATH = '/staff/transactions'
const TABLE = { width: 1920, height: 1080 }
const PHONE = { width: 375, height: 700 }

async function setup(page: Page, transactions: AdminTransactionDto[] = []): Promise<AdminTransactionsMock> {
  await mockAuth(page)
  await mockStaffMe(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  return mockAdminTransactions(page, transactions)
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
  await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible({ timeout: 20_000 })
}

// On a card the button also holds the customer's name, so it is found by the order number it starts with.
const orderButton = (page: Page, n: number) => page.getByRole('button', { name: new RegExp('^' + num(n)) })
const rowOf = (page: Page, n: number) => page.getByRole('row').or(page.getByRole('listitem')).filter({ hasText: num(n) })
const drawerOf = (page: Page, n: number) => page.getByRole('dialog', { name: num(n), exact: true })
const toast = (page: Page, text: string) => page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: text })
const alertAbout = (page: Page, what: string) => page.getByRole('alert').filter({ hasText: `We couldn't load ${what}.` })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const totals = (page: Page) => page.getByLabel('Totals across all transactions')
const exportButton = (page: Page) => page.getByRole('button', { name: /^Export Excel$|^Exporting/ })
const query = (api: AdminTransactionsMock) => Object.fromEntries(api.lists.at(-1)!)

/** Opens the drawer of payment n and waits for its details (the Payment heading is part of them). */
async function openDrawer(page: Page, n: number) {
  await orderButton(page, n).click()
  const drawer = drawerOf(page, n)
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('heading', { name: 'Payment', exact: true })).toBeVisible()
  return drawer
}

/** Below the card's @4xl the filters sit under a "Filters" summary. */
async function showFilters(page: Page) {
  const status = page.getByRole('combobox', { name: 'Status', exact: true })
  if (await status.isVisible()) return
  await page.getByText(/^Filters \(\d+\)$/).click()
  await expect(status).toBeVisible()
}

async function pick(page: Page, label: string, option: string) {
  await showFilters(page)
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('listbox', { name: label, exact: true }).getByRole('option', { name: option, exact: true }).click()
}

/** A mixed set of five payments, newest = highest number. */
const mixed = () => [
  adminTransaction(1, { status: 'REFUNDED', paymentMethod: 'PAYMAYA', provider: 'xendit', customer: null }),
  adminTransaction(2),
  adminTransaction(3, { status: 'FAILED', paymentMethod: 'CARD', fee: null, netAmount: null }),
  adminTransaction(4, { status: 'PENDING' }),
  adminTransaction(5),
]

test.describe('list', () => {
  test('draws a row per payment: order number, customer, method, status, provider and a right-aligned amount', async ({ page }) => {
    const api = await setup(page, mixed())
    await page.setViewportSize(TABLE)
    await open(page)

    await expect(orderButton(page, 5)).toBeVisible()
    expect(query(api)).toEqual({ page: '1', limit: '25', sortBy: 'createdAt', sortOrder: 'desc' })
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveText(['Order', 'Customer', 'Method', 'Status', 'Date and time', 'Provider', 'Amount'])
    await expect(page.getByText('Sample data')).toHaveCount(0)

    const removed = rowOf(page, 1)
    await expect(removed.getByRole('cell').nth(1)).toHaveText('Customer account removed')
    await expect(removed.getByRole('cell').nth(2)).toHaveText('Maya')
    await expect(removed.getByRole('cell').nth(3)).toHaveText('Refunded')
    await expect(removed.getByRole('cell').nth(5)).toHaveText('Xendit')
    await expect(removed.getByRole('cell').nth(6)).toHaveText('₱1,100.00')

    const normal = rowOf(page, 2)
    await expect(normal.getByRole('cell').nth(1)).toHaveText('Customer 2')
    await expect(normal.getByRole('cell').nth(2)).toHaveText('GCash')
    await expect(normal.getByRole('cell').nth(3)).toHaveText('Paid')
    await expect(normal.getByRole('cell').nth(5)).toHaveText('PayMongo')
    await expect(normal.getByRole('cell').nth(6)).toHaveText('₱1,200.00')
    await expect(normal.getByRole('cell').nth(6)).toHaveCSS('text-align', 'right')
    await expect(rowOf(page, 3).getByRole('cell').nth(2)).toHaveText('Card')
    await expect(rowOf(page, 3).getByRole('cell').nth(3)).toHaveText('Payment failed')
    await expect(rowOf(page, 4).getByRole('cell').nth(3)).toHaveText('Payment pending')

    const orders = await page.getByRole('button', { name: /^SHF-/ }).evaluateAll((buttons) => buttons.map((b) => b.querySelector('span')!.textContent))
    expect(orders).toEqual([5, 4, 3, 2, 1].map(num))
  })

  test('on a phone the same payments are cards', async ({ page }) => {
    await setup(page, mixed())
    await page.setViewportSize(PHONE)
    await open(page)

    await expect(page.getByRole('table')).toHaveCount(0)
    const list = page.getByRole('list', { name: 'Transactions' })
    await expect(list.getByRole('listitem')).toHaveCount(5)
    const removed = rowOf(page, 1)
    await expect(removed).toContainText('Customer account removed')
    await expect(removed).toContainText('Refunded')
    await expect(removed).toContainText('Maya')
    await expect(removed).toContainText('₱1,100.00')
  })

  test('the totals strip counts every payment and ignores the filters', async ({ page }) => {
    const api = await setup(page, mixed())
    await open(page)

    const strip = totals(page)
    await expect(strip).toBeVisible()
    await expect(strip).toContainText('Transactions')
    await expect(strip).toContainText('5')
    await expect(strip).toContainText('1 pending · 1 failed')
    await expect(strip).toContainText('₱2,700') // two paid payments: 1,200 + 1,500
    await expect(strip).toContainText('2 paid · 1 refunded')
    await expect(strip).toContainText('₱50') // fees of the paid ones
    await expect(strip).toContainText('₱2,650')
    expect(api.metrics).toBe(1)

    await pick(page, 'Status', 'Refunded')
    await expect(page).toHaveURL(/status=REFUNDED/)
    await expect(orderButton(page, 1)).toBeVisible()
    await expect(orderButton(page, 2)).toHaveCount(0)
    await expect(strip).toContainText('5')
    await expect(strip).toContainText('2 paid · 1 refunded')
    expect(api.metrics).toBe(1)
  })
})

test.describe('URL and request', () => {
  test('the URL becomes the request, with exactly the keys the API knows', async ({ page }) => {
    const api = await setup(page, manyAdminTransactions(3))
    await open(page, '?status=PAID&method=GCASH&provider=paymongo&range=month&sort=total&dir=asc&per=10&page=2&q=pay_ext')

    await expect.poll(() => api.lists.length).toBeGreaterThan(0)
    const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).slice(0, 10)
    expect(Object.fromEntries(api.lists[0])).toEqual({
      page: '2',
      limit: '10',
      status: 'PAID',
      paymentMethod: 'GCASH',
      provider: 'paymongo',
      startDate: `${today.slice(0, 7)}-01T00:00:00+08:00`,
      endDate: `${today}T23:59:59.999+08:00`,
      search: 'pay_ext',
      sortBy: 'amount',
      sortOrder: 'asc',
    })
  })

  test('a hand-edited URL never reaches the API: unknown keys and values fall back to the defaults', async ({ page }) => {
    const api = await setup(page, manyAdminTransactions(3))
    await open(page, '?status=BOGUS&method=bitcoin&provider=acme&foo=bar&orderId=nope&sort=name&per=7&page=-3&range=custom&from=2026-02-31&paymentMethod=GCASH&sortBy=amount')

    await expect(orderButton(page, 3)).toBeVisible()
    for (const list of api.lists) {
      expect(Object.fromEntries(list)).toEqual({ page: '1', limit: '25', sortBy: 'createdAt', sortOrder: 'desc' })
    }
  })

  test('picking filters writes the URL and the request, and Clear filters undoes them', async ({ page }) => {
    const api = await setup(page, mixed())
    await open(page)
    await expect(orderButton(page, 5)).toBeVisible()

    await pick(page, 'Status', 'Paid')
    await expect(page).toHaveURL(/status=PAID/)
    await expect.poll(() => api.lists.at(-1)!.get('status')).toBe('PAID')
    await expect(orderButton(page, 3)).toHaveCount(0)
    await expect(orderButton(page, 5)).toBeVisible()

    await pick(page, 'Payment method', 'GCash')
    await expect(page).toHaveURL(/method=GCASH/)
    await expect.poll(() => api.lists.at(-1)!.get('paymentMethod')).toBe('GCASH')

    await pick(page, 'Provider', 'PayMongo')
    await expect(page).toHaveURL(/provider=paymongo/)
    await expect.poll(() => api.lists.at(-1)!.get('provider')).toBe('paymongo')

    await pick(page, 'Rows per page', '10 per page')
    await expect(page).toHaveURL(/per=10/)
    await expect.poll(() => api.lists.at(-1)!.get('limit')).toBe('10')

    await pick(page, 'Date range', 'Last 7 days')
    await expect(page).toHaveURL(/range=week/)
    await expect.poll(() => api.lists.at(-1)!.has('startDate') && api.lists.at(-1)!.has('endDate')).toBe(true)
    // The mock's payments are all dated 1 Oct 2026, so a week ending today holds none of them or all of them; either way the keys are the only claim here.
    expect(Object.keys(query(api)).sort()).toEqual(['endDate', 'limit', 'page', 'paymentMethod', 'provider', 'sortBy', 'sortOrder', 'startDate', 'status'])

    await showFilters(page)
    await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click()
    await expect(page).not.toHaveURL(/status=|method=|provider=|range=/)
    await expect.poll(() => Object.keys(query(api)).sort()).toEqual(['limit', 'page', 'sortBy', 'sortOrder'])
    await expect(orderButton(page, 3)).toBeVisible()
  })

  test('typing in the search box sends one request after the pause and writes ?q=', async ({ page }) => {
    const api = await setup(page, mixed())
    await open(page)
    await expect(orderButton(page, 5)).toBeVisible()
    const before = api.lists.length

    await page.getByLabel('Search transactions by order, customer, email or reference').pressSequentially('pay_ext_3')

    await expect.poll(() => api.lists.length).toBe(before + 1)
    expect(query(api).search).toBe('pay_ext_3')
    expect(api.lists.at(-1)!.has('orderId')).toBe(false)
    await expect(page).toHaveURL(/[?&]q=pay_ext_3/)
    await expect(orderButton(page, 3)).toBeVisible()
    await expect(orderButton(page, 5)).toHaveCount(0)
    expect(api.lists).toHaveLength(before + 1)

    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(page).not.toHaveURL(/q=/)
    await expect(orderButton(page, 5)).toBeVisible()
  })

  test('a pasted order UUID is sent as orderId, not as a search', async ({ page }) => {
    const api = await setup(page, mixed())
    await open(page)
    await expect(orderButton(page, 5)).toBeVisible()

    await page.getByLabel('Search transactions by order, customer, email or reference').fill(adminOrderId(2))

    await expect.poll(() => query(api).orderId).toBe(adminOrderId(2))
    expect(query(api).search).toBeUndefined()
    await expect(page).toHaveURL(new RegExp(`q=${adminOrderId(2)}`))
    await expect(orderButton(page, 2)).toBeVisible()
    await expect(orderButton(page, 5)).toHaveCount(0)
  })

  test('sorting by the Amount and Date headers round-trips through the URL and the request', async ({ page }) => {
    const api = await setup(page, mixed())
    await page.setViewportSize(TABLE)
    await open(page)
    await expect(orderButton(page, 5)).toBeVisible()
    const amount = page.getByRole('columnheader', { name: 'Amount' })
    const date = page.getByRole('columnheader', { name: 'Date and time' })
    await expect(date).toHaveAttribute('aria-sort', 'descending')

    await amount.getByRole('button').click()
    await expect(page).toHaveURL(/sort=total/)
    await expect(amount).toHaveAttribute('aria-sort', 'descending')
    await expect.poll(() => [query(api).sortBy, query(api).sortOrder]).toEqual(['amount', 'desc'])

    await amount.getByRole('button').click()
    await expect(amount).toHaveAttribute('aria-sort', 'ascending')
    await expect.poll(() => [query(api).sortBy, query(api).sortOrder]).toEqual(['amount', 'asc'])
    const orders = await page.getByRole('button', { name: /^SHF-/ }).evaluateAll((buttons) => buttons.map((b) => b.querySelector('span')!.textContent))
    expect(orders).toEqual([1, 2, 3, 4, 5].map(num))

    await date.getByRole('button').click()
    await expect.poll(() => [query(api).sortBy, query(api).sortOrder]).toEqual(['createdAt', 'desc'])
  })

  test('on a phone the Sort by select does the same', async ({ page }) => {
    const api = await setup(page, mixed())
    await page.setViewportSize(PHONE)
    await open(page)
    await expect(orderButton(page, 5)).toBeVisible()

    await page.getByRole('combobox', { name: 'Sort by', exact: true }).click()
    await page.getByRole('listbox', { name: 'Sort by', exact: true }).getByRole('option', { name: 'Amount: low to high', exact: true }).click()

    await expect(page).toHaveURL(/sort=total/)
    await expect(page).toHaveURL(/dir=asc/)
    await expect.poll(() => [query(api).sortBy, query(api).sortOrder]).toEqual(['amount', 'asc'])
  })

  test('paging writes ?page=, resets to page 1 when a filter changes, and Back returns', async ({ page }) => {
    const api = await setup(page, manyAdminTransactions(30))
    await open(page, '?per=10')

    await expect(page.getByText('Displaying 1–10 of 30')).toBeVisible()
    const pager = page.getByRole('navigation', { name: 'Pagination' })
    await expect(pager.getByRole('button', { name: 'Prev' })).toBeDisabled()

    await pager.getByRole('button', { name: 'Next' }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByText('Displaying 11–20 of 30')).toBeVisible()
    expect(query(api)).toMatchObject({ page: '2', limit: '10' })
    await expect(orderButton(page, 20)).toBeVisible()

    await pick(page, 'Status', 'Paid')
    await expect(page).not.toHaveURL(/page=/)
    await expect.poll(() => query(api).page).toBe('1')

    await page.goBack()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByText('Displaying 11–20 of 30')).toBeVisible()
  })
})

test.describe('drawer', () => {
  test('a row opens the drawer with the payment, the order and a payload that starts collapsed', async ({ page }) => {
    const api = await setup(page, mixed())
    await open(page)
    const drawer = await openDrawer(page, 2)

    expect(api.details).toEqual([transactionId(2)])
    await expect(drawer.getByText('Customer 2', { exact: true })).toBeVisible()
    const field = (label: string) => drawer.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]')
    await expect(field('Provider')).toHaveText('PayMongo')
    await expect(field('Method')).toHaveText('GCash')
    await expect(field('Reference')).toContainText('pay_ext_2')
    await expect(field('Amount')).toHaveText('₱1,200.00')
    await expect(field('Fee')).toHaveText('₱25.00')
    await expect(field('Net')).toHaveText('₱1,175.00')
    await expect(field('Order')).toContainText(num(2))
    await expect(field('Order total')).toHaveText('₱1,200.00')
    await expect(field('Email')).toHaveText('customer2@example.com')

    const link = drawer.getByRole('link', { name: 'Open in Online orders' })
    await expect(link).toHaveAttribute('href', `/staff/online-orders?q=${encodeURIComponent(num(2))}`)

    const payload = drawer.getByText('Gateway payload (JSON)')
    await expect(payload).toBeVisible()
    await expect(drawer.locator('pre')).toBeHidden()
    // The items and the Invoice come from the order behind the payment.
    await expect(drawer.getByRole('heading', { name: 'Items' })).toBeVisible()
    await expect(drawer.getByText('Heritage Polo')).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Invoice' })).toBeEnabled()
    expect(api.orders).toEqual([adminOrderId(2)])
  })

  test('the Invoice is built from the order behind the payment, with the real method and a placeholder seller', async ({ page }) => {
    await setup(page, mixed())
    await open(page)
    const drawer = await openDrawer(page, 2)
    await drawer.getByRole('button', { name: 'Invoice' }).click()
    const preview = page.getByRole('dialog', { name: `Invoice ${num(2)}`, exact: true })
    const sheet = preview.getByRole('article')
    await expect(sheet.getByText('Heritage Polo')).toBeVisible()
    await expect(sheet.getByText('Delivery fee')).toBeVisible()
    await expect(sheet.getByText('GCash', { exact: true })).toBeVisible()
    await expect(sheet.getByText('Sample merchant profile')).toBeVisible()
    await expect(preview.getByRole('button', { name: 'Download PDF' })).toBeEnabled()
  })

  test('a fee or net the gateway has not reported reads "Not reported"', async ({ page }) => {
    await setup(page, mixed())
    await open(page)
    const drawer = await openDrawer(page, 3)

    await expect(drawer.getByText('Not reported')).toHaveCount(2)
    await expect(drawer.locator('dt', { hasText: /^Fee$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText('Not reported')
    await expect(drawer.locator('dt', { hasText: /^Net$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText('Not reported')
  })

  test('a removed customer reads "Customer account removed" and has no email', async ({ page }) => {
    await setup(page, mixed())
    await open(page)
    const drawer = await openDrawer(page, 1)

    await expect(drawer.getByText('Customer account removed')).toBeVisible()
    await expect(drawer.getByText('No email on record')).toBeVisible()
  })

  test('expanding the payload shows redacted JSON, and markup in it is text, never an element', async ({ page }) => {
    const dialogs: string[] = []
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message())
      await dialog.dismiss()
    })
    await setup(page, [
      adminTransaction(1, {
        rawPayload: {
          id: 'pay_ext_1',
          attributes: {
            client_key: 'ck_live_SECRET_VALUE',
            nested: { webhook_secret: 'whsec_SECRET_VALUE', list: [{ api_token: 'tok_SECRET_VALUE' }] },
            description: '<img src=x onerror=alert(1)>',
          },
        },
      }),
    ])
    await open(page)
    const drawer = await openDrawer(page, 1)

    await drawer.getByText('Gateway payload (JSON)').click()
    const json = drawer.locator('pre')
    await expect(json).toBeVisible()
    await expect(json).toContainText('"client_key": "[hidden]"')
    await expect(json).toContainText('"webhook_secret": "[hidden]"')
    await expect(json).toContainText('"api_token": "[hidden]"')
    await expect(json).toContainText('"id": "pay_ext_1"')
    await expect(json).not.toContainText('SECRET_VALUE')
    await expect(json).toContainText('<img src=x onerror=alert(1)>')
    await expect(drawer.locator('img')).toHaveCount(0)
    await expect(page.locator('img[src="x"]')).toHaveCount(0)
    expect(dialogs).toEqual([])
  })

  test('a payment with no payload says so', async ({ page }) => {
    await setup(page, [adminTransaction(1, { rawPayload: null })])
    await open(page)
    const drawer = await openDrawer(page, 1)

    await drawer.getByText('Gateway payload (JSON)').click()
    await expect(drawer.getByText('No payload recorded')).toBeVisible()
  })

  test('a payment deleted meanwhile reads "no longer exists", and Retry asks again', async ({ page }) => {
    const api = await setup(page, mixed())
    await open(page)
    api.on.detail = () => fail(404, 'Transaction not found')

    await orderButton(page, 2).click()
    const drawer = drawerOf(page, 2)
    const gone = drawer.getByRole('alert').filter({ hasText: 'This transaction no longer exists.' })
    await expect(gone).toBeVisible()
    // The header from the list row stays.
    await expect(drawer.getByText('₱1,200.00').first()).toBeVisible()

    api.on.detail = undefined
    await gone.getByRole('button', { name: 'Retry' }).click()
    await expect(drawer.getByRole('heading', { name: 'Payment', exact: true })).toBeVisible()
    expect(api.details).toHaveLength(2)
  })

  test('any other failure says the details could not load, with Retry', async ({ page }) => {
    const api = await setup(page, mixed())
    await open(page)
    api.on.detail = () => fail(500)

    await orderButton(page, 2).click()
    const drawer = drawerOf(page, 2)
    const problem = drawer.getByRole('alert').filter({ hasText: "We couldn't load the payment details." })
    await expect(problem).toBeVisible()
    await expect(drawer.getByText('This transaction no longer exists.')).toHaveCount(0)

    api.on.detail = undefined
    await problem.getByRole('button', { name: 'Retry' }).click()
    await expect(drawer.getByRole('heading', { name: 'Payment', exact: true })).toBeVisible()
  })

  test('shows a loading status until the detail arrives', async ({ page }) => {
    const api = await setup(page, mixed())
    await open(page)
    const release = api.hold('detail')

    await orderButton(page, 2).click()
    const drawer = drawerOf(page, 2)
    await expect(drawer.getByRole('status', { name: 'Loading payment details' })).toBeVisible()
    release()
    await expect(drawer.getByRole('heading', { name: 'Payment', exact: true })).toBeVisible()
  })
})

test.describe('export', () => {
  /** The downloaded workbook's Transactions sheet. */
  async function readSheet(download: Download) {
    // Playwright's loader can't link ExcelJS's Node build (unzipper), so read with the browser bundle.
    const ExcelJS: typeof import('exceljs') = createRequire(import.meta.url)('exceljs/dist/exceljs.min.js')
    const book = new ExcelJS.Workbook()
    await book.xlsx.load((await readFile((await download.path())!)) as never)
    return book.getWorksheet('Transactions')!
  }

  test('downloads an Excel file of every matching payment with the 11 columns', async ({ page }) => {
    const api = await setup(page, mixed())
    await page.setViewportSize(TABLE)
    await open(page)
    await showFilters(page)
    await expect(orderButton(page, 5)).toBeVisible()
    const before = api.lists.length

    const [download] = await Promise.all([page.waitForEvent('download'), exportButton(page).click()])

    expect(download.suggestedFilename()).toMatch(/^transactions-\d{4}-\d{2}-\d{2}\.xlsx$/)
    const sheet = await readSheet(download)
    expect(sheet.getCell('A1').value).toBe('KRAL Transactions')
    expect(sheet.getCell('B2').value).toBe('Sam Staff (demo@silhoufit.com)')
    expect(sheet.getCell('B5').value).toBe(5)
    const header = (sheet.getRow(7).values as string[]).slice(1)
    expect(header).toEqual(['Order No.', 'Date (Manila)', 'Customer', 'Email', 'Method', 'Provider', 'Reference', 'Status', 'Amount (PHP)', 'Fee (PHP)', 'Net (PHP)'])
    const rows = Array.from({ length: 5 }, (_, i) => Array.from({ length: 11 }, (_, c) => sheet.getRow(8 + i).getCell(c + 1).value))
    const byOrder = new Map(rows.map((row) => [row[0], row]))
    expect(byOrder.get(num(1))!.slice(2)).toEqual(['Customer account removed', '', 'Maya', 'Xendit', 'pay_ext_1', 'Refunded', 1100, 25, 1075])
    expect(byOrder.get(num(3))!.slice(7)).toEqual(['Payment failed', 1300, null, null])
    expect(byOrder.get(num(2))!.slice(2, 4)).toEqual(['Customer 2', 'customer2@example.com'])
    expect(sheet.getCell('A13').value).toBe('Total')
    expect(sheet.getCell('A14').value).toBe('Count: 5')
    // The KRAL wordmark was drawn to a PNG in the real browser and set as the background picture.
    expect(sheet.getBackgroundImageId()).toBeDefined()

    // Pages of 100, one request at a time, with the same filters and sort as the list.
    const exportRequests = api.lists.slice(before)
    expect(exportRequests).toHaveLength(1)
    expect(Object.fromEntries(exportRequests[0])).toEqual({ page: '1', limit: '100', sortBy: 'createdAt', sortOrder: 'desc' })
    await expect(toast(page, '5 transactions exported')).toBeVisible()
  })

  test('exports only what the filters match', async ({ page }) => {
    const api = await setup(page, mixed())
    await open(page, '?status=PAID')
    await expect(orderButton(page, 5)).toBeVisible()
    await showFilters(page)

    const [download] = await Promise.all([page.waitForEvent('download'), exportButton(page).click()])
    const sheet = await readSheet(download)

    expect(sheet.getCell('B5').value).toBe(2)
    expect(sheet.getCell('B4').value).toBe('Status Paid')
    expect(query(api)).toMatchObject({ status: 'PAID', limit: '100' })
    await expect(toast(page, '2 transactions exported')).toBeVisible()
  })

  test('is off, with the reason as its tooltip, when more than 1,000 payments match', async ({ page }) => {
    const api = await setup(page, mixed())
    api.reportTotal = 1001
    await open(page)
    await expect(orderButton(page, 5)).toBeVisible()
    await showFilters(page)
    const button = exportButton(page)
    const before = api.lists.length

    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await button.hover()
    await expect(page.getByRole('tooltip')).toHaveText('Narrow the filters to 1,000 transactions or fewer to export')
    await button.click({ force: true })
    expect(api.lists).toHaveLength(before)
    await expect(button).toHaveText('Export Excel')
  })

  test('is off when there is nothing to export', async ({ page }) => {
    await setup(page, [])
    await open(page)
    await showFilters(page)
    const button = exportButton(page)

    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await button.hover()
    await expect(page.getByRole('tooltip')).toHaveText('There are no transactions to export')
  })

  test('a failed export says no file was made and offers Retry', async ({ page }) => {
    const api = await setup(page, mixed())
    await open(page)
    await expect(orderButton(page, 5)).toBeVisible()

    await showFilters(page)
    api.on.list = (q) => (q.get('limit') === '100' ? fail(500) : undefined)
    await exportButton(page).click()
    const failed = toast(page, "Couldn't export the transactions.")
    await expect(failed).toBeVisible()
    await expect(failed).toContainText('no file was made')

    api.on.list = undefined
    const [download] = await Promise.all([page.waitForEvent('download'), failed.getByRole('button', { name: 'Retry' }).click()])
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/)
  })
})

test.describe('errors', () => {
  test('a 500 on the list shows the error with Retry, and Retry loads the rows', async ({ page }) => {
    const api = await setup(page, mixed())
    api.on.list = () => fail(500)
    await open(page)

    const problem = alertAbout(page, 'the transactions')
    await expect(problem).toBeVisible()
    await expect(problem).toContainText('Something went wrong on our side. Try again in a moment.')
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toHaveCount(0)

    api.on.list = undefined
    await problem.getByRole('button', { name: 'Retry' }).click()
    await expect(orderButton(page, 5)).toBeVisible()
    await expect(problem).toHaveCount(0)
  })

  test('a 429 says the servers are limiting requests and holds Retry for a moment', async ({ page }) => {
    const api = await setup(page, mixed())
    api.on.list = () => fail(429, 'Too Many Requests')
    await open(page)

    const problem = alertAbout(page, 'the transactions')
    await expect(problem).toContainText('Our servers are limiting requests right now. Wait a minute, then try again.')
    await expect(problem.getByRole('button', { name: /^Retry in \d+s$/ })).toBeDisabled()
  })

  test('a dropped connection says so', async ({ page }) => {
    const api = await setup(page, mixed())
    api.on.list = () => 'abort'
    await open(page)

    await expect(alertAbout(page, 'the transactions')).toContainText('The connection dropped before we got a response.')
  })

  test('a metrics failure leaves the list working and offers its own Retry', async ({ page }) => {
    const api = await setup(page, mixed())
    api.on.metrics = () => fail(500)
    await open(page)

    await expect(orderButton(page, 5)).toBeVisible()
    const problem = alertAbout(page, 'the totals')
    await expect(problem).toBeVisible()
    await expect(alertAbout(page, 'the transactions')).toHaveCount(0)
    await showFilters(page)
    await expect(exportButton(page)).toHaveAttribute('aria-disabled', 'false')

    api.on.metrics = undefined
    await problem.getByRole('button', { name: 'Retry' }).click()
    await expect(totals(page)).toBeVisible()
    await expect(problem).toHaveCount(0)
  })

  test('a failed refetch keeps the old rows and says they are from before', async ({ page }) => {
    const api = await setup(page, mixed())
    await open(page)
    await expect(orderButton(page, 5)).toBeVisible()

    api.on.list = () => fail(500)
    await pick(page, 'Status', 'Paid')

    await expect(alertAbout(page, 'the latest transactions')).toBeVisible()
    await expect(page.getByText('The list below is from before your last change.')).toBeVisible()
    await expect(orderButton(page, 3)).toBeVisible()
  })
})

test.describe('empty states', () => {
  test('no payments yet: says so, with no totals strip and no Clear filters', async ({ page }) => {
    await setup(page, [])
    await open(page)

    await expect(page.getByText('No transactions yet')).toBeVisible()
    await expect(page.getByText('Payments show here once customers pay at checkout.')).toBeVisible()
    await expect(totals(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0)
  })

  test('nothing matches: says so, and Clear filters brings the list back', async ({ page }) => {
    await setup(page, mixed())
    await open(page, '?q=zzzz')

    await expect(page.getByText('No transactions match')).toBeVisible()
    await expect(page.getByText('Check the spelling, or clear the search and filters and try again.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()

    await expect(page).not.toHaveURL(/q=/)
    await expect(page.getByLabel('Search transactions by order, customer, email or reference')).toHaveValue('')
    await expect(orderButton(page, 5)).toBeVisible()
  })

  test('a page past the end offers the first page', async ({ page }) => {
    await setup(page, mixed())
    await open(page, '?page=9')

    await expect(page.getByText('There are no transactions on page 9.')).toBeVisible()
    await page.getByRole('button', { name: 'Go to the first page' }).click()
    await expect(page).not.toHaveURL(/page=/)
    await expect(orderButton(page, 5)).toBeVisible()
  })

  test('shows a loading status while the list loads', async ({ page }) => {
    const api = await setup(page, mixed())
    const release = api.hold('list')
    await open(page)

    await expect(page.getByRole('status').filter({ hasText: 'Loading transactions' })).toBeVisible()
    release()
    await expect(orderButton(page, 5)).toBeVisible()
  })
})

test.describe('keyboard', () => {
  test('Tab reaches a row, Enter opens the drawer, Escape closes it and focus returns to the row', async ({ page }) => {
    await setup(page, mixed())
    await page.setViewportSize(TABLE)
    await open(page)
    const first = orderButton(page, 5)
    await expect(first).toBeVisible()

    await page.getByLabel('Search transactions by order, customer, email or reference').focus()
    let reached = false
    for (let presses = 0; presses < 30 && !reached; presses++) {
      await page.keyboard.press('Tab')
      reached = await first.evaluate((el) => el === document.activeElement)
    }
    expect(reached).toBe(true)

    await page.keyboard.press('Enter')
    const drawer = drawerOf(page, 5)
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('heading', { name: 'Payment', exact: true })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(first).toBeFocused()
  })

  test('the payload summary opens with Enter and Space', async ({ page }) => {
    await setup(page, mixed())
    await open(page)
    const drawer = await openDrawer(page, 2)
    const summary = drawer.getByText('Gateway payload (JSON)')

    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(drawer.locator('pre')).toBeVisible()
    await page.keyboard.press('Space')
    await expect(drawer.locator('pre')).toBeHidden()
  })
})

/** Long values that must wrap or truncate rather than push the page wider. */
const LONG_NAME = 'Maria Cristina Dela Cruz-Hernandez de Villanueva y Montenegro'
const LONG_REFERENCE = `pay_${'x'.repeat(90)}`
const longRows = () =>
  manyAdminTransactions(12, (n) => (n % 2 ? { customer: adminCustomer({ fullName: LONG_NAME, email: `${'long'.repeat(15)}@example.com` }), externalPaymentId: LONG_REFERENCE } : {})).map((t) => ({
    ...t,
    rawPayload: { id: t.externalPaymentId, note: 'y'.repeat(300), attributes: { description: `${'z'.repeat(200)} ${'w'.repeat(200)}` } },
  }))

/** Controls (by selector) that are not at least 44px both ways. */
const tooSmall = (scope: Locator) =>
  scope.evaluateAll((els) =>
    els
      .filter((el) => {
        const box = el.getBoundingClientRect()
        return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[aria-hidden="true"]')
      })
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(({ el, box }) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}" ${Math.round(box.width)}x${Math.round(box.height)}`),
  )

/** Visible text under `root` set smaller than 16px (code blocks and screen-reader text aside). */
const smallText = (root: Locator) =>
  root.evaluate((node) => {
    const found: string[] = []
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const el = text.parentElement
      if (!el || !text.textContent?.trim() || el.closest('.sr-only, [aria-hidden="true"], pre')) continue
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < 16) found.push(`${size}px "${text.textContent.trim().slice(0, 40)}"`)
    }
    return [...new Set(found)]
  })

test.describe('layout', () => {
  const WIDTHS = [320, 375, 768, 1280]

  async function openLong(page: Page, width: number) {
    await setup(page, longRows())
    await page.setViewportSize({ width, height: 800 })
    await open(page)
    await expect(orderButton(page, 12)).toBeVisible()
  }

  /** Below the card's @4xl the filters are folded away; unfold them so their controls are measured too. */
  async function unfold(page: Page) {
    const summary = page.getByText(/^Filters \(\d+\)$/)
    if (await summary.isVisible()) await summary.click()
  }

  for (const width of WIDTHS) {
    test(`at ${width}px: no horizontal scroll, also with the drawer and the payload open`, async ({ page }) => {
      await openLong(page, width)
      expect(await overflow(page)).toBe(0)
      await unfold(page)
      expect(await overflow(page)).toBe(0)

      const drawer = await openDrawer(page, 11)
      await drawer.getByText('Gateway payload (JSON)').click()
      await expect(drawer.locator('pre')).toBeVisible()
      expect(await overflow(page)).toBe(0)
      expect(await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
      expect(await drawer.locator('[role="region"]').first().evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
    })

    test(`at ${width}px: every control on the page and in the drawer is at least 44px`, async ({ page, hasTouch }) => {
      // Controls grow to 44px for a touch screen (pointer-coarse); a mouse gets 36px ones, by design.
      test.skip(!hasTouch, 'touch targets only apply to touch screens')
      await openLong(page, width)
      await unfold(page)
      expect(await tooSmall(page.locator('main :is(button, a[href], input, [role="combobox"], summary)').filter({ visible: true }))).toEqual([])

      const drawer = await openDrawer(page, 11)
      await drawer.getByText('Gateway payload (JSON)').click()
      expect(await tooSmall(drawer.locator('button, a[href], summary').filter({ visible: true }))).toEqual([])
    })
  }

  for (const width of WIDTHS.filter((w) => w < 640)) {
    test(`at ${width}px: text on the page and in the drawer is at least 16px`, async ({ page }) => {
      // PRODUCT BUG, known: the list, totals, filters, pager and status pill are set at 12-14px on phones. Expected to fail until they are 16px; remove this line then.
      test.fail(true, 'phone text under 16px: totals, filters, rows, pager, status pill')
      await openLong(page, width)
      await unfold(page)
      expect.soft(await smallText(page.locator('main')), 'page').toEqual([])

      const drawer = await openDrawer(page, 11)
      expect.soft(await smallText(drawer), 'drawer').toEqual([])
    })
  }
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode`, () => {
    /** The text colour of `locator` and the colour it actually sits on, both as rgb(): the background is found by walking up through any translucent layers. */
    async function colours(locator: Locator) {
      return locator.first().evaluate((el) => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d', { willReadFrequently: true })!
        const parse = (css: string): [number, number, number, number] => {
          context.clearRect(0, 0, 1, 1)
          context.fillStyle = '#000'
          context.fillStyle = css
          context.fillRect(0, 0, 1, 1)
          const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
          return [r, g, b, a / 255]
        }
        const over = (top: number[], below: number[]) => {
          const a = top[3]
          return [0, 1, 2].map((i) => top[i] * a + below[i] * (1 - a))
        }
        const layers: number[][] = []
        for (let node: Element | null = el; node; node = node.parentElement) {
          const layer = parse(getComputedStyle(node).backgroundColor)
          if (layer[3] > 0) layers.push(layer)
          if (layer[3] === 1) break
        }
        let bg = [255, 255, 255]
        for (const layer of layers.reverse()) bg = over(layer, bg)
        const text = parse(getComputedStyle(el).color)
        const fg = over(text, bg)
        const rgb = (c: number[]) => `rgb(${c.map(Math.round).join(', ')})`
        return { fg: rgb(fg), bg: rgb(bg) }
      })
    }
    async function expectReadable(locator: Locator, what: string) {
      const { fg, bg } = await colours(locator)
      expect(contrastRatio(fg, bg), `${what}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }

    test('the list, totals and drawer follow the scheme and stay readable', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await setup(page, mixed())
      await page.setViewportSize(TABLE)
      await open(page)

      await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /^(?!.*dark)/)
      await expect(orderButton(page, 5)).toBeVisible()
      await expect(totals(page)).toBeVisible()
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      const sum = background.match(/\d+/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b, 0)
      if (scheme === 'dark') expect(sum).toBeLessThan(384)
      else expect(sum).toBeGreaterThan(384)

      const row = rowOf(page, 1)
      await expectReadable(row.getByRole('button'), 'order number')
      await expectReadable(row.getByRole('cell').nth(1), 'customer')
      await expectReadable(row.getByRole('cell').nth(2), 'method')
      await expectReadable(row.getByRole('cell').nth(3).locator('span'), 'status pill')
      await expectReadable(row.getByRole('cell').nth(4).locator('time'), 'date')
      await expectReadable(row.getByRole('cell').nth(5), 'provider')
      await expectReadable(row.getByRole('cell').nth(6), 'amount')
      for (const status of ['Paid', 'Payment failed', 'Payment pending']) {
        await expectReadable(page.getByRole('row').getByText(status, { exact: true }).first(), `${status} pill`)
      }
      await expectReadable(page.getByRole('columnheader', { name: 'Customer' }), 'column header')
      await expectReadable(totals(page).locator('dt').first(), 'totals label')
      await expectReadable(totals(page).locator('dd').first(), 'totals value')
      await expectReadable(totals(page).locator('dd').nth(1), 'totals note')
      await expectReadable(page.getByLabel('Search transactions by order, customer, email or reference'), 'search box')
      await expectReadable(exportButton(page), 'Export Excel')

      const drawer = await openDrawer(page, 3)
      await drawer.getByText('Gateway payload (JSON)').click()
      await expectReadable(drawer.getByRole('heading', { name: 'Payment', exact: true }), 'drawer heading')
      await expectReadable(drawer.locator('dt').first(), 'drawer label')
      await expectReadable(drawer.locator('dd').first(), 'drawer value')
      await expectReadable(drawer.getByText('Not reported').first(), 'Not reported')
      await expectReadable(drawer.getByRole('link', { name: 'Open in Online orders' }), 'Online orders link')
      await expectReadable(drawer.locator('pre'), 'payload')
    })
  })
}
