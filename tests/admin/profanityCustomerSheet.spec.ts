import { expect, test, type Page } from '@playwright/test'
import { adminOffense, manyAdminOffenses, mockAdminProfanity, type AdminProfanityMock } from '../shared/adminProfanity'
import { CORS, stubUsersApi, userRow } from './usersApiStub'

// The offenses section and the messaging block in the customer details sheet (User Management > Customers). GET /users and the rest are stubbed by usersApiStub
// (its rows carry offenseCount and the messaging fields); the block and unblock POSTs, the purchases and the offenses list are answered here.
// Sign-in is the dev-only simulated one. A superadmin reads the offense list; an admin sees the count and a note, and never calls the offenses endpoint.

const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }
const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const BLOCKED_AT = '2026-10-01T02:30:00.000Z'

const KIM = { ...userRow('customer', 'Kim', 'Tan', 31), offenseCount: 3, messagingBlockedAt: null as string | null, messagingBlockedReason: null as string | null }
const LEO = { ...userRow('customer', 'Leo', 'Uy', 32), offenseCount: 0, messagingBlockedAt: BLOCKED_AT, messagingBlockedReason: 'Repeated insults' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

interface Blocks {
  /** "block-messaging" or "unblock-messaging" with the customer id, in order. */
  calls: string[]
  bodies: unknown[]
  /** Fail the next block or unblock with this status and message. */
  next?: { status: number; message: string }
}

async function setup(page: Page, who: typeof ADMIN, offenses = manyAdminOffenses(3)): Promise<{ profanity: AdminProfanityMock; blocks: Blocks }> {
  const stub = await stubUsersApi(page, [KIM, LEO] as never)
  const profanity = await mockAdminProfanity(page, { offenses })
  const blocks: Blocks = { calls: [], bodies: [] }
  await page.route(
    (url) => url.port !== '5173' && /^\/users\/[^/]+\/(summary|orders)$/.test(url.pathname),
    (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      if (route.request().url().endsWith('/summary')) return route.fulfill({ headers: CORS, json: { userId: KIM.id, orders: { totalSpent: 0, totalOrders: 0, statusCounts: {} } } })
      return route.fulfill({ headers: CORS, json: { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0, hasNextPage: false, hasPreviousPage: false } } })
    },
  )
  await page.route(
    (url) => url.port !== '5173' && /^\/users\/[^/]+\/(block|unblock)-messaging$/.test(url.pathname),
    (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-methods': 'POST,OPTIONS' } })
      const [, , id, action] = new URL(request.url()).pathname.split('/')
      blocks.calls.push(`${action} ${id}`)
      blocks.bodies.push(request.postData() ? request.postDataJSON() : null)
      if (blocks.next) {
        const { status, message } = blocks.next
        blocks.next = undefined
        return route.fulfill({ status, headers: CORS, json: { statusCode: status, message, error: 'Conflict' } })
      }
      const row = stub.rows.find((r) => r.id === id) as typeof KIM
      const blocking = action === 'block-messaging'
      Object.assign(row, { messagingBlockedAt: blocking ? BLOCKED_AT : null, messagingBlockedReason: blocking ? (blocks.bodies.at(-1) as { reason?: string } | null)?.reason ?? null : null })
      return route.fulfill({ headers: CORS, json: row })
    },
  )
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(who.email)
  await page.getByLabel('Password', { exact: true }).fill(who.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(who === ADMIN ? /\/admin$/ : /\/superadmin$/)
  await page.goto(`${who === ADMIN ? '/admin' : '/superadmin'}/users?tab=customers`)
  return { profanity, blocks }
}

async function openSheet(page: Page, name: string) {
  await page.getByRole('button', { name: `View details of ${name}` }).filter({ visible: true }).first().click()
  const sheet = page.getByRole('dialog', { name: new RegExp(name) })
  await expect(sheet).toBeVisible()
  return sheet
}

const toast = (page: Page, text: string | RegExp) => page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: text })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('offenses column and section', () => {
  test('the Customers tab shows each customer\'s server offense count', async ({ page }) => {
    await setup(page, ADMIN)
    await expect(page.getByRole('button', { name: 'View details of Kim Tan' }).filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Offenses' }).or(page.getByText('Offenses:').first())).toBeVisible()
    const kim = page.getByRole('row').or(page.getByRole('listitem')).filter({ hasText: 'Kim Tan' }).first()
    await expect(kim).toContainText(/Offenses:\s*3|\s3(\s|$)/)
  })

  test('a superadmin sees the total and the masked offenses, never the original text, newest first', async ({ page }) => {
    const { profanity } = await setup(page, SUPERADMIN)
    const sheet = await openSheet(page, 'Kim Tan')
    const section = sheet.getByRole('region', { name: 'Offenses' })
    await expect(section.getByText('Total offenses: 3')).toBeAttached()
    const items = section.getByRole('list', { name: 'Offenses, newest first' }).getByRole('listitem')
    await expect(items).toHaveCount(3)
    await expect(items.first()).toContainText('you are ***** 1')
    await expect(items.first()).toContainText('Chat message')
    await expect(items.first()).toContainText('Matched: stupid')
    await expect(items.first()).toContainText(/\d{1,2}:\d{2}\s?[AP]M/i)
    await expect(sheet).not.toContainText('original secret text')
    expect(profanity.offenseLists[0].get('userId')).toBe(KIM.id)
  })

  test('a customer with no offenses shows the empty note', async ({ page }) => {
    await setup(page, SUPERADMIN, [])
    const sheet = await openSheet(page, 'Kim Tan')
    await expect(sheet.getByText('No offenses. Chat messages and reviews with hidden words from this customer will be listed here.')).toBeVisible()
  })

  test('a failed offenses load shows its own error with Retry while the rest of the sheet still works', async ({ page }) => {
    const { profanity } = await setup(page, SUPERADMIN)
    let fail = true
    await page.route(
      (url) => url.port !== '5173' && url.pathname === '/admin/profanity-offenses',
      (route) => (fail && route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { statusCode: 500, message: 'Internal server error' }, headers: CORS }) : route.fallback()),
    )
    const sheet = await openSheet(page, 'Kim Tan')
    const retry = sheet.getByRole('region', { name: 'Offenses' }).getByRole('button', { name: /Retry|Try again/ })
    await expect(retry).toBeVisible({ timeout: 20_000 })
    await expect(sheet.getByRole('button', { name: 'Block messaging' })).toBeVisible()
    fail = false
    await retry.click()
    await expect(sheet.getByText('you are ***** 1')).toBeVisible()
    void profanity
  })

  test('an admin sees the count and a note that only a superadmin reads the messages, and the offenses endpoint is never called', async ({ page }) => {
    const { profanity } = await setup(page, ADMIN)
    const sheet = await openSheet(page, 'Kim Tan')
    const section = sheet.getByRole('region', { name: 'Offenses' })
    await expect(section.getByText('Total offenses: 3')).toBeAttached()
    await expect(section.getByText('Only a superadmin can read the flagged messages.')).toBeVisible()
    await expect(section.getByRole('list')).toHaveCount(0)
    await expect(sheet.getByRole('button', { name: 'Block messaging' })).toBeVisible()
    expect(profanity.offenseLists).toHaveLength(0)
  })

  test('the sheet stays inside a 320px screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await setup(page, SUPERADMIN, [adminOffense(1, { maskedContent: 'x'.repeat(200) }), ...manyAdminOffenses(3).slice(1)])
    const sheet = await openSheet(page, 'Kim Tan')
    await expect(sheet.getByText('xxxxxxxxxx').first()).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    const box = (await sheet.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    const message = (await sheet.getByText('xxxxxxxxxx').first().boundingBox())!
    expect(message.x).toBeGreaterThanOrEqual(box.x)
    expect(message.x + message.width).toBeLessThanOrEqual(box.x + box.width)
  })
})

test.describe('block and unblock messaging', () => {
  for (const [label, who] of [['an admin', ADMIN], ['a superadmin', SUPERADMIN]] as const) {
    test(`${label} blocks messaging after a confirmation with a reason, and the sheet then offers Unblock`, async ({ page }) => {
      const { blocks } = await setup(page, who)
      const sheet = await openSheet(page, 'Kim Tan')
      await expect(sheet.getByText('Messaging allowed')).toBeVisible()
      await sheet.getByRole('button', { name: 'Block messaging', exact: true }).click()
      const confirm = page.getByRole('dialog', { name: 'Block messaging for Kim Tan?' })
      await expect(confirm.getByText('Are you sure?')).toBeVisible()
      await expect(confirm.getByText(/can still browse and shop, but can't send chat messages/)).toBeVisible()
      expect(blocks.calls).toHaveLength(0)
      await confirm.getByLabel('Reason').fill('Repeated insults in chat')
      await expect(confirm.getByText('24/500')).toBeVisible()
      await confirm.getByRole('button', { name: 'Block Messaging', exact: true }).click()
      await expect(toast(page, 'Kim Tan: messaging blocked.')).toBeVisible()
      expect(blocks.calls).toEqual([`block-messaging ${KIM.id}`])
      expect(blocks.bodies).toEqual([{ reason: 'Repeated insults in chat' }])
      await expect(sheet.getByText('Messaging blocked', { exact: true })).toBeVisible()
      await expect(sheet.getByText(/Reason: Repeated insults in chat/)).toBeVisible()
      await expect(sheet.getByRole('button', { name: 'Unblock messaging', exact: true })).toBeVisible()
    })
  }

  test('Cancel on the confirmation sends nothing, and an empty reason sends no body', async ({ page }) => {
    const { blocks } = await setup(page, ADMIN)
    const sheet = await openSheet(page, 'Kim Tan')
    await sheet.getByRole('button', { name: 'Block messaging', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: 'Block messaging for Kim Tan?' })
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirm).toHaveCount(0)
    expect(blocks.calls).toHaveLength(0)
    await sheet.getByRole('button', { name: 'Block messaging', exact: true }).click()
    await page.getByRole('dialog', { name: 'Block messaging for Kim Tan?' }).getByRole('button', { name: 'Block Messaging', exact: true }).click()
    await expect(toast(page, 'Kim Tan: messaging blocked.')).toBeVisible()
    expect(blocks.bodies).toEqual([null])
  })

  test('a blocked customer shows when and why, and Unblock confirms then unblocks', async ({ page }) => {
    const { blocks } = await setup(page, ADMIN)
    const sheet = await openSheet(page, 'Leo Uy')
    await expect(sheet.getByText('Messaging blocked', { exact: true })).toBeVisible()
    await expect(sheet.getByText(/Reason: Repeated insults/)).toBeVisible()
    await sheet.getByRole('button', { name: 'Unblock messaging', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: 'Unblock messaging for Leo Uy?' })
    await expect(confirm.getByText('will be able to send chat messages again.', { exact: false })).toBeVisible()
    await expect(confirm.getByLabel('Reason')).toHaveCount(0)
    await confirm.getByRole('button', { name: 'Unblock Messaging', exact: true }).click()
    await expect(toast(page, 'Leo Uy: messaging unblocked.')).toBeVisible()
    expect(blocks.calls).toEqual([`unblock-messaging ${LEO.id}`])
    await expect(sheet.getByText('Messaging allowed')).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Block messaging', exact: true })).toBeVisible()
  })

  test('a server 409 is shown in a toast with its sentence, and the sheet is unchanged', async ({ page }) => {
    const { blocks } = await setup(page, ADMIN)
    const sheet = await openSheet(page, 'Kim Tan')
    blocks.next = { status: 409, message: 'Customer messaging is already blocked' }
    await sheet.getByRole('button', { name: 'Block messaging', exact: true }).click()
    await page.getByRole('dialog', { name: 'Block messaging for Kim Tan?' }).getByRole('button', { name: 'Block Messaging', exact: true }).click()
    await expect(toast(page, "Couldn't block messaging for Kim Tan.")).toContainText('Customer messaging is already blocked')
    await expect(sheet.getByText('Messaging allowed')).toBeVisible()
  })

  test('the offenses count on the Customers tab reflects the server value after the sheet closes', async ({ page }) => {
    await setup(page, ADMIN)
    const sheet = await openSheet(page, 'Kim Tan')
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'View details of Leo Uy' }).filter({ visible: true }).first()).toBeVisible()
  })
})
