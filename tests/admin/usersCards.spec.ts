import { expect, test, type Page } from '@playwright/test'
import { inactive, json, manyUsers, stubUsersApi, userRow, type UserRow } from './usersApiStub'

// The account cards across the top of /admin/users and /superadmin/users: each counts one role with GET /users?role&isActive&limit=1
// (the answer is meta.total), loads, fails and retries on its own, and counts again after an invite, deactivate or activate.
// Backend stubbed (usersApiStub.ts); sign-in is the dev-only simulated one. Runs in the desktop and mobile projects.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

// 12 active and 2 inactive customers, 5 and 1 staff, 3 and 0 admins, 2 and 1 superadmins.
const ROWS: UserRow[] = [
  ...manyUsers('customer', 12),
  inactive(userRow('customer', 'Off', 'One', 90)),
  inactive(userRow('customer', 'Off', 'Two', 91)),
  ...manyUsers('staff', 5),
  inactive(userRow('staff', 'Off', 'Three', 92)),
  ...manyUsers('admin', 3),
  ...manyUsers('superadmin', 2),
  inactive(userRow('superadmin', 'Off', 'Four', 93)),
]

async function open(page: Page, who = ADMIN, path = '/admin/users') {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(who.email)
  await page.getByLabel('Password', { exact: true }).fill(who.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/(admin|superadmin)$/)
  await page.goto(path)
}

const figures = (page: Page) => page.getByRole('region', { name: 'Accounts at a glance' })
const card = (page: Page, label: string) => figures(page).getByRole('link', { name: new RegExp(`^${label}:`) })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const luminance = (css: string) => {
  const [r, g, b] = (css.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

test.describe('counts', () => {
  test('each card shows the active count with the inactive count beneath, and links to its tab', async ({ page }) => {
    await stubUsersApi(page, ROWS)
    await open(page)
    await expect(card(page, 'Customers')).toHaveAccessibleName(/^Customers: 12 active, 2 inactive, .*open customer list$/)
    await expect(card(page, 'Customers')).toContainText('2 inactive')
    await expect(card(page, 'Staff')).toHaveAccessibleName(/^Staff: 5 active, 1 inactive/)
    await expect(card(page, 'Admins')).toHaveAccessibleName(/^Admins: 3 active, 0 inactive/)
    await expect(card(page, 'Superadmins')).toHaveCount(0)
    await expect(figures(page).getByText(/archived|Registered shoppers|Sample data/)).toHaveCount(0)
    await expect(card(page, 'Staff')).toHaveAttribute('href', '/admin/users?tab=staff')
    await card(page, 'Admins').click()
    await expect(page).toHaveURL(/\/admin\/users\?tab=admins$/)
  })

  test('each count is one limit=1 request per role and active flag, shared rather than repeated', async ({ page }) => {
    const api = await stubUsersApi(page, ROWS)
    await open(page)
    await expect(card(page, 'Admins')).toContainText('0 inactive')
    const seen = api.counts.map((url) => `${url.searchParams.get('role')}:${url.searchParams.get('isActive')}`).sort()
    expect(seen).toEqual(['admin:false', 'admin:true', 'customer:false', 'customer:true', 'staff:false', 'staff:true'])
    for (const url of api.counts) expect(url.searchParams.get('limit')).toBe('1')
    // The list requests are separate and keep their own paging.
    expect(api.gets.every((url) => url.searchParams.get('limit') !== '1')).toBe(true)
  })

  test('the count sits at the left edge of the card, level with its label, in tabular digits', async ({ page }) => {
    await stubUsersApi(page, ROWS)
    await open(page)
    const link = card(page, 'Customers')
    await expect(link).toContainText('12')
    const label = await link.getByText('Customers', { exact: true }).boundingBox()
    const count = await link.getByText('12', { exact: true }).boundingBox()
    expect(Math.abs(label!.x - count!.x)).toBeLessThanOrEqual(1)
    const style = await link.getByText('12', { exact: true }).evaluate((el) => {
      const css = getComputedStyle(el)
      return { align: css.textAlign, nums: css.fontVariantNumeric }
    })
    expect(style.align).toMatch(/left|start/)
    expect(style.nums).toContain('tabular-nums')
  })

  test('a superadmin gets the fourth card, on the superadmin route', async ({ page }) => {
    await stubUsersApi(page, ROWS)
    await open(page, SUPERADMIN, '/superadmin/users')
    await expect(card(page, 'Superadmins')).toHaveAccessibleName(/^Superadmins: 2 active, 1 inactive/)
    await expect(card(page, 'Superadmins')).toHaveAttribute('href', '/superadmin/users?tab=superadmins')
    await expect(figures(page).getByRole('link')).toHaveCount(4)
  })
})

test.describe('loading', () => {
  test('a skeleton per card holds the card size, so nothing shifts when the counts arrive', async ({ page }) => {
    const api = await stubUsersApi(page, ROWS)
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    api.onCount = async () => {
      await gate
      return false
    }
    await open(page)
    for (const name of ['Loading customers', 'Loading staff', 'Loading admins']) await expect(figures(page).getByRole('status', { name })).toBeVisible()
    const before = await figures(page).boundingBox()
    release()
    await expect(card(page, 'Customers')).toContainText('12')
    const after = await figures(page).boundingBox()
    expect(after!.height).toBeCloseTo(before!.height, 0)
  })
})

test.describe('errors', () => {
  test('one failed card shows its own error with Retry while the others and the list keep working', async ({ page }) => {
    const api = await stubUsersApi(page, ROWS)
    let fail = true
    api.onCount = (route, url) => (fail && url.searchParams.get('role') === 'staff' ? json(route, 500, { message: 'boom' }).then(() => true) : false)
    await open(page)
    const alert = figures(page).getByRole('alert')
    await expect(alert).toHaveCount(1)
    await expect(alert).toContainText("We couldn't load the staff count.")
    await expect(card(page, 'Customers')).toContainText('12')
    await expect(card(page, 'Admins')).toContainText('3')
    await expect(page.getByRole('tab', { name: 'Customers', selected: true })).toBeVisible()
    await expect(page.getByText('Customerab Personab').filter({ visible: true }).first()).toBeVisible()

    fail = false
    await alert.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(card(page, 'Staff')).toContainText('5')
    await expect(figures(page).getByRole('alert')).toHaveCount(0)
  })

  test('every card can fail at once and each has its own Retry', async ({ page }) => {
    const api = await stubUsersApi(page, ROWS)
    api.onCount = (route) => json(route, 503, {}).then(() => true)
    await open(page)
    await expect(figures(page).getByRole('alert')).toHaveCount(3)
    await expect(figures(page).getByRole('button', { name: 'Retry', exact: true })).toHaveCount(3)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('refresh', () => {
  test('inviting an account counts again and the card shows the new number', async ({ page }) => {
    const api = await stubUsersApi(page, ROWS)
    await open(page, ADMIN, '/admin/users?tab=staff')
    await expect(card(page, 'Staff')).toContainText('5')
    const before = api.counts.length
    await page.getByRole('button', { name: 'Add staff account', exact: true }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Add staff account' })
    await sheet.getByLabel('First name').fill('Maya')
    await sheet.getByLabel('Last name').fill('Lopez')
    await sheet.getByLabel('Email').fill('maya.lopez@example.com')
    await sheet.getByRole('button', { name: 'Send Invitation', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Invitation sent' })).toBeVisible()
    await expect(card(page, 'Staff')).toHaveAccessibleName(/^Staff: 6 active, 1 inactive/)
    expect(api.counts.length).toBeGreaterThan(before)
  })

  test('deactivating and then undoing moves a count to Inactive and back', async ({ page }) => {
    await stubUsersApi(page, ROWS)
    await open(page, ADMIN, '/admin/users?tab=customers')
    await expect(card(page, 'Customers')).toHaveAccessibleName(/^Customers: 12 active, 2 inactive/)
    await page.getByRole('button', { name: 'Deactivate Customerab Personab', exact: true }).filter({ visible: true }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate Customer', exact: true }).click()
    await expect(card(page, 'Customers')).toHaveAccessibleName(/^Customers: 11 active, 3 inactive/)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(card(page, 'Customers')).toHaveAccessibleName(/^Customers: 12 active, 2 inactive/)
  })

  test('activating an inactive customer counts again', async ({ page }) => {
    await stubUsersApi(page, ROWS)
    await open(page, ADMIN, '/admin/users?tab=customers')
    await page.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'Inactive', exact: true }).click()
    await page.getByRole('button', { name: 'Activate Off One', exact: true }).filter({ visible: true }).first().click()
    await expect(card(page, 'Customers')).toHaveAccessibleName(/^Customers: 13 active, 1 inactive/)
  })
})

test.describe('layout', () => {
  test('no horizontal scroll at 320px for a superadmin with four cards, and the cards stay inside the page', async ({ page }) => {
    await stubUsersApi(page, ROWS)
    await page.setViewportSize({ width: 320, height: 700 })
    await open(page, SUPERADMIN, '/superadmin/users')
    await expect(figures(page).getByRole('link')).toHaveCount(4)
    await expect(card(page, 'Superadmins')).toContainText('2')
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
    for (const link of await figures(page).getByRole('link').all()) {
      const box = (await link.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(320)
    }
  })

  for (const width of [320, 640, 768, 1024, 1280, 1920]) {
    test(`four cards fit with no overflow or cut labels at ${width}px`, async ({ page }) => {
      await stubUsersApi(page, ROWS)
      await page.setViewportSize({ width, height: 900 })
      await open(page, SUPERADMIN, '/superadmin/users')
      await expect(card(page, 'Superadmins')).toContainText('2')
      await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
      const cut = await page.evaluate(() =>
        [...document.querySelectorAll('section[aria-labelledby="account-figures"] a span')].filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent),
      )
      expect(cut).toEqual([])
    })
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`the cards read clearly in ${scheme} mode, in their loaded and error states`, async ({ page }) => {
      const api = await stubUsersApi(page, ROWS)
      let fail = true
      api.onCount = (route, url) => (fail && url.searchParams.get('role') === 'admin' ? json(route, 500, {}).then(() => true) : false)
      await page.emulateMedia({ colorScheme: scheme })
      await open(page)
      if (scheme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
      await expect(card(page, 'Customers')).toContainText('12')
      await expect(figures(page).getByRole('alert')).toBeVisible()
      const read = await page.evaluate(() => {
        const link = document.querySelector('section[aria-labelledby="account-figures"] a')!
        const spans = [...link.querySelectorAll('span')]
        return { bg: getComputedStyle(link).backgroundColor, text: spans.map((s) => getComputedStyle(s).color) }
      })
      for (const text of read.text.slice(0, 3)) expect(Math.abs(luminance(text) - luminance(read.bg))).toBeGreaterThan(60)
      const errorText = await figures(page).getByRole('alert').getByText("We couldn't load the admins count.").evaluate((el) => getComputedStyle(el).color)
      expect(Math.abs(luminance(errorText) - luminance(read.bg))).toBeGreaterThan(60)
      fail = false
    })
  }
})
