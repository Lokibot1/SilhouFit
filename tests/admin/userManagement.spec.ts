import { expect, test, type Locator, type Page } from '@playwright/test'

// Admin dashboard and User Management. The accounts are simulated and saved in the browser (localStorage), and the dev-only simulated
// sign-in answers for them before Supabase is asked, so nothing is mocked here. Every test gets a fresh browser context, so it starts
// from the sample accounts. Each test signs in through the real form.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const STAFF = { email: 'sam.reyes@silhoufit.dev', password: 'Staff@12345' }
const FIRST_LOGIN = { email: 'grace.tan@silhoufit.dev', password: 'Staff@12345' }
const ARCHIVED = { email: 'erwin.salazar@silhoufit.dev', password: 'Staff@12345' }

test.beforeEach(async ({ page }) => {
  // Keep the cookie banner out of the way.
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

const toast = (page: Page, text: string | RegExp) => page.getByText(text).first()
/** The first match that is on screen: the table and the cards both render every row, and only one of them is displayed. */
const seen = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true }).first()
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function signIn(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

async function signInAsAdmin(page: Page, to = '/admin') {
  await signIn(page, ADMIN)
  await expect(page).toHaveURL(/\/admin$/)
  if (to !== '/admin') await page.goto(to)
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: /^Account, / }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
}

const tab = (page: Page, name: 'Customers' | 'Staff' | 'Admins') => page.getByRole('tab', { name, exact: true })
const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name })
const addStaff = (page: Page) => page.getByRole('button', { name: 'Add staff account', exact: true })

/** The value shown under a label ("Username", "Temporary password") in the credentials card. */
const credential = (scope: Locator, label: string) => scope.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]')

async function createAccount(page: Page, noun: 'staff' | 'admin', first: string, last: string, { opened = false } = {}) {
  if (!opened) await page.getByRole('button', { name: `Add ${noun} account`, exact: true }).click()
  const sheet = dialog(page, `Add ${noun} account`)
  await sheet.getByLabel('First name').fill(first)
  await sheet.getByLabel('Last name').fill(last)
  await sheet.getByRole('button', { name: 'Create account', exact: true }).click()
  const done = dialog(page, /account created/)
  await expect(done).toBeVisible()
  return {
    done,
    username: (await credential(done, 'Username').innerText()).trim(),
    password: (await credential(done, 'Temporary password').innerText()).trim(),
    email: (await credential(done, 'Sign-in email').innerText()).trim(),
  }
}

/** Opens the sidebar (on a phone it is the menu drawer) and returns its navigation. */
async function nav(page: Page) {
  const open = page.getByRole('button', { name: 'Open menu', exact: true })
  const toggle = page.getByRole('button', { name: /^(Collapse|Expand) sidebar$/ })
  await expect(open.or(toggle)).toBeVisible()
  if (await open.isVisible()) await open.click()
  return page.getByRole('navigation', { name: /^(Admin|Staff)$/ })
}

test.describe('sign-in and shell', () => {
  test('the dev admin signs in from /login and lands on the dashboard, with Operations and Admin tools in the sidebar', async ({ page }) => {
    await signInAsAdmin(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Hello, Dev' })).toBeVisible()
    await expect(page).toHaveTitle('Admin dashboard — SilhouFit')
    const sidebar = await nav(page)
    await expect(sidebar.getByText('Operations', { exact: true })).toBeVisible()
    await expect(sidebar.getByText('Admin tools', { exact: true })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'User Management', exact: true })).toHaveAttribute('href', '/admin/users')
    await expect(sidebar.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page')
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })

  test('a wrong admin password is refused', async ({ page }) => {
    await signIn(page, { email: ADMIN.email, password: 'Wrong@12345' })
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText(/We couldn't sign you in/).first()).toBeVisible()
  })

  for (const [path, name] of [
    ['/admin/inventory', 'Inventory'],
    ['/admin/transactions', 'Transactions'],
    ['/admin/measurements', 'Measurements'],
  ] as const) {
    test(`the shared staff page ${path} loads and highlights ${name} in the sidebar`, async ({ page }) => {
      await signInAsAdmin(page, path)
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      const sidebar = await nav(page)
      await expect(sidebar.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(sidebar.getByRole('link', { name: 'Dashboard', exact: true })).not.toHaveAttribute('aria-current', 'page')
    })
  }

  test('a staff user opening /admin/users is sent to /staff with a notice', async ({ page }) => {
    await signIn(page, STAFF)
    await expect(page).toHaveURL(/\/staff$/)
    await page.goto('/admin/users')
    await expect(page).toHaveURL(/\/staff$/)
    await expect(toast(page, 'That page is for another role. This is your dashboard.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'User management' })).toHaveCount(0)
  })
})

test.describe('customers', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page, '/admin/users')
  })

  test('opens on Customers and lists ten customers per page with a pager', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'User management' })).toBeVisible()
    await expect(tab(page, 'Customers')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: /@example\.com/ })).toHaveCount(10)
    await expect(page.getByRole('button', { name: /@silhoufit\.dev/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible()
  })

  test('searches by name and by email, then shows the empty-search state and clears it', async ({ page }) => {
    const search = page.getByLabel('Search customers by name, username, email or phone')
    await search.fill('Katrina')
    await expect(page.getByRole('button', { name: /Katrina Ocampo/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Maria Santos/ })).toHaveCount(0)

    await search.fill('Paolo Torres')
    await expect(page.getByRole('button', { name: /Paolo Torres/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Katrina Ocampo/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /@example\.com/ })).toHaveCount(1)

    await search.fill('zzzz-nobody')
    await expect(page.getByText('No customers match')).toBeVisible()
    await expect(page.getByText('Check the spelling, or clear the search and status filter and try again.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await expect(search).toHaveValue('')
    await expect(page.getByRole('button', { name: /@example\.com/ })).toHaveCount(10)
  })

  test('searching a whole email finds only that customer', async ({ page }) => {
    await page.getByLabel('Search customers by name, username, email or phone').fill('paolo.torres8@example.com')
    await expect(page.getByRole('button', { name: /Paolo Torres/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /@example\.com/ })).toHaveCount(1)
  })

  test('filters by status', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'Inactive', exact: true }).click()
    await expect(page.getByRole('button', { name: /Jasmine Dela Cruz/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Maria Santos/ })).toHaveCount(0)
  })

  test('opens a customer drawer with the profile, their orders linking to Transactions, and the Transactions sub-tab', async ({ page }) => {
    await page.getByLabel('Search customers by name, username, email or phone').fill('Maria Santos')
    await page.getByRole('button', { name: /Maria Santos/ }).click()
    const drawer = dialog(page, 'Maria Santos')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText('maria.santos1@example.com')).toBeVisible()
    await expect(drawer.getByRole('tab', { name: 'Orders', exact: true })).toHaveAttribute('aria-selected', 'true')
    const orders = drawer.getByRole('list', { name: 'Orders' })
    await expect(orders).toBeVisible()
    const link = orders.getByRole('link').first()
    const orderNo = (await link.innerText()).trim()
    expect(orderNo).toMatch(/^SF-/)

    await drawer.getByRole('tab', { name: 'Transactions', exact: true }).click()
    const payments = drawer.getByRole('list', { name: 'Transactions' })
    await expect(payments).toBeVisible()
    await expect(payments.getByText(orderNo)).toBeVisible()

    await drawer.getByRole('tab', { name: 'Orders', exact: true }).click()
    await orders.getByRole('link').first().click()
    await expect(page).toHaveURL(new RegExp(`/admin/transactions\\?q=${orderNo}`))
  })

  test('Escape closes the drawer and returns focus to the customer', async ({ page }) => {
    await page.getByLabel('Search customers by name, username, email or phone').fill('Maria Santos')
    const row = page.getByRole('button', { name: /Maria Santos/ })
    await row.click()
    await expect(dialog(page, 'Maria Santos')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page, 'Maria Santos')).toHaveCount(0)
    await expect(row).toBeFocused()
  })
})

test.describe('staff accounts', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page, '/admin/users?tab=staff')
    await expect(tab(page, 'Staff')).toHaveAttribute('aria-selected', 'true')
  })

  test('lists the seeded staff and filters Archived', async ({ page }) => {
    await expect(seen(page, 'Sam Reyes')).toBeVisible()
    await expect(seen(page, 'Erwin Salazar')).toBeVisible()
    await page.getByRole('combobox', { name: 'Status' }).click()
    await expect(page.getByRole('option', { name: 'Archived', exact: true })).toBeVisible()
    await page.getByRole('option', { name: 'Archived', exact: true }).click()
    await expect(seen(page, 'Erwin Salazar')).toBeVisible()
    await expect(seen(page, 'Hannah Uy')).toBeVisible()
    await expect(seen(page, 'Sam Reyes')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Restore Erwin Salazar', exact: true })).toBeVisible()
  })

  test('searches staff by email and by username', async ({ page }) => {
    const search = page.getByLabel('Search staff by name, username, email or phone')
    await search.fill('liza.fernandez@silhoufit.dev')
    await expect(seen(page, 'Liza Fernandez')).toBeVisible()
    await expect(seen(page, 'Sam Reyes')).toBeHidden()
    await search.fill('ramon')
    await expect(seen(page, 'Ramon Dizon')).toBeVisible()
    await expect(seen(page, 'Liza Fernandez')).toBeHidden()
    await search.fill('zzz-nobody')
    await expect(page.getByText('No staff accounts match')).toBeVisible()
  })

  test('shows a message under each field that is wrong, and nothing is created', async ({ page }) => {
    await addStaff(page).click()
    const sheet = dialog(page, 'Add staff account')
    await sheet.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(sheet.getByText(/first name/i).filter({ hasText: /enter|required|letters/i }).first()).toBeVisible()
    await expect(sheet.getByLabel('First name')).toHaveAttribute('aria-invalid', 'true')
    await expect(sheet.getByLabel('Last name')).toHaveAttribute('aria-invalid', 'true')

    // Names keep letters only and emoji are dropped as they are typed.
    await sheet.getByLabel('First name').fill('Ana123 😀')
    await expect(sheet.getByLabel('First name')).toHaveValue(/^Ana\s?$/)
    // The phone keeps digits and "+", and counts at most 13 characters.
    await sheet.getByLabel('Last name').fill('Lim')
    await sheet.getByLabel(/^Phone/).fill('abc12')
    await expect(sheet.getByLabel(/^Phone/)).toHaveValue('12')
    await sheet.getByLabel(/^Phone/).fill('+639171')
    await sheet.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(sheet.getByText(/at least \d+ digits/)).toBeVisible()
    await sheet.getByLabel(/^Phone/).fill('+6391712345678901')
    await sheet.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(sheet.getByText(/at most 13 characters/)).toBeVisible()
    await expect(sheet.getByLabel(/^Phone/)).toHaveAttribute('aria-invalid', 'true')

    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    await expect(page.getByText('Ana Lim')).toBeHidden()
  })

  test('previews the username before creating, and a second person with the same name gets a different one', async ({ page }) => {
    await addStaff(page).click()
    const sheet = dialog(page, 'Add staff account')
    await sheet.getByLabel('First name').fill('Sam')
    await sheet.getByLabel('Last name').fill('Reyes')
    // sam.reyes is already taken by a seeded account, so the preview must not offer it.
    const preview = credential(sheet, 'Username')
    await expect(preview).not.toHaveText('Enter both names to see it')
    expect(((await preview.innerText()).trim())).not.toBe('sam.reyes')
    await expect(sheet.getByText(/@silhoufit\.dev$/).first()).toBeVisible()
  })

  test('creates a staff account: distinct credentials, copy feedback, a PNG download, and a new row', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const created = await createAccount(page, 'staff', 'Maya', 'Lopez')
    expect(created.username).toBe('maya.lopez')
    expect(created.email).toBe('maya.lopez@silhoufit.dev')
    expect(created.password.length).toBeGreaterThanOrEqual(8)
    expect(created.password).not.toBe(created.username)
    await expect(created.done.getByText('Demo only, not secure', { exact: false })).toBeVisible()

    await created.done.getByRole('button', { name: 'Copy username', exact: true }).click()
    await expect(toast(page, 'Username copied')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(created.username)

    await created.done.getByRole('button', { name: 'Copy temporary password', exact: true }).click()
    await expect(toast(page, 'Password copied')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(created.password)

    await created.done.getByRole('button', { name: 'Copy both', exact: true }).click()
    await expect(toast(page, 'Credentials copied')).toBeVisible()
    const both = await page.evaluate(() => navigator.clipboard.readText())
    expect(both).toContain(created.username)
    expect(both).toContain(created.password)

    const download = page.waitForEvent('download')
    await created.done.getByRole('button', { name: 'Download image', exact: true }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('silhoufit-maya.lopez-credentials.png')
    await expect(toast(page, 'Credentials image downloaded')).toBeVisible()

    await expect(created.done.getByRole('button', { name: 'Print', exact: true })).toBeVisible()
    await created.done.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(created.done).toHaveCount(0)
    await expect(seen(page, 'Maya Lopez')).toBeVisible()
    await expect(seen(page, 'maya.lopez')).toBeVisible()
  })

  test('shows a blocked-clipboard message instead of a false success when copying is not allowed', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true })
    })
    await page.reload()
    const created = await createAccount(page, 'staff', 'Rita', 'Chan')
    await created.done.getByRole('button', { name: 'Copy username', exact: true }).click()
    await expect(toast(page, /Couldn't copy the username/)).toBeVisible()
  })

  test('the new staff signs in with the shown credentials, sees the first-login gate, and can skip it', async ({ page }) => {
    const created = await createAccount(page, 'staff', 'Nina', 'Park')
    await created.done.getByRole('button', { name: 'Done', exact: true }).click()
    await signOut(page)

    await signIn(page, { email: created.email, password: created.password })
    await expect(page).toHaveURL(/\/staff$/)
    const gate = dialog(page, 'Choose a new password')
    await expect(gate).toBeVisible()
    await gate.getByRole('button', { name: 'Skip for now', exact: true }).click()
    await expect(gate).toHaveCount(0)
    await expect(toast(page, 'Password change skipped. You will be asked again the next time you sign in.')).toBeVisible()
    await expect(page).toHaveURL(/\/staff$/)
  })

  test('skipping the first-login screen lasts for the session only: it returns at the next sign-in', async ({ page }) => {
    const created = await createAccount(page, 'staff', 'Ivy', 'Tan')
    await created.done.getByRole('button', { name: 'Done', exact: true }).click()
    await signOut(page)
    await signIn(page, { email: created.email, password: created.password })
    await dialog(page, 'Choose a new password').getByRole('button', { name: 'Skip for now', exact: true }).click()
    await signOut(page)
    await signIn(page, { email: created.email, password: created.password })
    await expect(dialog(page, 'Choose a new password')).toBeVisible()
  })

  test('changing the password at first sign-in clears the gate for the next sign-in', async ({ page }) => {
    await signOut(page)
    await signIn(page, FIRST_LOGIN)
    const gate = dialog(page, 'Choose a new password')
    await expect(gate).toBeVisible()

    await gate.getByRole('button', { name: 'Save password', exact: true }).click()
    await expect(gate.getByText('Type the new password again.')).toBeVisible()
    await gate.getByLabel('New password', { exact: true }).fill('short')
    await gate.getByLabel('Confirm new password').fill('different')
    await gate.getByRole('button', { name: 'Save password', exact: true }).click()
    await expect(gate.getByText('The two passwords do not match.')).toBeVisible()

    const next = 'Grace@New2026!'
    await gate.getByLabel('New password', { exact: true }).fill(next)
    await gate.getByLabel('Confirm new password').fill(next)
    await gate.getByRole('button', { name: 'Save password', exact: true }).click()
    // The save is simulated and can be slow when the machine is busy, so give it longer than the default.
    await expect(gate).toHaveCount(0, { timeout: 15_000 })
    await expect(toast(page, 'Password updated. Use it the next time you sign in.')).toBeVisible()

    await signOut(page)
    await signIn(page, { email: FIRST_LOGIN.email, password: FIRST_LOGIN.password })
    await expect(page.getByText(/We couldn't sign you in/).first()).toBeVisible()
    await signIn(page, { email: FIRST_LOGIN.email, password: next })
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Hello, Grace' })).toBeVisible()
    await expect(dialog(page, 'Choose a new password')).toHaveCount(0)
  })

  test('reset password: Cancel changes nothing; confirming shows new credentials, the old password fails and the new one works', async ({ page }) => {
    await page.getByRole('button', { name: 'Reset password for Sam Reyes', exact: true }).click()
    const ask = dialog(page, 'Reset password for Sam Reyes?')
    await expect(ask.getByText('Are you sure?')).toBeVisible()
    await ask.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(ask).toHaveCount(0)
    await expect(dialog(page, 'Password reset')).toHaveCount(0)

    await page.getByRole('button', { name: 'Reset password for Sam Reyes', exact: true }).click()
    await ask.getByRole('button', { name: 'Reset password', exact: true }).click()
    const issued = dialog(page, 'Password reset')
    await expect(issued).toBeVisible()
    const username = (await credential(issued, 'Username').innerText()).trim()
    const password = (await credential(issued, 'Temporary password').innerText()).trim()
    expect(username).toBe('sam.reyes')
    expect(password).not.toBe(STAFF.password)
    await issued.getByRole('button', { name: 'Done', exact: true }).click()

    // The account is flagged and the reset is logged.
    await expect(page.getByText('Password change due').filter({ visible: true }).first()).toBeVisible()
    await page.goto('/admin')
    await expect(page.getByText('Password reset: Sam Reyes').first()).toBeVisible()

    await signOut(page)
    await signIn(page, STAFF)
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText(/We couldn't sign you in/).first()).toBeVisible()
    await signIn(page, { email: STAFF.email, password })
    await expect(page).toHaveURL(/\/staff$/)
    // The new password is temporary: the first-login screen appears.
    await expect(dialog(page, 'Choose a new password')).toBeVisible()
  })

  test('archive: confirm marks the row, Undo restores it, and the archived account cannot sign in until restored', async ({ page }) => {
    // Cancel first.
    await page.getByRole('button', { name: 'Archive Sam Reyes', exact: true }).click()
    const ask = dialog(page, 'Archive Sam Reyes?')
    await expect(ask.getByText('Are you sure?')).toBeVisible()
    await ask.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Archive Sam Reyes', exact: true })).toBeVisible()

    // Confirm, then Undo from the toast.
    await page.getByRole('button', { name: 'Archive Sam Reyes', exact: true }).click()
    await ask.getByRole('button', { name: 'Archive account', exact: true }).click()
    await expect(toast(page, 'Sam Reyes archived')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Restore Sam Reyes', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Archive Sam Reyes', exact: true })).toBeVisible()

    // Archive again for good: signing in is blocked with the archived banner.
    await page.getByRole('button', { name: 'Archive Sam Reyes', exact: true }).click()
    await ask.getByRole('button', { name: 'Archive account', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Restore Sam Reyes', exact: true })).toBeVisible()
    await signOut(page)
    await signIn(page, STAFF)
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText('This account has been archived.')).toBeVisible()

    // Restore as admin, then the login works.
    await signIn(page, ADMIN)
    await page.goto('/admin/users?tab=staff')
    await page.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'Archived', exact: true }).click()
    await expect(seen(page, 'Sam Reyes')).toBeVisible()
    await page.getByRole('button', { name: 'Restore Sam Reyes', exact: true }).click()
    await expect(toast(page, 'Sam Reyes restored')).toBeVisible()
    await signOut(page)
    await signIn(page, STAFF)
    await expect(page).toHaveURL(/\/staff$/)
  })

  test('a seeded archived account is blocked at sign-in with the archived banner', async ({ page }) => {
    await signOut(page)
    await signIn(page, ARCHIVED)
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText('This account has been archived.')).toBeVisible()
    await expect(page.getByText('Contact an administrator to have it restored.').first()).toBeVisible()
  })
})

test.describe('admin accounts', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page, '/admin/users?tab=admins')
    await expect(tab(page, 'Admins')).toHaveAttribute('aria-selected', 'true')
  })

  test('has no Archive action on any row and no Archived filter', async ({ page }) => {
    await expect(seen(page, 'Brian Dijamco')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Archive/ })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Archive/ })).toHaveCount(0)
    // An admin's password cannot be reset by another admin, so rows have no actions at all.
    await expect(page.getByRole('button', { name: /^Reset password|^Restore/ })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0)
    await expect(page.getByText(/archive/i)).toHaveCount(0)

    await page.getByRole('combobox', { name: 'Status' }).click()
    await expect(page.getByRole('option', { name: 'Active', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Archived' })).toHaveCount(0)
  })

  test('has no reset-password control on any admin row, including the signed-in admin (the service refusal is in accountService.test.ts)', async ({ page }) => {
    await expect(seen(page, 'Alyssa Ferrer')).toBeVisible()
    await expect(page.getByRole('button', { name: /Reset password/i })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Reset/i })).toHaveCount(0)
  })

  test('creates another admin who can sign in and reach User Management', async ({ page }) => {
    const created = await createAccount(page, 'admin', 'Lena', 'Cruz')
    await created.done.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(seen(page, 'Lena Cruz')).toBeVisible()
    await signOut(page)

    await signIn(page, { email: created.email, password: created.password })
    await expect(page).toHaveURL(/\/admin$/)
    // A new admin is on a temporary password too, so skip the first-login screen to reach the page.
    const gate = dialog(page, 'Choose a new password')
    await expect(gate).toBeVisible()
    await gate.getByRole('button', { name: 'Skip for now', exact: true }).click()
    await expect(gate).toHaveCount(0)
    await (await nav(page)).getByRole('link', { name: 'User Management', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/users/)
    await expect(page.getByRole('heading', { level: 1, name: 'User management' })).toBeVisible()
  })
})

test.describe('navigation and persistence', () => {
  test('accounts created survive a reload', async ({ page }) => {
    await signInAsAdmin(page, '/admin/users?tab=staff')
    const created = await createAccount(page, 'staff', 'Omar', 'Diaz')
    await created.done.getByRole('button', { name: 'Done', exact: true }).click()
    await page.reload()
    await expect(seen(page, 'Omar Diaz')).toBeVisible()
    await expect(page).toHaveURL(/tab=staff/)
  })

  test('tabs follow ?tab= and the Back button steps out instead of looping', async ({ page }) => {
    await signInAsAdmin(page, '/admin/users')
    await expect(tab(page, 'Customers')).toHaveAttribute('aria-selected', 'true')
    await tab(page, 'Staff').click()
    await expect(page).toHaveURL(/tab=staff/)
    await tab(page, 'Admins').click()
    await expect(page).toHaveURL(/tab=admins/)
    await expect(page.getByRole('button', { name: 'Add admin account', exact: true })).toBeVisible()

    await page.goto('/admin/users?tab=nonsense')
    await expect(tab(page, 'Customers')).toHaveAttribute('aria-selected', 'true')

    // Tab changes replace the entry, so Back leaves User Management rather than trapping the user in it.
    await page.goto('/admin')
    await page.goto('/admin/users?tab=staff')
    await tab(page, 'Admins').click()
    await page.goBack()
    await expect(page).toHaveURL(/\/admin$/)
  })

  test('keyboard: the tabs move with the arrow keys', async ({ page }) => {
    await signInAsAdmin(page, '/admin/users')
    await tab(page, 'Customers').focus()
    await page.keyboard.press('ArrowRight')
    await expect(tab(page, 'Staff')).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/tab=staff/)
  })

  test('the dashboard shows the account figures and links to User Management', async ({ page }) => {
    await signInAsAdmin(page)
    const figures = page.getByRole('region', { name: 'Accounts at a glance' })
    for (const label of ['Customers', 'Staff', 'Admins', 'Refunds', 'AR-ready products', 'Low or out of stock']) await expect(figures.getByText(label, { exact: true })).toBeVisible()
    for (const gone of ['Active accounts', 'Archived staff', 'First sign-in due']) await expect(page.getByText(gone, { exact: true })).toHaveCount(0)
    await expect(page.getByText('Recent activity')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Activity Logs' })).toBeVisible()
    await page.getByRole('link', { name: 'Manage users', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/users/)
  })
})

test.describe('dashboard columns', () => {
  for (const width of [1280, 1440, 1920]) {
    test(`Recent orders ends level with Trendy items at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await signInAsAdmin(page)
      const orders = page.locator('section[aria-labelledby="order-log"]')
      const trendy = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Trendy items', exact: true }) })
      await expect(orders.getByRole('listitem').first()).toBeVisible()
      await expect(trendy.getByRole('listitem').first()).toBeVisible()
      const [o, t] = [await orders.boundingBox(), await trendy.boundingBox()]
      const [oBottom, tBottom] = [o!.y + o!.height, t!.y + t!.height]
      expect(oBottom).toBeLessThanOrEqual(tBottom + 1)
      expect(tBottom - oBottom).toBeLessThanOrEqual(8)
      // Several rows stay visible, and the rest scroll.
      expect(o!.height).toBeGreaterThan(300)
    })
  }
})

test.describe('summary card links', () => {
  const CARDS: [RegExp, RegExp][] = [
    [/^Customers: \d+, open customer list$/, /\/admin\/users\?tab=customers$/],
    [/^Staff: \d+, open staff list$/, /\/admin\/users\?tab=staff$/],
    [/^Admins: \d+, open admin list$/, /\/admin\/users\?tab=admins$/],
    [/^Refunds: .*open transactions$/, /\/admin\/transactions$/],
    [/^AR-ready products: \d+, /, /\/admin\/inventory\?ar=yes$/],
    [/^Low or out of stock: \d+, /, /\/admin\/inventory$/],
  ]
  for (const [name, url] of CARDS) {
    test(`the ${name.source.split(':')[0].replace('^', '')} card opens its page`, async ({ page }) => {
      await signInAsAdmin(page)
      const card = page.getByRole('link', { name })
      await expect(card).toBeVisible()
      await card.click()
      await expect(page).toHaveURL(url)
    })
  }
})

test.describe('layout', () => {
  const WIDTHS = [320, 640, 768, 1024, 1280, 1920]
  const PAGES = ['/admin', '/admin/users?tab=customers', '/admin/users?tab=staff', '/admin/users?tab=admins']

  for (const width of WIDTHS) {
    test(`no horizontal overflow on the dashboard and every tab at ${width}px`, async ({ page }) => {
      await signInAsAdmin(page)
      await page.setViewportSize({ width, height: 900 })
      for (const path of PAGES) {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        if (path.includes('users')) await expect(page.getByRole('tablist', { name: 'Account type' })).toBeVisible()
        await expect.poll(() => overflow(page), { message: `${path} at ${width}px` }).toBeLessThanOrEqual(0)
      }
    })
  }

  test('no overflow while the create sheet and the credentials are open at 320', async ({ page }) => {
    await signInAsAdmin(page, '/admin/users?tab=staff')
    await page.setViewportSize({ width: 320, height: 700 })
    await addStaff(page).click()
    await expect(dialog(page, 'Add staff account')).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    const created = await createAccount(page, 'staff', 'Wide', 'Name', { opened: true })
    await expect(created.done).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })

  test('primary actions are at least 44px tall and wide on a phone', async ({ page }) => {
    await signInAsAdmin(page, '/admin/users?tab=staff')
    await page.setViewportSize({ width: 390, height: 844 })
    const targets = [
      addStaff(page),
      page.getByLabel('Search staff by name, username, email or phone'),
      page.getByRole('button', { name: 'Reset password for Sam Reyes', exact: true }),
      page.getByRole('button', { name: 'Archive Sam Reyes', exact: true }),
      tab(page, 'Admins'),
    ]
    for (const target of targets) {
      const box = await target.boundingBox()
      expect(box, String(target)).not.toBeNull()
      expect(box!.height, `${target} height`).toBeGreaterThanOrEqual(44)
      expect(box!.width, `${target} width`).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('dark mode and console', () => {
  test('User Management renders in dark mode from the system preference and from the switch, with readable text', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await signInAsAdmin(page, '/admin/users?tab=staff')
    await expect(page.getByRole('heading', { level: 1, name: 'User management' })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/dark/)
    const colours = await page.evaluate(() => {
      const heading = document.querySelector('h1')!
      return { text: getComputedStyle(heading).color, bg: getComputedStyle(document.body).backgroundColor }
    })
    expect(colours.text).not.toBe(colours.bg)

    await page.emulateMedia({ colorScheme: 'light' })
    await page.getByRole('button', { name: /^Account, / }).click()
    await page.getByLabel('Switch to light mode').evaluate((el: HTMLInputElement) => el.click())
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.getByRole('heading', { level: 1, name: 'User management' })).toBeVisible()
  })

  test('no console errors or uncaught exceptions on the dashboard and the three tabs', async ({ page }) => {
    const problems: string[] = []
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console: ${message.text()}`)
    })
    await signInAsAdmin(page)
    for (const path of ['/admin/users?tab=customers', '/admin/users?tab=staff', '/admin/users?tab=admins']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: 'User management' })).toBeVisible()
    }
    expect(problems).toEqual([])
  })
})

test.describe('accounts are genuinely interactive', () => {
  const count = (page: Page, label: string) =>
    page.getByRole('region', { name: 'Accounts at a glance' }).getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]')

  /** Another tab of the same browser changes Sam's status in the saved accounts; this tab hears about it through the storage event. */
  async function setSamStatus(page: Page, status: 'active' | 'archived') {
    const other = await page.context().newPage()
    // A static file on the same origin: the app itself would load there, find the archived account and sign the shared session out.
    await other.goto('/favicon.svg')
    await other.evaluate((next) => {
      const saved = JSON.parse(localStorage.getItem('silhoufit.accounts.v1')!)
      saved.staff.find((a: { email: string }) => a.email === 'sam.reyes@silhoufit.dev').status = next
      localStorage.setItem('silhoufit.accounts.v1', JSON.stringify(saved))
    }, status)
    await other.close()
  }

  test('a created staff and admin account appears in its table, moves the dashboard counts, and signs in on /login', async ({ page }) => {
    await signInAsAdmin(page)
    const staffBefore = Number((await count(page, 'Staff').innerText()).replace(/,/g, ''))
    const adminsBefore = Number((await count(page, 'Admins').innerText()).replace(/,/g, ''))

    await page.goto('/admin/users?tab=staff')
    const staff = await createAccount(page, 'staff', 'Tess', 'Mora')
    await staff.done.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(seen(page, 'Tess Mora')).toBeVisible()
    await tab(page, 'Admins').click()
    const admin = await createAccount(page, 'admin', 'Uma', 'Reyes')
    await admin.done.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(seen(page, 'Uma Reyes')).toBeVisible()

    await page.goto('/admin')
    await expect(count(page, 'Staff')).toHaveText(String(staffBefore + 1))
    await expect(count(page, 'Admins')).toHaveText(String(adminsBefore + 1))
    await expect(page.getByText('Staff account created: Tess Mora').first()).toBeVisible()

    await signOut(page)
    await signIn(page, { email: staff.email, password: staff.password })
    await expect(page).toHaveURL(/\/staff$/)
    // A new account is on a temporary password, so skip the first-login screen to reach the menu.
    await dialog(page, 'Choose a new password').getByRole('button', { name: 'Skip for now', exact: true }).click()
    await signOut(page)
    await signIn(page, { email: admin.email, password: admin.password })
    await expect(page).toHaveURL(/\/admin$/)
  })

  test('archiving a signed-in staff account signs them out on the next page with a message, and Restore re-enables login', async ({ page }) => {
    await signIn(page, STAFF)
    await expect(page.getByRole('heading', { level: 1, name: 'Hello, Sam' })).toBeVisible()
    // Another admin, in another tab, archives this account while the session is open.
    await setSamStatus(page, 'archived')
    await (await nav(page)).getByRole('link', { name: 'Inventory', exact: true }).click()
    await expect(page).toHaveURL(/\/login\?archived=1/)
    await expect(page.getByText('This account has been archived.')).toBeVisible()
    await expect(page.getByText('Contact an administrator to have it restored.').first()).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('silhoufit-session'))).toBeNull()

    // A reload keeps the explanation, and the archived account cannot get back in.
    await page.reload()
    await expect(page.getByText('This account has been archived.')).toBeVisible()
    await signIn(page, STAFF)
    await expect(page.getByText('This account has been archived.')).toBeVisible()

    await setSamStatus(page, 'active')
    await signIn(page, STAFF)
    await expect(page).toHaveURL(/\/staff$/)
  })

  test('an archived account shows as archived in the staff table and in the activity', async ({ page }) => {
    await signInAsAdmin(page, '/admin/users?tab=staff')
    await page.getByRole('button', { name: 'Archive Sam Reyes', exact: true }).click()
    await dialog(page, 'Archive Sam Reyes?').getByRole('button', { name: 'Archive account', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Restore Sam Reyes', exact: true })).toBeVisible()
    await page.goto('/admin')
    await expect(page.getByText('Staff archived: Sam Reyes')).toBeVisible()
  })

  test('Activity Logs sits above Recent orders and records created, reset and archived accounts', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signInAsAdmin(page, '/admin/users?tab=staff')
    await createAccount(page, 'staff', 'Nora', 'Vega')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Reset password for Sam Reyes', exact: true }).click()
    await dialog(page, 'Reset password for Sam Reyes?').getByRole('button', { name: 'Reset password', exact: true }).click()
    await dialog(page, 'Password reset').getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('button', { name: 'Archive Sam Reyes', exact: true }).click()
    await dialog(page, 'Archive Sam Reyes?').getByRole('button', { name: 'Archive account', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Restore Sam Reyes', exact: true })).toBeVisible()
    await page.goto('/admin')
    const logs = page.locator('section[aria-labelledby="activity-logs"]')
    await expect(logs.getByText('Staff account created: Nora Vega')).toBeVisible()
    await expect(logs.getByText('Password reset: Sam Reyes')).toBeVisible()
    await expect(logs.getByText('Staff archived: Sam Reyes')).toBeVisible()
    // The live changes sit above the sample entries, and the category filter narrows the list.
    await expect(logs.getByRole('listitem').first()).toContainText('Staff archived: Sam Reyes')
    await logs.getByRole('combobox', { name: 'Filter activity logs by category' }).click()
    await page.getByRole('option', { name: 'Orders', exact: true }).click()
    await expect(logs.getByText('Order placed: SF-10231')).toBeVisible()
    await expect(logs.getByText('Staff archived: Sam Reyes')).toHaveCount(0)
    await expect(logs.getByText(/^\d+ of \d+ entries$/)).toBeVisible()
    await logs.getByRole('combobox', { name: 'Filter activity logs by category' }).click()
    await page.getByRole('option', { name: 'All', exact: true }).click()
    await expect(logs.getByText(/Today, \d{1,2}:\d{2} (AM|PM)/).first()).toBeVisible()
    const orders = page.locator('section[aria-labelledby="order-log"]')
    await expect(orders.getByRole('listitem').first()).toBeVisible()
    const [a, o] = [await logs.boundingBox(), await orders.boundingBox()]
    expect(a!.y + a!.height).toBeLessThanOrEqual(o!.y)
    expect(o!.height).toBeLessThan(700)
  })
})

test.describe('profile for a simulated session', () => {
  for (const who of [
    { name: 'admin', account: ADMIN, home: '/admin', role: 'Admin' },
    { name: 'staff', account: STAFF, home: '/staff', role: 'Staff' },
  ]) {
    test(`${who.name}: the profile page shows the account and does not sign out`, async ({ page }) => {
      await signIn(page, who.account)
      await expect(page).toHaveURL(new RegExp(`${who.home}$`))
      await page.getByRole('button', { name: /^Account, / }).click()
      await page.getByRole('group', { name: 'Account' }).getByRole('link', { name: 'Profile', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`${who.home}/profile$`))
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText(who.account.email).first()).toBeVisible()
      await expect(page.getByText(who.role, { exact: true }).first()).toBeVisible()
      await expect(page.getByText(/demo account saved in this browser/)).toBeVisible()

      // It stays signed in after the page settles, after a reload, and after moving on to another page.
      await page.waitForTimeout(1500)
      await expect(page).toHaveURL(new RegExp(`${who.home}/profile$`))
      expect(await page.evaluate(() => localStorage.getItem('silhoufit-session'))).toContain('"simulated":true')
      await page.reload()
      await expect(page).toHaveURL(new RegExp(`${who.home}/profile$`))
      await expect(page.getByText(who.account.email).first()).toBeVisible()
      await (await nav(page)).getByRole('link', { name: 'Inventory', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`${who.home}/inventory$`))
      expect(await page.evaluate(() => localStorage.getItem('silhoufit-session'))).toContain('"simulated":true')
    })
  }
})

test.describe('create sheet', () => {
  test('moves focus into the credentials panel once the account is created', async ({ page }) => {
    await signInAsAdmin(page, '/admin/users?tab=staff')
    const created = await createAccount(page, 'staff', 'Focus', 'Check')
    await expect(created.done.getByRole('heading', { name: 'Focus Check' })).toBeFocused()
  })

  test('the empty Create account button looks enabled, and still validates inline when clicked', async ({ page }) => {
    await signInAsAdmin(page, '/admin/users?tab=staff')
    await addStaff(page).click()
    const sheet = dialog(page, 'Add staff account')
    const submit = sheet.getByRole('button', { name: 'Create account', exact: true })
    await expect(submit).toBeEnabled()
    expect(await submit.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
    await submit.click()
    await expect(sheet.getByLabel('First name')).toHaveAttribute('aria-invalid', 'true')
  })

  test('print output hides the copy buttons', async ({ page }) => {
    await signInAsAdmin(page, '/admin/users?tab=staff')
    const created = await createAccount(page, 'staff', 'Print', 'Test')
    await expect(created.done.getByRole('button', { name: 'Copy username', exact: true })).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    await expect(created.done.getByRole('button', { name: 'Copy username', exact: true })).toBeHidden()
    await expect(created.done.getByRole('button', { name: 'Copy temporary password', exact: true })).toBeHidden()
  })
})

test.describe('summary cards', () => {
  for (const width of [320, 768, 1024, 1280, 1536, 1600, 1920]) {
    for (const collapsed of [false, true]) {
      test(`no card label is truncated at ${width}px with the sidebar ${collapsed ? 'collapsed' : 'open'}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await signInAsAdmin(page)
        if (collapsed && width >= 1024) await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
        await expect(page.getByText('Registered shoppers')).toBeVisible()
        await expect(page.getByText('Low or out of stock', { exact: true })).toBeVisible()
        const cut = await page.evaluate(() =>
          [...document.querySelectorAll('section[aria-labelledby="account-figures"] dt, section[aria-labelledby="account-figures"] dd')]
            .filter((el) => el.scrollWidth > el.clientWidth)
            .map((el) => el.textContent),
        )
        expect(cut).toEqual([])
        expect(await overflow(page)).toBeLessThanOrEqual(0)
      })
    }
  }
})

test.describe('small screens', () => {
  test('the top bar label does not collide with the globe and bell at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await signInAsAdmin(page)
    const header = page.locator('header').first()
    await expect(header.getByText('Admin', { exact: true })).toBeHidden()
    // The left group (burger and brand) must end before the right group (globe, bell, account) starts.
    const brand = await header.evaluate((el) => el.firstElementChild!.getBoundingClientRect().toJSON() as { x: number; width: number })
    const globe = await page.getByRole('link', { name: 'Visit website' }).or(page.getByRole('button', { name: 'Visit website' })).first().boundingBox()
    expect(brand && globe).toBeTruthy()
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(globe!.x)
  })

  test('customer cards label orders, spend and registered date, and the search placeholder fits at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await signInAsAdmin(page, '/admin/users?tab=customers')
    const card = page.getByRole('list', { name: /^Customers with status/ }).getByRole('listitem').first()
    await expect(card.getByText('Orders:')).toBeVisible()
    await expect(card.getByText('Spent:')).toBeVisible()
    await expect(card.getByText('Registered:')).toBeVisible()
    const size = await card.locator('dl').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(size).toBeGreaterThanOrEqual(16)
    const tabSize = await tab(page, 'Customers').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(tabSize).toBeGreaterThanOrEqual(16)
    const fits = await page.getByLabel('Search customers by name, username, email or phone').evaluate((input: HTMLInputElement) => {
      const style = getComputedStyle(input)
      const probe = document.createElement('span')
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${style.font}`
      probe.textContent = input.placeholder
      document.body.append(probe)
      const width = probe.getBoundingClientRect().width
      probe.remove()
      return width <= input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    })
    expect(fits).toBe(true)
  })

  test('selects, pagers, tabs and the Manage users button are at least 44px tall on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signInAsAdmin(page, '/admin/users?tab=customers')
    const tall = async (target: Locator, name: string) => {
      const box = await target.first().boundingBox()
      expect(box, name).not.toBeNull()
      expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44)
      expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44)
    }
    await tall(page.getByRole('combobox', { name: 'Status' }), 'Status')
    await tall(page.getByRole('combobox', { name: 'Rows per page' }), 'Rows per page')
    await tall(page.getByRole('button', { name: 'Next', exact: true }), 'Next')
    await tall(page.getByRole('button', { name: 'Prev', exact: true }), 'Prev')
    await tall(tab(page, 'Staff'), 'Staff tab')

    await page.goto('/admin')
    await tall(page.getByRole('link', { name: 'Manage users', exact: true }), 'Manage users')
    const period = page.getByRole('radio', { name: 'Week' }).first()
    await period.scrollIntoViewIfNeeded()
    await tall(period, 'period tab')
    await tall(page.getByRole('combobox', { name: /year$/ }), 'year select')
  })

  test('the loading skeleton has as many rows as the loaded list', async ({ page }) => {
    await signInAsAdmin(page)
    await page.goto('/admin/users?tab=admins')
    // The cards list is in the page at every width (it is only hidden from @4xl), so its rows can be counted.
    const list = page.locator('ul[aria-label^="Admin accounts with status"]')
    await expect(list).toHaveAttribute('aria-busy', 'true')
    const loading = await list.locator('li').count()
    await expect(list).toHaveAttribute('aria-busy', 'false')
    expect(await list.locator('li').count()).toBe(loading)
  })
})
