import { expect, test, type Page } from '@playwright/test'
import { json, manyStaff, stubStaffApi, type StaffStub } from './staffApiStub'

// The Staff tab on /admin/users and /superadmin/users, backed by GET/POST /users/staff. The API is stubbed (see staffApiStub.ts); sign-in is the
// dev-only simulated one. Runs in the desktop (table) and mobile (cards) projects.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function signIn(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

async function open(page: Page, who = ADMIN, path = '/admin/users?tab=staff') {
  await signIn(page, who)
  await expect(page).toHaveURL(/\/(admin|superadmin)$/)
  await page.goto(path)
  await expect(page.getByRole('tab', { name: 'Staff', exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const addButton = (page: Page) => page.getByRole('button', { name: 'Add staff account', exact: true }).first()
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Add staff account' })
const created = (page: Page) => page.getByRole('dialog', { name: 'Staff account created' })
const submit = (page: Page) => sheet(page).getByRole('button', { name: /^(Create Account|Creating…)$/ })
const visibleText = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true }).first()

async function fillNames(page: Page, first = 'Maya', last = 'Lopez') {
  await addButton(page).click()
  await sheet(page).getByLabel('First name').fill(first)
  await sheet(page).getByLabel('Last name').fill(last)
}

test.describe('staff list', () => {
  let api: StaffStub

  test('shows # before the staff name and numbers rows across pages', async ({ page, isMobile }) => {
    if (!isMobile) await page.setViewportSize({ width: 1920, height: 900 })
    api = await stubStaffApi(page, manyStaff(25))
    await open(page)
    await expect(visibleText(page, 'Staffab Personab')).toBeVisible({ timeout: 20_000 })
    const isTable = await page.getByRole('table').isVisible()

    if (isTable) {
      const headers = page.getByRole('columnheader')
      await expect(headers.nth(0)).toHaveText('#')
      await expect(headers.nth(1)).toContainText('Staff')
      const rows = page.getByRole('table').getByRole('row')
      await expect(rows).toHaveCount(11)
      await expect(rows.nth(1).getByRole('cell').first()).toHaveText('1')
      await expect(rows.nth(10).getByRole('cell').first()).toHaveText('10')
    } else {
      const cards = page.getByRole('list', { name: 'Staff accounts with email and date added' }).getByRole('listitem')
      await expect(cards).toHaveCount(10)
      await expect(cards.first().getByText('#', { exact: true })).toBeVisible()
      await expect(cards.first()).toContainText(/#\s*1(?!\d)/)
      await expect(cards.last()).toContainText(/#\s*10(?!\d)/)
    }
    expect(api.gets[0].searchParams.get('limit')).toBe('10')

    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect.poll(() => api.gets.at(-1)!.searchParams.get('page')).toBe('2')
    if (isTable) {
      const rows = page.getByRole('table').getByRole('row')
      await expect(rows.nth(1).getByRole('cell').first()).toHaveText('11')
      await expect(rows.nth(10).getByRole('cell').first()).toHaveText('20')
    } else {
      const cards = page.getByRole('list', { name: 'Staff accounts with email and date added' }).getByRole('listitem')
      await expect(cards.first()).toContainText(/#\s*11(?!\d)/)
      await expect(cards.last()).toContainText(/#\s*20(?!\d)/)
    }
  })

  test('empty list shows the empty state with a way to add the first account', async ({ page }) => {
    await stubStaffApi(page, [])
    await open(page)
    await expect(page.getByText('No staff accounts yet')).toBeVisible()
    await page.getByRole('button', { name: 'Add staff account', exact: true }).last().click()
    await expect(sheet(page)).toBeVisible()
  })

  test('a 500 shows the error with Retry, and Retry loads the list', async ({ page }) => {
    api = await stubStaffApi(page)
    let fail = true
    api.onGet = (route) => {
      if (!fail) return false
      return json(route, 500, { message: 'boom' }).then(() => true)
    }
    await open(page)
    const alert = page.getByRole('alert')
    await expect(alert).toContainText("We couldn't load the staff accounts.")
    await expect(alert).toContainText('Something went wrong on our side. Try again in a moment.')
    fail = false
    await alert.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(visibleText(page, 'Lara Santos')).toBeVisible()
    await expect(alert).toHaveCount(0)
  })

  for (const status of [401, 403]) {
    test(`a ${status} explains that the account may not see the list`, async ({ page }) => {
      api = await stubStaffApi(page)
      api.onGet = (route) => json(route, status, { message: 'nope' }).then(() => true)
      await open(page)
      const alert = page.getByRole('alert')
      await expect(alert).toContainText("We couldn't load the staff accounts.")
      await expect(alert).toContainText('Your account is not allowed to see this. Sign in again, or ask an admin for access.')
      await expect(alert.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    })
  }

  test('the superadmin route lists the same staff', async ({ page }) => {
    await stubStaffApi(page)
    await open(page, SUPERADMIN, '/superadmin/users?tab=staff')
    await expect(visibleText(page, 'Lara Santos')).toBeVisible()
    await expect(visibleText(page, 'Nina Reyes')).toBeVisible()
  })

  test('no horizontal scroll at 320px, with the list, the form and the credentials', async ({ page }) => {
    await stubStaffApi(page)
    await page.setViewportSize({ width: 320, height: 700 })
    await open(page)
    await expect(visibleText(page, 'Lara Santos')).toBeVisible()
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
    await fillNames(page)
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
    await submit(page).click()
    await expect(created(page)).toBeVisible()
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('creating staff', () => {
  let api: StaffStub
  test.beforeEach(async ({ page }) => {
    api = await stubStaffApi(page)
    await open(page)
  })

  test('delays the POST: the button is disabled and reads Creating…, and a double click sends one request', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    api.onPost = async () => {
      await gate
    }
    await fillNames(page)
    await submit(page).dblclick()
    await expect(sheet(page).getByRole('button', { name: 'Creating…' })).toBeDisabled()
    expect(api.posts).toHaveLength(1)
    release()
    await expect(created(page)).toBeVisible()
    expect(api.posts).toHaveLength(1)
  })

  test('shows the credentials once, copies them, downloads a PNG, and the list shows the new staff', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await fillNames(page)
    await submit(page).click()
    const done = created(page)
    await expect(done.getByRole('heading', { name: 'Maya Lopez' })).toBeVisible()
    await expect(done.getByText('Username', { exact: true })).toHaveCount(0)
    await expect(done.getByText('maya.lopez@silhoufit.dev', { exact: true })).toBeVisible()
    await expect(done.getByText('Tmp#Pass-2026x', { exact: true })).toBeVisible()
    expect(api.posts).toEqual([{ firstName: 'Maya', lastName: 'Lopez' }])

    await expect(done.getByRole('button', { name: 'Copy username', exact: true })).toHaveCount(0)
    await done.getByRole('button', { name: 'Copy sign-in email', exact: true }).click()
    await expect(page.getByText('Email copied').first()).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('maya.lopez@silhoufit.dev')
    await done.getByRole('button', { name: 'Copy temporary password', exact: true }).click()
    await expect(page.getByText('Password copied').first()).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Tmp#Pass-2026x')

    const download = page.waitForEvent('download')
    await done.getByRole('button', { name: 'Download as PNG', exact: true }).click()
    expect((await download).suggestedFilename()).toMatch(/\.png$/)

    const before = api.gets.length
    await done.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(visibleText(page, 'Maya Lopez')).toBeVisible()
    expect(api.gets.length).toBeGreaterThanOrEqual(before)
    expect(api.gets.length).toBeGreaterThan(1)
  })

  const FAILURES: { name: string; reply: (route: Parameters<NonNullable<StaffStub['onPost']>>[0]) => Promise<unknown>; title: string; body: RegExp }[] = [
    { name: '403', reply: (r) => json(r, 403, { message: 'Forbidden' }), title: "You can't create staff accounts.", body: /Only admins and superadmins can.*no account was made.*Sign in with an admin account/ },
    { name: '409', reply: (r) => json(r, 409, { message: 'taken' }), title: "We couldn't reserve that email.", body: /took the generated email.*no account was made.*Try again/ },
    { name: '400', reply: (r) => json(r, 400, { message: ['firstName must be a string'] }), title: 'The server rejected the names.', body: /firstName must be a string.*No account was made.*Fix the names/ },
    { name: '503', reply: (r) => json(r, 503, {}), title: 'No account was made.', body: /Something went wrong on our side.*Try again in a moment/ },
    { name: 'network abort', reply: (r) => r.abort('failed'), title: 'Nothing was created.', body: /connection dropped.*Check your connection, then try again/ },
  ]
  for (const failure of FAILURES) {
    test(`a ${failure.name} says what happened, why, and what to do, and the form stays usable`, async ({ page }) => {
      api.onPost = (route) => failure.reply(route).then(() => true)
      await fillNames(page)
      await submit(page).click()
      const alert = sheet(page).getByRole('alert')
      await expect(alert).toContainText(failure.title)
      await expect(alert).toContainText(failure.body)
      await expect(submit(page)).toBeEnabled()
      await expect(sheet(page).getByLabel('First name')).toHaveValue('Maya')
      await expect(created(page)).toHaveCount(0)
    })
  }

  test('after a failure, trying again succeeds', async ({ page }) => {
    let first = true
    api.onPost = (route) => {
      if (!first) return false
      first = false
      return json(route, 503, {}).then(() => true)
    }
    await fillNames(page)
    await submit(page).click()
    await expect(sheet(page).getByRole('alert')).toBeVisible()
    await submit(page).click()
    await expect(created(page)).toBeVisible()
  })

  test('rejects empty names, drops digits and emoji, and sends nothing', async ({ page }) => {
    await addButton(page).click()
    await submit(page).click()
    await expect(sheet(page).getByLabel('First name')).toHaveAttribute('aria-invalid', 'true')
    await expect(sheet(page).getByLabel('Last name')).toHaveAttribute('aria-invalid', 'true')
    await expect(sheet(page).getByText(/first name/i).filter({ hasText: /enter|required|letters/i }).first()).toBeVisible()
    await sheet(page).getByLabel('First name').fill('Ana123 😀')
    await expect(sheet(page).getByLabel('First name')).toHaveValue(/^Ana\s?$/)
    await sheet(page).getByLabel('Last name').fill('4567')
    await expect(sheet(page).getByLabel('Last name')).toHaveValue('')
    expect(api.posts).toEqual([])
  })
})
