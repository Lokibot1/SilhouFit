import { expect, test, type Page } from '@playwright/test'
import { manyAdmins, stubAdminApi, type AdminStub } from './adminApiStub'
import { json } from './staffApiStub'

// The Admins tab on /admin/users and /superadmin/users, backed by GET/POST /users/admins. The API is stubbed (see adminApiStub.ts); sign-in is the
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

async function open(page: Page, who = ADMIN, path = '/admin/users?tab=admins') {
  await signIn(page, who)
  await expect(page).toHaveURL(/\/(admin|superadmin)$/)
  await page.goto(path)
  await expect(page.getByRole('tab', { name: 'Admins', exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const addButton = (page: Page) => page.getByRole('button', { name: 'Add admin account', exact: true }).first()
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Add admin account' })
const created = (page: Page) => page.getByRole('dialog', { name: 'Admin account created' })
const submit = (page: Page) => sheet(page).getByRole('button', { name: /^(Create Account|Creating…)$/ })
const visibleText = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true }).first()
const LIST = 'Admin accounts with email, status and date added'

async function fillNames(page: Page, first = 'Maya', last = 'Lopez') {
  await addButton(page).click()
  await sheet(page).getByLabel('First name').fill(first)
  await sheet(page).getByLabel('Last name').fill(last)
}

test.describe('admins list', () => {
  let api: AdminStub

  test('shows # before the admin name and numbers rows across pages', async ({ page, isMobile }) => {
    if (!isMobile) await page.setViewportSize({ width: 1920, height: 900 })
    api = await stubAdminApi(page, manyAdmins(25))
    await open(page)
    await expect(visibleText(page, 'Adminab Personab')).toBeVisible({ timeout: 20_000 })
    const isTable = await page.getByRole('table').isVisible()

    if (isTable) {
      const headers = page.getByRole('columnheader')
      await expect(headers).toHaveText(['#', 'Admin', 'Email', 'Status', 'Added'])
      const rows = page.getByRole('table').getByRole('row')
      await expect(rows).toHaveCount(11)
      await expect(rows.nth(1).getByRole('cell').first()).toHaveText('1')
      await expect(rows.nth(10).getByRole('cell').first()).toHaveText('10')
    } else {
      const cards = page.getByRole('list', { name: LIST }).getByRole('listitem')
      await expect(cards).toHaveCount(10)
      await expect(cards.first().getByText('#', { exact: true })).toBeVisible()
      await expect(cards.first()).toContainText(/#\s*1(?!\d)/)
      await expect(cards.last()).toContainText(/#\s*10(?!\d)/)
    }
    expect(api.gets[0].searchParams.get('limit')).toBe('10')
    expect(api.gets[0].searchParams.get('status')).toBe('active')
    await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Active')
    await expect(page.getByText('Sample data', { exact: true })).toHaveCount(0)
    await expect(page.getByPlaceholder('Name or email')).toBeVisible()

    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect.poll(() => api.gets.at(-1)!.searchParams.get('page')).toBe('2')
    if (isTable) {
      const rows = page.getByRole('table').getByRole('row')
      await expect(rows.nth(1).getByRole('cell').first()).toHaveText('11')
      await expect(rows.nth(10).getByRole('cell').first()).toHaveText('20')
    } else {
      const cards = page.getByRole('list', { name: LIST }).getByRole('listitem')
      await expect(cards.first()).toContainText(/#\s*11(?!\d)/)
      await expect(cards.last()).toContainText(/#\s*20(?!\d)/)
    }
  })

  test('search narrows the list through the server', async ({ page }) => {
    api = await stubAdminApi(page)
    await open(page)
    await expect(visibleText(page, 'Brian Dijamco')).toBeVisible({ timeout: 20_000 })
    await page.getByLabel('Search admins by name or email').fill('alyssa')
    await expect.poll(() => api.gets.at(-1)!.searchParams.get('search')).toBe('alyssa')
    await expect(visibleText(page, 'Alyssa Ferrer')).toBeVisible()
    await expect(page.getByText('Brian Dijamco', { exact: true }).filter({ visible: true })).toHaveCount(0)
  })

  test('empty list shows the empty state with a way to add the first account', async ({ page }) => {
    await stubAdminApi(page, [])
    await open(page)
    await expect(page.getByText('No admin accounts yet')).toBeVisible()
    await page.getByRole('button', { name: 'Add admin account', exact: true }).last().click()
    await expect(sheet(page)).toBeVisible()
  })

  test('a 500 shows the error with Retry, and Retry loads the list', async ({ page }) => {
    api = await stubAdminApi(page)
    let fail = true
    api.onGet = (route) => {
      if (!fail) return false
      return json(route, 500, { message: 'boom' }).then(() => true)
    }
    await open(page)
    const alert = page.getByRole('alert')
    await expect(alert).toContainText("We couldn't load the admin accounts.")
    await expect(alert).toContainText('Something went wrong on our side. Try again in a moment.')
    fail = false
    await alert.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(visibleText(page, 'Brian Dijamco')).toBeVisible()
    await expect(alert).toHaveCount(0)
  })

  test('the superadmin route lists the same admins, with Reset and Archive on every row', async ({ page }) => {
    await stubAdminApi(page)
    await open(page, SUPERADMIN, '/superadmin/users?tab=admins')
    await expect(visibleText(page, 'Brian Dijamco')).toBeVisible()
    await expect(visibleText(page, 'Carlo Mendoza')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Reset password for / }).filter({ visible: true })).toHaveCount(3)
    await expect(page.getByRole('button', { name: /^Archive / }).filter({ visible: true })).toHaveCount(3)
  })

  test('the admin route has no row actions', async ({ page }) => {
    await stubAdminApi(page)
    await open(page)
    await expect(visibleText(page, 'Brian Dijamco')).toBeVisible()
    await expect(page.getByRole('button', { name: /Reset password|Archive|Restore/ })).toHaveCount(0)
  })

  test('no horizontal scroll at 320px, with the list, the form and the credentials', async ({ page }) => {
    await stubAdminApi(page)
    await page.setViewportSize({ width: 320, height: 700 })
    await open(page)
    await expect(visibleText(page, 'Brian Dijamco')).toBeVisible()
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
    await fillNames(page)
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
    await submit(page).click()
    await expect(created(page)).toBeVisible()
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('creating admins', () => {
  let api: AdminStub
  test.beforeEach(async ({ page }) => {
    api = await stubAdminApi(page)
    await open(page)
  })

  test('previews the sign-in email from the names, and asks for names only', async ({ page }) => {
    await addButton(page).click()
    await expect(sheet(page).getByLabel('Phone')).toHaveCount(0)
    await expect(sheet(page).getByText('Enter both names to see it')).toBeVisible()
    await sheet(page).getByLabel('First name').fill('Maya')
    await sheet(page).getByLabel('Last name').fill('Lopez')
    await expect(sheet(page).getByText('maya.lopez@silhoufit.dev')).toBeVisible()
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

  test('shows the credentials once, copies them, downloads a PNG, and the list shows the new admin', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await fillNames(page)
    await submit(page).click()
    const done = created(page)
    await expect(done.getByRole('heading', { name: 'Maya Lopez' })).toBeVisible()
    await expect(done.getByText('Username', { exact: true })).toHaveCount(0)
    await expect(done.getByText(/Demo only/)).toHaveCount(0)
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

    await done.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(visibleText(page, 'Maya Lopez')).toBeVisible()
    expect(api.gets.length).toBeGreaterThan(1)
  })

  const FAILURES: { name: string; reply: (route: Parameters<NonNullable<AdminStub['onPost']>>[0]) => Promise<unknown>; title: string; body: RegExp }[] = [
    { name: '403', reply: (r) => json(r, 403, { message: 'Forbidden' }), title: "You can't create admin accounts.", body: /Only admins and superadmins can.*no account was made.*Sign in with an admin account/ },
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
