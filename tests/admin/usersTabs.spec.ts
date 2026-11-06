import { expect, test, type Page } from '@playwright/test'
import { inactive, inviteProblems, json, manyUsers, stubUsersApi, SAMPLE_USERS, userRow, type UsersStub } from './usersApiStub'

// The Customers, Staff, Admins and Superadmins tabs on /admin/users and /superadmin/users, backed by GET /users, POST /users/staff/invite,
// POST /users/:id/deactivate|activate and Supabase's password reset email. The backend is stubbed (see usersApiStub.ts); sign-in is the
// dev-only simulated one. Runs in the desktop (table) and mobile (cards) projects.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

type Tab = 'customers' | 'staff' | 'admins' | 'superadmins'
const NOUN = { customers: 'customer', staff: 'staff', admins: 'admin', superadmins: 'superadmin' } as const
const TAB_NAME = { customers: 'Customers', staff: 'Staff', admins: 'Admins', superadmins: 'Superadmins' } as const

async function signIn(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

async function open(page: Page, tab: Tab = 'staff', who = ADMIN, base = '/admin') {
  await signIn(page, who)
  await expect(page).toHaveURL(/\/(admin|superadmin)$/)
  await page.goto(`${base}/users?tab=${tab}`)
  await expect(page.getByRole('tab', { name: TAB_NAME[tab], exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const visibleText = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true }).first()
const addButton = (page: Page, tab: Tab = 'staff') => page.getByRole('button', { name: `Add ${NOUN[tab]} account`, exact: true }).first()
const sheet = (page: Page, tab: Tab = 'staff') => page.getByRole('dialog', { name: `Add ${NOUN[tab]} account` })
const sent = (page: Page) => page.getByRole('dialog', { name: 'Invitation sent' })
const send = (page: Page, tab: Tab = 'staff') => sheet(page, tab).getByRole('button', { name: /^(Send Invitation|Sending…)$/ })
/** The first row action with this name that is on screen (the table and the cards both render it). */
const action = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true }).first()

async function fillInvite(page: Page, tab: Tab, first = 'Maya', last = 'Lopez', email = 'Maya.Lopez@Example.com') {
  await addButton(page, tab).click()
  await sheet(page, tab).getByLabel('First name').fill(first)
  await sheet(page, tab).getByLabel('Last name').fill(last)
  await sheet(page, tab).getByLabel('Email').fill(email)
}

test.describe('lists from GET /users', () => {
  let api: UsersStub

  for (const tab of ['customers', 'staff', 'admins', 'superadmins'] as const) {
    test(`${tab}: asks for its role, shows # first, and numbers rows across pages`, async ({ page, isMobile }) => {
      if (!isMobile) await page.setViewportSize({ width: 1920, height: 900 })
      api = await stubUsersApi(page, manyUsers(NOUN[tab], 25))
      await open(page, tab, tab === 'superadmins' ? SUPERADMIN : ADMIN, tab === 'superadmins' ? '/superadmin' : '/admin')
      await expect.poll(() => api.gets.length).toBeGreaterThan(0)
      const first = api.gets[0].searchParams
      expect(first.get('role')).toBe(NOUN[tab])
      expect(first.get('limit')).toBe('10')
      expect(first.get('sortBy')).toBe('fullName')
      expect(first.get('sortOrder')).toBe('asc')
      expect(first.get('isActive')).toBe(tab === 'superadmins' ? null : 'true')

      const isTable = await page.getByRole('table').isVisible()
      if (isTable) {
        await expect(page.getByRole('columnheader').nth(0)).toHaveText('#')
        const rows = page.getByRole('table').getByRole('row')
        await expect(rows).toHaveCount(11)
        await expect(rows.nth(1).getByRole('cell').first()).toHaveText('1')
      } else {
        const cards = page.getByRole('list').filter({ has: page.getByRole('listitem') }).first().getByRole('listitem')
        await expect(cards.first()).toContainText(/#\s*1(?!\d)/)
      }
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await expect.poll(() => api.gets.at(-1)!.searchParams.get('page')).toBe('2')
      if (isTable) await expect(page.getByRole('table').getByRole('row').nth(1).getByRole('cell').first()).toHaveText('11')
    })
  }

  test('search and the Active / Inactive / All filter go to the API as search and isActive', async ({ page }) => {
    api = await stubUsersApi(page, [...SAMPLE_USERS, inactive(userRow('staff', 'Off', 'Duty', 40))])
    await open(page)
    await expect(visibleText(page, 'Lara Santos')).toBeVisible()
    await expect(visibleText(page, 'Off Duty')).toBeHidden()

    await page.getByLabel('Search staff by name or email').fill('miguel')
    await expect(visibleText(page, 'Miguel Cruz')).toBeVisible()
    await expect(visibleText(page, 'Lara Santos')).toBeHidden()
    expect(api.gets.at(-1)!.searchParams.get('search')).toBe('miguel')
    await page.getByLabel('Search staff by name or email').fill('')

    await page.getByRole('combobox', { name: 'Status' }).click()
    await expect(page.getByRole('listbox', { name: 'Status' }).getByRole('option')).toHaveText(['Active', 'Inactive', 'All'])
    await page.getByRole('option', { name: 'Inactive', exact: true }).click()
    await expect(visibleText(page, 'Off Duty')).toBeVisible()
    await expect(visibleText(page, 'Inactive')).toBeVisible()
    expect(api.gets.at(-1)!.searchParams.get('isActive')).toBe('false')

    await page.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'All', exact: true }).click()
    await expect(visibleText(page, 'Lara Santos')).toBeVisible()
    expect(api.gets.at(-1)!.searchParams.has('isActive')).toBe(false)
  })

  test('an empty list shows the empty state with a way to invite the first account', async ({ page }) => {
    await stubUsersApi(page, [])
    await open(page)
    await expect(page.getByText('No staff accounts yet')).toBeVisible()
    await page.getByRole('button', { name: 'Add staff account', exact: true }).last().click()
    await expect(sheet(page)).toBeVisible()
  })

  test('a 500 shows the error with Retry, and Retry loads the list', async ({ page }) => {
    api = await stubUsersApi(page)
    let fail = true
    api.onGet = (route) => (fail ? json(route, 500, { message: 'boom' }).then(() => true) : false)
    await open(page)
    const alert = page.getByRole('alert')
    await expect(alert).toContainText("We couldn't load the staff accounts.")
    fail = false
    await alert.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(visibleText(page, 'Lara Santos')).toBeVisible()
    await expect(alert).toHaveCount(0)
  })

  test('the superadmin route lists the same staff', async ({ page }) => {
    await stubUsersApi(page)
    await open(page, 'staff', SUPERADMIN, '/superadmin')
    await expect(visibleText(page, 'Lara Santos')).toBeVisible()
    await expect(visibleText(page, 'Nina Reyes')).toBeVisible()
  })
})

test.describe('Customers tab', () => {
  let api: UsersStub
  const CUSTOMERS = [...SAMPLE_USERS.filter((u) => u.role === 'customer'), inactive(userRow('customer', 'Off', 'Line', 41))]
  const FORBIDDEN_BUTTONS = /reset email|Add .* account/

  test('lists Name, Email, Status and Added after #, with no orders or spend and no add button', async ({ page, isMobile }) => {
    if (!isMobile) await page.setViewportSize({ width: 1920, height: 900 })
    api = await stubUsersApi(page, CUSTOMERS)
    await open(page, 'customers')
    await expect(visibleText(page, 'Kim Tan')).toBeVisible()
    await expect(visibleText(page, 'Off Line')).toBeHidden()
    await expect(page.getByRole('button', { name: FORBIDDEN_BUTTONS })).toHaveCount(0)
    await expect(page.getByRole('main').getByText(/Orders|Lifetime spend|Sample data/)).toHaveCount(0)
    await expect(visibleText(page, 'kim.tan@silhoufit.dev')).toBeVisible()
    if (await page.getByRole('table').isVisible()) {
      await expect(page.getByRole('columnheader')).toHaveText(['#', 'Customer', 'Email', 'Status', 'Added', 'Actions'])
      const number = page.getByRole('table').getByRole('row').nth(1).getByRole('cell').first()
      await expect(number).toHaveText('1')
      // The # column is left-aligned like the other tabs.
      expect(await number.evaluate((el) => getComputedStyle(el).textAlign)).toMatch(/left|start/)
    }
  })

  test('search and the Active / Inactive / All filter go to the API as search and isActive', async ({ page }) => {
    api = await stubUsersApi(page, CUSTOMERS)
    await open(page, 'customers')
    expect(api.gets[0].searchParams.get('isActive')).toBe('true')
    await page.getByLabel('Search customers by name or email').fill('leo')
    await expect(visibleText(page, 'Leo Uy')).toBeVisible()
    await expect(visibleText(page, 'Kim Tan')).toBeHidden()
    expect(api.gets.at(-1)!.searchParams.get('search')).toBe('leo')
    await page.getByLabel('Search customers by name or email').fill('')
    await page.getByRole('combobox', { name: 'Status' }).click()
    await expect(page.getByRole('listbox', { name: 'Status' }).getByRole('option')).toHaveText(['Active', 'Inactive', 'All'])
    await page.getByRole('option', { name: 'Inactive', exact: true }).click()
    await expect(visibleText(page, 'Off Line')).toBeVisible()
    expect(api.gets.at(-1)!.searchParams.get('isActive')).toBe('false')
    await page.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'All', exact: true }).click()
    await expect(visibleText(page, 'Kim Tan')).toBeVisible()
    expect(api.gets.at(-1)!.searchParams.has('isActive')).toBe(false)
  })

  for (const [who, base, name] of [
    [ADMIN, '/admin', 'an admin'],
    [SUPERADMIN, '/superadmin', 'a superadmin'],
  ] as const) {
    test(`${name} deactivates a customer after a question, can undo, and activates from the Inactive filter`, async ({ page }) => {
      api = await stubUsersApi(page, CUSTOMERS)
      await open(page, 'customers', who, base)
      await action(page, 'Deactivate Kim Tan').click()
      const dialog = page.getByRole('dialog', { name: 'Deactivate Kim Tan?' })
      await expect(dialog).toContainText('Are you sure?')
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      expect(api.deactivations).toEqual([])
      await action(page, 'Deactivate Kim Tan').click()
      await dialog.getByRole('button', { name: 'Deactivate Customer', exact: true }).click()
      await expect(page.getByText('Kim Tan deactivated.')).toBeVisible()
      expect(api.deactivations).toHaveLength(1)
      await expect(visibleText(page, 'Kim Tan')).toBeHidden()
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(page.getByText('Deactivation undone. Kim Tan can sign in again.')).toBeVisible()
      await expect(visibleText(page, 'Kim Tan')).toBeVisible()

      await page.getByRole('combobox', { name: 'Status' }).click()
      await page.getByRole('option', { name: 'Inactive', exact: true }).click()
      await action(page, 'Activate Off Line').click()
      await expect(page.getByText(/Off Line activated\./)).toBeVisible()
      expect(api.activations).toHaveLength(2)
    })
  }

  test('a 403 on deactivate is explained in the customer wording', async ({ page }) => {
    api = await stubUsersApi(page, CUSTOMERS)
    api.onDeactivate = (route) => json(route, 403, { message: 'insufficient authority' }).then(() => true)
    await open(page, 'customers')
    await action(page, 'Deactivate Kim Tan').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate Customer', exact: true }).click()
    await expect(page.getByText("isn't allowed to deactivate customers")).toBeVisible()
  })

  test('an empty list says customers appear when they sign up, and has no invite button', async ({ page }) => {
    await stubUsersApi(page, [])
    await open(page, 'customers')
    await expect(page.getByText('No customers yet')).toBeVisible()
    await expect(page.getByText('Customers appear here as soon as they sign up in the shop.')).toBeVisible()
    await expect(page.getByRole('button', { name: FORBIDDEN_BUTTONS })).toHaveCount(0)
  })

  test('a 500 shows the error with Retry, and Retry loads the list', async ({ page }) => {
    api = await stubUsersApi(page, CUSTOMERS)
    let fail = true
    api.onGet = (route) => (fail ? json(route, 500, { message: 'boom' }).then(() => true) : false)
    await open(page, 'customers')
    const alert = page.getByRole('tabpanel').getByRole('alert')
    await expect(alert).toContainText("We couldn't load the customers.")
    fail = false
    await alert.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(visibleText(page, 'Kim Tan')).toBeVisible()
    await expect(alert).toHaveCount(0)
  })
})

test.describe('inviting', () => {
  let api: UsersStub

  for (const tab of ['staff', 'admins', 'superadmins'] as const) {
    test(`${tab}: sends names, the lowercased email and role ${NOUN[tab]} with the callback redirect, never a password, and shows no credentials`, async ({ page, baseURL }) => {
      api = await stubUsersApi(page)
      await open(page, tab, tab === 'superadmins' ? SUPERADMIN : ADMIN, tab === 'superadmins' ? '/superadmin' : '/admin')
      await fillInvite(page, tab)
      await expect(sheet(page, tab).getByText(/Sign-in email/)).toHaveCount(0)
      await send(page, tab).click()

      const done = sent(page)
      await expect(done).toBeVisible()
      await expect(done).toContainText('Invitation sent to maya.lopez@example.com. They will set their own password from the email link.')
      await expect(done.getByText(/Temporary password|Copy|Download/)).toHaveCount(0)
      expect(api.invites).toEqual([
        { email: 'maya.lopez@example.com', firstName: 'Maya', lastName: 'Lopez', role: NOUN[tab], redirectTo: `${baseURL}/auth/callback` },
      ])
      expect(api.invites[0]).not.toHaveProperty('password')
      await done.getByRole('button', { name: 'Done', exact: true }).click()
      await expect(done).toHaveCount(0)
      await expect(visibleText(page, 'Maya Lopez')).toBeVisible()
    })
  }

  test('shows a message under each field that is wrong, keeps emoji out, and sends nothing', async ({ page }) => {
    api = await stubUsersApi(page)
    await open(page)
    await addButton(page).click()
    await send(page).click()
    for (const label of ['First name', 'Last name', 'Email']) await expect(sheet(page).getByLabel(label)).toHaveAttribute('aria-invalid', 'true')
    await sheet(page).getByLabel('First name').fill('Ana123 😀')
    await expect(sheet(page).getByLabel('First name')).toHaveValue(/^Ana\s?$/)
    await sheet(page).getByLabel('Email').fill('not-an-email')
    await send(page).click()
    await expect(sheet(page).getByText(/valid email/)).toBeVisible()
    expect(api.invites).toEqual([])
    await sheet(page).getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(sheet(page)).toHaveCount(0)
  })

  test('a double click sends one invitation and the button is busy while pending', async ({ page }) => {
    api = await stubUsersApi(page)
    api.onInvite = () => new Promise((resolve) => setTimeout(() => resolve(false), 500))
    await open(page)
    await fillInvite(page, 'staff')
    await send(page).dblclick()
    await expect(send(page)).toBeDisabled()
    await expect(sent(page)).toBeVisible()
    expect(api.invites).toHaveLength(1)
  })

  for (const [status, body, title] of [
    [409, { message: 'A user with this email address already exists' }, 'That email already has an account.'],
    [403, { message: "Cannot assign role 'superadmin'" }, "You can't invite staff accounts."],
    [400, { message: ['email must be an email'] }, 'The server rejected the details.'],
    [429, {}, 'Too many requests.'],
    [500, {}, 'No invitation was sent.'],
  ] as const) {
    test(`a ${status} explains what happened and keeps the form usable`, async ({ page }) => {
      api = await stubUsersApi(page)
      let fail = true
      api.onInvite = (route) => (fail ? json(route, status, body).then(() => true) : false)
      await open(page)
      await fillInvite(page, 'staff')
      await send(page).click()
      await expect(sheet(page).getByRole('alert')).toContainText(title)
      await expect(sheet(page).getByLabel('Email')).toHaveValue('Maya.Lopez@Example.com'.replace(/\s/g, ''))
      fail = false
      await send(page).click()
      await expect(sent(page)).toBeVisible()
    })
  }

  test('sends the optional fields when filled, and the list then shows the full name with middle name and suffix', async ({ page }) => {
    api = await stubUsersApi(page)
    await open(page)
    await fillInvite(page, 'staff')
    await sheet(page).getByLabel('Middle name (optional)').fill('Reyes')
    await sheet(page).getByLabel('Suffix (optional)').fill('Jr.')
    await sheet(page).getByLabel('Birthday (optional)').fill('1998-04-23')
    await sheet(page).getByRole('combobox', { name: 'Gender (optional)' }).click()
    await page.getByRole('option', { name: 'Unisex', exact: true }).click()
    await send(page).click()
    await expect(sent(page)).toBeVisible()
    expect(api.invites).toEqual([
      { email: 'maya.lopez@example.com', firstName: 'Maya', middleName: 'Reyes', lastName: 'Lopez', suffix: 'Jr.', birthday: '1998-04-23', gender: 'unisex', role: 'staff', redirectTo: expect.stringMatching(/\/auth\/callback$/) },
    ])
    await sent(page).getByRole('button', { name: 'Done', exact: true }).click()
    await expect(visibleText(page, 'Maya Reyes Lopez Jr.')).toBeVisible()
  })

  test('skipping every optional field sends none of their keys', async ({ page }) => {
    api = await stubUsersApi(page)
    await open(page)
    await fillInvite(page, 'staff')
    await send(page).click()
    await expect(sent(page)).toBeVisible()
    expect(Object.keys(api.invites[0])).toEqual(['email', 'firstName', 'lastName', 'role', 'redirectTo'])
  })

  test('a birthday of today or later is refused next to the field, and nothing is sent', async ({ page }) => {
    api = await stubUsersApi(page)
    await open(page)
    await fillInvite(page, 'staff')
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const birthday = sheet(page).getByLabel('Birthday (optional)')
    for (const value of [today, '2999-01-01']) {
      await birthday.fill(value)
      await send(page).click()
      await expect(sheet(page).getByText('Birthday must be a past date. Pick a day before today.')).toBeVisible()
      await expect(birthday).toHaveAttribute('aria-invalid', 'true')
      await expect(birthday).toBeFocused()
    }
    expect(api.invites).toEqual([])
    await birthday.fill('2000-01-31')
    await send(page).click()
    await expect(sent(page)).toBeVisible()
  })

  test('names at their limits are accepted, counted and sent within the backend limits (100, suffix 20)', async ({ page }) => {
    api = await stubUsersApi(page)
    await open(page)
    const forty = `${'A'.repeat(19)} ${'B'.repeat(20)}`
    await fillInvite(page, 'staff', forty, forty)
    await sheet(page).getByLabel('Middle name (optional)').fill(`${forty}XYZ`)
    await sheet(page).getByLabel('Suffix (optional)').fill('Junior')
    await expect(sheet(page).getByLabel('Suffix (optional)')).toHaveValue('Junio')
    await expect(sheet(page).getByText('40/40')).toHaveCount(3)
    await expect(sheet(page).getByText('5/5')).toBeVisible()
    await send(page).click()
    await expect(sent(page)).toBeVisible()
    const body = api.invites[0]
    for (const value of [body.firstName, body.middleName, body.lastName]) expect(value!.length).toBeLessThanOrEqual(40)
    expect(body.suffix!.length).toBeLessThanOrEqual(20)
  })

  test('the stub refuses a body with a key the backend does not declare, like its ValidationPipe', () => {
    const ok = { email: 'a@b.co', firstName: 'A', lastName: 'B', role: 'staff', redirectTo: 'http://localhost:5173/auth/callback' }
    expect(inviteProblems(ok)).toEqual([])
    expect(inviteProblems({ ...ok, fullName: 'A B' })).toEqual(['property fullName should not exist'])
    expect(inviteProblems({ ...ok, gender: 'robot', birthday: 'tomorrow' })).toHaveLength(2)
  })

  test('no horizontal scroll at 320px with the list, the form and the confirmation', async ({ page }) => {
    await stubUsersApi(page)
    await page.setViewportSize({ width: 320, height: 700 })
    await open(page)
    await expect(visibleText(page, 'Lara Santos')).toBeVisible()
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
    await fillInvite(page, 'staff', 'Wide', 'Name', 'a.very.long.email.address.for.overflow.checks@subdomain.example.com')
    await sheet(page).getByLabel('Middle name (optional)').fill(`${'W'.repeat(19)} ${'i'.repeat(20)}`)
    await sheet(page).getByLabel('Birthday (optional)').fill('1998-04-23')
    await sheet(page).getByLabel('Suffix (optional)').fill('III')
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
    expect(await sheet(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
    await send(page).click()
    await expect(sent(page)).toBeVisible()
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('password reset email', () => {
  let api: UsersStub

  test('asks first, then posts the row email to Supabase /auth/v1/recover with the callback redirect, and toasts', async ({ page, baseURL }) => {
    api = await stubUsersApi(page)
    await open(page)
    await action(page, 'Send password reset email to Lara Santos').click()
    const dialog = page.getByRole('dialog', { name: 'Send a password reset email to Lara Santos?' })
    await expect(dialog).toContainText('lara.santos@silhoufit.dev')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(api.recoveries).toEqual([])

    await action(page, 'Send password reset email to Lara Santos').click()
    await dialog.getByRole('button', { name: 'Send Reset Email', exact: true }).click()
    await expect(page.getByText('Password reset email sent to lara.santos@silhoufit.dev')).toBeVisible()
    expect(api.recoveries).toEqual([{ email: 'lara.santos@silhoufit.dev', redirectTo: `${baseURL}/auth/callback` }])
  })

  test('a superadmin can send it for an admin; an admin has no actions on the Admins tab', async ({ page }) => {
    await stubUsersApi(page)
    await open(page, 'admins', ADMIN)
    await expect(visibleText(page, 'Brian Dijamco')).toBeVisible()
    await expect(page.getByRole('button', { name: /reset email|Deactivate|Activate/ })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0)
  })

  test('the superadmin sees the actions on the Admins tab', async ({ page }) => {
    await stubUsersApi(page)
    await open(page, 'admins', SUPERADMIN, '/superadmin')
    await expect(action(page, 'Send password reset email to Brian Dijamco')).toBeVisible()
    await expect(action(page, 'Deactivate Brian Dijamco')).toBeVisible()
  })

  for (const [status, text, retry] of [
    [429, 'limits how many emails', false],
    [500, 'Retry in a moment', true],
  ] as const) {
    test(`a ${status} from Supabase is explained${retry ? ', with Retry' : ', without Retry'}`, async ({ page }) => {
      api = await stubUsersApi(page)
      api.onRecover = (route) => json(route, status, { msg: 'nope' }).then(() => true)
      await open(page)
      await action(page, 'Send password reset email to Lara Santos').click()
      await page.getByRole('dialog').getByRole('button', { name: 'Send Reset Email', exact: true }).click()
      await expect(page.getByText(text)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(retry ? 1 : 0)
    })
  }
})

test.describe('deactivate and activate', () => {
  let api: UsersStub

  test('an active row has Deactivate (after a question) and Undo; the Inactive filter then offers Activate', async ({ page }) => {
    api = await stubUsersApi(page)
    await open(page)
    await action(page, 'Deactivate Lara Santos').click()
    const dialog = page.getByRole('dialog', { name: 'Deactivate Lara Santos?' })
    await expect(dialog).toContainText('Are you sure?')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(api.deactivations).toEqual([])

    await action(page, 'Deactivate Lara Santos').click()
    await dialog.getByRole('button', { name: 'Deactivate Staff', exact: true }).click()
    await expect(page.getByText('Lara Santos deactivated.')).toBeVisible()
    expect(api.deactivations).toHaveLength(1)
    await expect(visibleText(page, 'Lara Santos')).toBeHidden()

    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(page.getByText('Deactivation undone. Lara Santos can sign in again.')).toBeVisible()
    expect(api.activations).toEqual(api.deactivations)
    await expect(visibleText(page, 'Lara Santos')).toBeVisible()
  })

  test('Activate on an inactive row runs at once and the row returns to Active', async ({ page }) => {
    api = await stubUsersApi(page, [inactive(userRow('staff', 'Off', 'Duty', 40)), ...SAMPLE_USERS])
    await open(page)
    await page.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'Inactive', exact: true }).click()
    await expect(action(page, 'Activate Off Duty')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Deactivate Off Duty' })).toHaveCount(0)
    await action(page, 'Activate Off Duty').click()
    await expect(page.getByText(/Off Duty activated\./)).toBeVisible()
    expect(api.activations).toHaveLength(1)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('a double click sends one request while it is pending', async ({ page }) => {
    api = await stubUsersApi(page)
    api.onDeactivate = () => new Promise((resolve) => setTimeout(() => resolve(false), 500))
    await open(page)
    await action(page, 'Deactivate Lara Santos').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate Staff', exact: true }).dblclick()
    await expect(page.getByText('Lara Santos deactivated.')).toBeVisible()
    expect(api.deactivations).toHaveLength(1)
  })

  for (const [status, body, text, retry] of [
    [403, { message: 'You cannot deactivate your own account' }, "can't deactivate your own account", false],
    [403, { message: "Cannot deactivate a user with role 'admin': insufficient authority" }, "isn't allowed to deactivate staff", false],
    [403, { message: 'User account is deactivated' }, 'Your own account has been deactivated', false],
    [404, {}, 'no longer exists', false],
    [429, {}, 'Too many requests were sent', false],
    [500, {}, "couldn't confirm the result", true],
  ] as const) {
    test(`a ${status} (${text}) is explained${retry ? ', with Retry' : ''}`, async ({ page }) => {
      api = await stubUsersApi(page)
      api.onDeactivate = (route) => json(route, status, body).then(() => true)
      await open(page)
      await action(page, 'Deactivate Lara Santos').click()
      await page.getByRole('dialog').getByRole('button', { name: 'Deactivate Staff', exact: true }).click()
      await expect(page.getByText(text, { exact: false })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(retry ? 1 : 0)
    })
  }

  test('deactivating an admin as a superadmin uses the admin wording and the same route', async ({ page }) => {
    api = await stubUsersApi(page)
    await open(page, 'admins', SUPERADMIN, '/superadmin')
    await action(page, 'Deactivate Brian Dijamco').click()
    await page.getByRole('dialog', { name: 'Deactivate Brian Dijamco?' }).getByRole('button', { name: 'Deactivate Admin', exact: true }).click()
    await expect(page.getByText('Brian Dijamco deactivated.')).toBeVisible()
    expect(api.deactivations).toHaveLength(1)
  })

  test('the Superadmins tab has no row actions or status filter', async ({ page }) => {
    await stubUsersApi(page)
    await open(page, 'superadmins', SUPERADMIN, '/superadmin')
    await expect(visibleText(page, 'Brian Dijamco')).toBeVisible()
    await expect(page.getByRole('button', { name: /reset email|Deactivate|Activate/ })).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveCount(0)
  })
})
