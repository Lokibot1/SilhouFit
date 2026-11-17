import { expect, test, type Page } from '@playwright/test'
import { auditLog, failAudit, manyAuditLogs, mockAuditLogs, systemActor, userActor, webhookActor } from '../shared/auditLogs'

// The Activity logs page reads GET /admin/audit-logs (stubbed here) and is admin-only. Sign-in is the dev-only simulated one.
// Runs in the desktop and mobile projects.

const STAFF = { email: 'sam.reyes@silhoufit.dev', password: 'Staff@12345' }
const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const PER_PAGE = 25

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function signIn(page: Page, { email, password }: { email: string; password: string }, home: RegExp) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(home)
}

async function openPage(page: Page) {
  await signIn(page, ADMIN, /\/admin$/)
  await page.goto('/admin/activity-logs')
  await expect(page.getByRole('heading', { level: 1, name: 'Activity logs' })).toBeVisible({ timeout: 20_000 })
}

const list = (page: Page) => page.getByRole('list', { name: 'Logged actions' })
const row = (page: Page, text: string | RegExp) => list(page).getByRole('listitem').filter({ hasText: text })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function choose(page: Page, select: string, option: string) {
  await page.getByRole('combobox', { name: select }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test.describe('who did it', () => {
  test('names the actor and shows the role beside a staff member, and labels webhooks and the system by type', async ({ page }) => {
    const mock = await mockAuditLogs(page, [
      auditLog(1, { action: 'PRODUCT_UPDATED', target: { type: 'PRODUCT', id: 'p1', label: 'Staff Product' } }),
      auditLog(2, {
        action: 'PAYMENT_SUCCEEDED',
        actor: webhookActor({ id: 'cust-1', fullName: 'Anne Santos', email: 'anne.santos@example.com' }),
        target: { type: 'PAYMENT', id: 'pay1', label: 'Gateway Payment' },
      }),
      auditLog(3, { action: 'SHIPMENT_DRIVER_ASSIGNED', actor: webhookActor(), target: { type: 'SHIPMENT', id: 's1', label: 'Courier Shipment' } }),
      auditLog(4, { action: 'ORDER_CANCELLED', actor: systemActor(), target: { type: 'ORDER', id: 'o1', label: 'System Order' } }),
      auditLog(5, { action: 'PRODUCT_CREATED', actor: userActor({ role: 'admin', fullName: null, email: 'ghost@silhoufit.dev' }), target: { type: 'PRODUCT', id: 'p2', label: 'Email Only' } }),
      auditLog(6, { action: 'PRODUCT_DELETED', actor: userActor({ role: null, fullName: null, email: null }), target: { type: 'PRODUCT', id: 'p3', label: 'No Account' } }),
    ])
    await openPage(page)
    await expect(list(page).getByRole('listitem')).toHaveCount(6)

    await expect(row(page, 'Staff Product')).toContainText('Liza Cruz · Staff')
    const payment = row(page, 'Gateway Payment')
    await expect(payment).toContainText('Payment gateway')
    await expect(payment).not.toContainText('Anne Santos')
    await expect(payment).not.toContainText('anne.santos@example.com')
    await expect(row(page, 'Courier Shipment')).toContainText('Courier')
    await expect(row(page, 'Courier Shipment')).not.toContainText('Payment gateway')
    await expect(row(page, 'System Order')).toContainText('System')
    await expect(row(page, 'Email Only')).toContainText('ghost@silhoufit.dev · Admin')
    await expect(row(page, 'No Account')).toContainText('Removed account')
    expect(mock.lists).toHaveLength(1)
  })

  test('an action the page does not know still renders, in plain words', async ({ page }) => {
    await mockAuditLogs(page, [auditLog(1, { action: 'COUPON_ISSUED', target: { type: 'COUPON', id: 'c1', label: 'SAVE10' } })])
    await openPage(page)
    await expect(row(page, 'SAVE10')).toContainText('Coupon issued: SAVE10')
  })
})

test.describe('filters and search', () => {
  test('choosing an action sends action and goes back to page 1', async ({ page }) => {
    const mock = await mockAuditLogs(page, manyAuditLogs(3, (n) => ({ action: n === 2 ? 'ORDER_CANCELLED' : 'PRODUCT_UPDATED' })))
    await openPage(page)
    await expect(list(page).getByRole('listitem')).toHaveCount(3)

    await choose(page, 'Filter by action', 'Order cancelled')
    await expect(list(page).getByRole('listitem')).toHaveCount(1)
    const sent = mock.lists.at(-1)!
    expect(sent.get('action')).toBe('ORDER_CANCELLED')
    expect(sent.get('page')).toBe('1')
    expect(sent.get('limit')).toBe(String(PER_PAGE))
  })

  test('Today sends startDate as the start of today in Manila', async ({ page }) => {
    const mock = await mockAuditLogs(page, manyAuditLogs(2))
    await openPage(page)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

    await choose(page, 'Filter by date', 'Today')
    await expect.poll(() => mock.lists.at(-1)?.get('startDate')).toBe(`${today}T00:00:00+08:00`)
    await expect.poll(() => mock.lists.at(-1)?.get('page')).toBe('1')
  })

  test('typing in search sends exactly one search request after the debounce', async ({ page }) => {
    const mock = await mockAuditLogs(page, manyAuditLogs(3))
    await openPage(page)
    await expect(list(page).getByRole('listitem')).toHaveCount(3)

    await page.getByRole('textbox', { name: /Search activity logs/ }).pressSequentially('polo 2')
    await expect.poll(() => mock.lists.filter((q) => q.has('search')).length).toBeGreaterThan(0)
    await expect(list(page).getByRole('listitem')).toHaveCount(1)
    expect(mock.lists.filter((q) => q.has('search')).map((q) => q.get('search'))).toEqual(['polo 2'])
  })

  test('Reset filter clears the action', async ({ page }) => {
    const mock = await mockAuditLogs(page, manyAuditLogs(2))
    await openPage(page)
    await choose(page, 'Filter by action', 'Order cancelled')
    await expect.poll(() => mock.lists.at(-1)?.get('action')).toBe('ORDER_CANCELLED')
    await page.getByRole('button', { name: 'Reset filter' }).click()
    await expect.poll(() => mock.lists.at(-1)?.has('action')).toBe(false)
    await expect(list(page).getByRole('listitem')).toHaveCount(2)
  })
})

test.describe('paging', () => {
  test('page 2 of 60 asks for page=2 and shows 26 to 50', async ({ page }) => {
    const mock = await mockAuditLogs(page, manyAuditLogs(60))
    await openPage(page)
    await expect(page.getByText(`Displaying 1–${PER_PAGE} of 60`)).toBeVisible()

    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('Displaying 26–50 of 60')).toBeVisible()
    const sent = mock.lists.at(-1)!
    expect(sent.get('page')).toBe('2')
    expect(sent.get('limit')).toBe(String(PER_PAGE))
    await expect(list(page).getByRole('listitem')).toHaveCount(PER_PAGE)

    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('Displaying 51–60 of 60')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  })
})

test.describe('live refresh', () => {
  // The fake clock lets the 20 second poll fire at once; time still runs on its own, so sign-in is unaffected.
  test('page 1 picks up a new entry on its own', async ({ page }) => {
    await page.clock.install()
    const mock = await mockAuditLogs(page, manyAuditLogs(2))
    await openPage(page)
    await expect(row(page, 'Heritage Polo 2')).toBeVisible()
    await expect(row(page, 'Heritage Polo 3')).toHaveCount(0)

    mock.logs.push(auditLog(3))
    await page.clock.fastForward(30_000)
    await expect(row(page, 'Heritage Polo 3')).toBeVisible()
    await expect(page.getByText('Displaying 1–3 of 3')).toBeVisible()
  })

  test('a later page is not refreshed while it is being read', async ({ page }) => {
    await page.clock.install()
    const mock = await mockAuditLogs(page, manyAuditLogs(60))
    await openPage(page)
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('Displaying 26–50 of 60')).toBeVisible()

    const before = mock.lists.length
    await page.clock.fastForward(60_000)
    await expect(page.getByText('Displaying 26–50 of 60')).toBeVisible()
    expect(mock.lists.length).toBe(before)
  })

  test('a failed refresh keeps the rows on screen without an error', async ({ page }) => {
    await page.clock.install()
    const mock = await mockAuditLogs(page, manyAuditLogs(2))
    await openPage(page)
    await expect(row(page, 'Heritage Polo 2')).toBeVisible()

    const before = mock.lists.length
    mock.on.list = () => failAudit(500)
    await page.clock.fastForward(30_000)
    await expect.poll(() => mock.lists.length).toBeGreaterThan(before)
    await expect(row(page, 'Heritage Polo 2')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  })
})

test.describe('empty states', () => {
  test('no entries and no filters says there is no activity yet', async ({ page }) => {
    await mockAuditLogs(page, [])
    await openPage(page)
    await expect(page.getByText('No activity yet.')).toBeVisible()
  })

  test('a search or filter with no match says no activity matches', async ({ page }) => {
    await mockAuditLogs(page, manyAuditLogs(2))
    await openPage(page)
    await expect(list(page).getByRole('listitem')).toHaveCount(2)
    await page.getByRole('textbox', { name: /Search activity logs/ }).fill('zzz-nothing')
    await expect(page.getByText('No activity matches.')).toBeVisible()
    await expect(page.getByText('No activity yet.')).toHaveCount(0)
  })
})

test.describe('loading and errors', () => {
  test('shows a skeleton while the response is delayed', async ({ page }) => {
    const mock = await mockAuditLogs(page, manyAuditLogs(2))
    const release = mock.hold()
    await signIn(page, ADMIN, /\/admin$/)
    await page.goto('/admin/activity-logs')
    await expect(page.getByRole('status', { name: 'Loading activity logs' })).toBeVisible({ timeout: 20_000 })
    release()
    await expect(list(page).getByRole('listitem')).toHaveCount(2)
    await expect(page.getByRole('status', { name: 'Loading activity logs' })).toHaveCount(0)
  })

  test('a 500 shows the error and Retry loads the entries', async ({ page }) => {
    const mock = await mockAuditLogs(page, manyAuditLogs(2))
    let failing = true
    mock.on.list = () => (failing ? failAudit(500) : undefined)
    await openPage(page)
    await expect(page.getByRole('alert')).toContainText("We couldn't load the activity logs.")
    await expect(page.getByRole('alert')).toContainText('Something went wrong on our side')

    failing = false
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(list(page).getByRole('listitem')).toHaveCount(2)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('a 403 says the account is not allowed', async ({ page }) => {
    const mock = await mockAuditLogs(page, [])
    mock.on.list = () => failAudit(403, 'Forbidden resource')
    await openPage(page)
    await expect(page.getByRole('alert')).toContainText('Your account is not allowed to see this.')
  })

  test('a 429 says requests are limited and Retry waits', async ({ page }) => {
    const mock = await mockAuditLogs(page, [])
    mock.on.list = () => failAudit(429, 'Too many requests', { 'retry-after': '30' })
    await openPage(page)
    await expect(page.getByRole('alert')).toContainText('limiting requests')
    await expect(page.getByRole('button', { name: /^Retry in \d+s$/ })).toBeDisabled()
  })
})

test.describe('details sheet', () => {
  test('opens with the role row and closes with Escape', async ({ page }) => {
    await mockAuditLogs(page, [auditLog(1, { description: 'Price changed', target: { type: 'PRODUCT', id: 'p1', label: 'Heritage Polo' } })])
    await openPage(page)
    await page.getByRole('button', { name: 'View Product edited: Heritage Polo' }).click()
    const sheet = page.getByRole('dialog', { name: 'Log entry' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText('Role', { exact: true })).toBeVisible()
    await expect(sheet.getByText('Staff', { exact: true })).toBeVisible()
    await expect(sheet.getByText('Liza Cruz', { exact: true })).toBeVisible()
    await expect(sheet.getByText('Price changed')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
  })

  test('a system entry has no Role row', async ({ page }) => {
    await mockAuditLogs(page, [auditLog(1, { action: 'ORDER_CANCELLED', actor: systemActor(), target: { type: 'ORDER', id: 'o1', label: 'Order 1' } })])
    await openPage(page)
    await page.getByRole('button', { name: 'View Order cancelled: Order 1' }).click()
    const sheet = page.getByRole('dialog', { name: 'Log entry' })
    await expect(sheet.getByText('System', { exact: true })).toBeVisible()
    await expect(sheet.getByText('Role', { exact: true })).toHaveCount(0)
  })
})

test.describe('access and layout', () => {
  test('staff is sent back to the staff dashboard and nothing is requested', async ({ page }) => {
    const mock = await mockAuditLogs(page, manyAuditLogs(2))
    await signIn(page, STAFF, /\/staff$/)
    await page.goto('/admin/activity-logs')
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByText('That page is turned off for your role. Ask a superadmin if you need it.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Activity logs' })).toHaveCount(0)
    expect(mock.lists).toHaveLength(0)
  })

  test('has no Sample data badge', async ({ page }) => {
    await mockAuditLogs(page, manyAuditLogs(2))
    await openPage(page)
    await expect(list(page).getByRole('listitem')).toHaveCount(2)
    await expect(page.getByText('Sample data', { exact: true })).toHaveCount(0)
  })

  test('the dashboard tile reads the same labels', async ({ page }) => {
    await mockAuditLogs(page, [auditLog(1, { action: 'PAYMENT_SUCCEEDED', actor: webhookActor({ fullName: 'Anne Santos' }), target: { type: 'PAYMENT', id: 'p1', label: 'Tile Payment' } })])
    await signIn(page, ADMIN, /\/admin$/)
    const tile = page.getByRole('region', { name: 'Activity Logs' })
    await expect(tile).toContainText('Payment received: Tile Payment', { timeout: 20_000 })
    await expect(tile).toContainText('Payment gateway')
    await expect(tile).not.toContainText('Anne Santos')
    await expect(tile).toContainText('1 entry')
  })

  test('stays inside a 320px screen', async ({ page }) => {
    await mockAuditLogs(page, manyAuditLogs(3, (n) => ({ description: 'A fairly long description that has to wrap instead of pushing the page sideways ' + n })))
    await page.setViewportSize({ width: 320, height: 640 })
    await openPage(page)
    await expect(list(page).getByRole('listitem')).toHaveCount(3)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
})
