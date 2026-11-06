import { expect, test, type Page, type Route } from '@playwright/test'
import { stubUsersApi } from '../admin/usersApiStub'

// Change password from the profile drawer. The API has no password routes: the drawer re-checks the current password with Supabase Auth
// (POST /auth/v1/token) and then sets the new one with PUT /auth/v1/user. There are no real Supabase credentials, so Supabase and /users/me are
// stubbed for a "network" user, and the dev-only simulated accounts (saved in localStorage) cover the staff, admin and superadmin roles.
// Every test signs in through the real form.

const UNFLAGGED = { email: 'sam.reyes@silhoufit.dev', password: 'Staff@12345' }
const FLAGGED = { email: 'grace.tan@silhoufit.dev', password: 'Staff@12345' }
const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const NETWORK = { email: 'net.staff@example.com', password: 'oldpass1' }
const NEW_PASSWORD = 'Sup3r$ecret1'

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '')
const jwt = () => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'net-1', role: 'authenticated', exp: 4_102_444_800 })}.sig`

type Role = 'staff' | 'customer'

interface Network {
  /** The password the stubbed Supabase currently accepts. */
  password: string
  /** Bodies of every PUT /auth/v1/user. */
  updates: { password: string }[]
  /** Answer the PUT yourself; the default accepts the new password. */
  onUpdate?: (route: Route) => Promise<void> | void
  /** Count of requests to the old API route, which must never be used. */
  oldRouteCalls: number
}

/** Stands in for Supabase Auth and /users/me for one non-simulated user. */
async function stubNetwork(page: Page, { role = 'customer', providers = ['email'] }: { role?: Role; providers?: string[] } = {}) {
  const net: Network = { password: NETWORK.password, updates: [], oldRouteCalls: 0 }
  const user = {
    id: 'net-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: NETWORK.email,
    app_metadata: { provider: providers[0], providers },
    identities: providers.map((provider) => ({ provider, identity_id: provider, user_id: 'net-1' })),
    user_metadata: {},
  }
  await page.route('**/auth/v1/user*', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() === 'GET') return route.fulfill({ json: user, headers: CORS })
    net.updates.push(request.postDataJSON())
    if (net.onUpdate) return net.onUpdate(route)
    net.password = net.updates.at(-1)!.password
    return route.fulfill({ json: user, headers: CORS })
  })
  await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204, headers: CORS }))
  await page.route('**/auth/v1/token*', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const { email, password } = route.request().postDataJSON() ?? {}
    if (email === NETWORK.email && password === net.password) {
      return route.fulfill({ json: { access_token: jwt(), token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user }, headers: CORS })
    }
    return route.fulfill({ status: 400, json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, headers: CORS })
  })
  await page.route('**/users/me/addresses', (route) => route.fulfill({ json: [], headers: CORS }))
  await page.route('**/users/me/password', (route) => {
    net.oldRouteCalls++
    return route.fulfill({ status: 404, json: {}, headers: CORS })
  })
  await page.route('**/users/me', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({
          json: {
            id: 'net-1',
            email: NETWORK.email,
            role,
            isActive: true,
            firstName: 'Nia',
            middleName: null,
            lastName: 'Network',
            suffix: null,
            fullName: 'Nia Network',
            avatarUrl: null,
            birthday: null,
            gender: null,
            createdAt: '2026-01-15T08:30:00.000Z',
            updatedAt: '2026-01-15T08:30:00.000Z',
          },
          headers: CORS,
        }),
  )
  return net
}

test.beforeEach(async ({ page }) => {
  // Keep the cookie banner and the customer welcome tour out of the way, and the users API off the network.
  await page.addInitScript(() => {
    localStorage.setItem('silhoufit-cookie-consent', 'accepted')
    sessionStorage.setItem('silhoufit-tour', JSON.stringify({ phase: null, step: 0, stop: 0, exited: true }))
  })
  await stubUsersApi(page)
})

async function signIn(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

const drawer = (page: Page) => page.getByRole('dialog', { name: 'Change password', exact: true })
const submit = (sheet: ReturnType<typeof drawer>) => sheet.getByRole('button', { name: 'Change password', exact: true })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function fillForm(sheet: ReturnType<typeof drawer>, current = NETWORK.password, next = NEW_PASSWORD, confirm = next) {
  await sheet.getByLabel('Current password', { exact: true }).fill(current)
  await sheet.getByLabel('New password', { exact: true }).fill(next)
  await sheet.getByLabel('Confirm password', { exact: true }).fill(confirm)
}

async function openDrawer(page: Page) {
  await signIn(page, NETWORK)
  await expect(page).toHaveURL(/\/profile$/)
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(drawer(page)).toBeVisible()
  return drawer(page)
}

test.describe('no temporary-password pop-up', () => {
  test('a simulated account that used to be flagged is not asked to change a temporary password', async ({ page }) => {
    await signIn(page, FLAGGED)
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('profile buttons', () => {
  test('a staff profile shows Change password and Sign out, each with an icon', async ({ page }) => {
    await signIn(page, UNFLAGGED)
    await page.goto('/staff/profile')
    const change = page.getByRole('button', { name: 'Change password', exact: true })
    const out = page.getByRole('button', { name: 'Sign out', exact: true })
    await expect(change).toBeVisible()
    await expect(change.locator('svg')).toBeVisible()
    await expect(out.locator('svg')).toBeVisible()
    const [a, b] = await Promise.all([change.boundingBox(), out.boundingBox()])
    expect(a!.height).toBeGreaterThanOrEqual(44)
    expect(a!.y < b!.y || (a!.y === b!.y && a!.x < b!.x)).toBe(true)
  })

  test('is hidden for an account that signs in only with Google', async ({ page }) => {
    await stubNetwork(page, { providers: ['google'] })
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change password', exact: true })).toHaveCount(0)
  })

  test('is shown for an account with an email password, even when Google is linked too', async ({ page }) => {
    await stubNetwork(page, { providers: ['google', 'email'] })
    await signIn(page, NETWORK)
    await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeVisible()
  })
})

test.describe('changing the password through Supabase', () => {
  test('the drawer shows the sign-up requirements, validates, and a success signs out to plain /login with the banner', async ({ page }) => {
    const net = await stubNetwork(page)
    const sheet = await openDrawer(page)
    await expect(sheet.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
    const rules = sheet.getByRole('group', { name: 'Password requirements' })
    await expect(rules).toContainText('At least 8 characters')
    await expect(rules).toContainText('One special character')

    await submit(sheet).click()
    await expect(sheet.getByText('Enter your current password.')).toBeVisible()
    await sheet.getByLabel('New password', { exact: true }).fill('abc')
    await expect(sheet.getByText('Use at least 8 characters.')).toBeVisible()
    expect(net.updates).toEqual([])

    await fillForm(sheet)
    await submit(sheet).click()

    await expect(page).toHaveURL(/\/login$/)
    expect(new URL(page.url()).searchParams.has('next')).toBe(false)
    expect(net.updates).toMatchObject([{ password: NEW_PASSWORD }])
    expect(net.oldRouteCalls).toBe(0)
    await expect(page.getByRole('status').filter({ has: page.getByText('Password changed.', { exact: true }) })).toContainText('Sign in with your new password.')

    await page.reload()
    await expect(page.getByText('Password changed.', { exact: true })).toHaveCount(0)
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login/)

    await signIn(page, NETWORK) // the old password is refused now
    await expect(page).toHaveURL(/\/login$/)
    await signIn(page, { email: NETWORK.email, password: NEW_PASSWORD })
    await expect(page).toHaveURL(/\/profile$/)
  })

  test('each unmet sign-up requirement blocks the submit with a clear message, and the checklist ticks live', async ({ page }) => {
    const net = await stubNetwork(page)
    const sheet = await openDrawer(page)
    const checklist = sheet.getByRole('group', { name: 'Password requirements' })
    await expect(checklist).toContainText('Too weak')
    const cases: [string, string][] = [
      ['abcdefg1!', 'Add an uppercase letter.'],
      ['ABCDEFG1!', 'Add a lowercase letter.'],
      ['Abcdefgh!', 'Add a number.'],
      ['Abcdefg12', 'Add a special character, like ! or #.'],
      ['Ab1!', 'Use at least 8 characters.'],
    ]
    for (const [value, message] of cases) {
      await fillForm(sheet, NETWORK.password, value)
      await submit(sheet).click()
      await expect(sheet.getByText(message)).toBeVisible()
    }
    expect(net.updates).toEqual([])
    await sheet.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await expect(checklist).not.toContainText('not met')
    await expect(checklist).not.toContainText('Too weak')
  })

  test('a wrong current password is shown on the field and nothing is updated', async ({ page }) => {
    const net = await stubNetwork(page)
    const sheet = await openDrawer(page)
    await fillForm(sheet, 'not-my-password')
    await submit(sheet).click()
    await expect(sheet.getByText('That is not your current password. Check it and try again.')).toBeVisible()
    expect(net.updates).toEqual([])
  })

  test("Supabase's own weak password message is shown and the form can be resubmitted", async ({ page }) => {
    const net = await stubNetwork(page)
    net.onUpdate = (route) => route.fulfill({ status: 422, headers: CORS, json: { code: 422, error_code: 'weak_password', msg: 'Password is known to be weak and easy to guess.' } })
    const sheet = await openDrawer(page)
    await fillForm(sheet)
    await submit(sheet).click()
    await expect(sheet.getByRole('alert')).toContainText('Password is known to be weak and easy to guess.')
    await expect(submit(sheet)).toBeEnabled()
    await expect(sheet.getByLabel('Current password', { exact: true })).toHaveValue(NETWORK.password)
  })

  test('the same password is refused under the new password field', async ({ page }) => {
    const net = await stubNetwork(page)
    net.onUpdate = (route) => route.fulfill({ status: 422, headers: CORS, json: { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' } })
    const sheet = await openDrawer(page)
    await fillForm(sheet, NETWORK.password, 'Different#1x')
    await submit(sheet).click()
    await expect(sheet.getByText('This is already your password. Choose a different one.')).toBeVisible()
  })

  test('a rate limit explains what happened and keeps the form', async ({ page }) => {
    const net = await stubNetwork(page)
    net.onUpdate = (route) => route.fulfill({ status: 429, headers: CORS, json: { code: 429, error_code: 'over_request_rate_limit', msg: 'Too many requests' } })
    const sheet = await openDrawer(page)
    await fillForm(sheet)
    await submit(sheet).click()
    await expect(sheet.getByRole('alert')).toContainText('Too many attempts.')
    await expect(sheet.getByRole('alert')).toContainText('Wait a few minutes')
  })

  test('a double click sends one update, and Escape cannot close the drawer while it is pending', async ({ page }) => {
    const net = await stubNetwork(page)
    net.onUpdate = async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      net.password = net.updates.at(-1)!.password
      await route.fulfill({ json: {}, headers: CORS })
    }
    const sheet = await openDrawer(page)
    await fillForm(sheet)
    await submit(sheet).dblclick()
    await expect(submit(sheet)).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    expect(net.updates).toHaveLength(1)
  })

  test('Escape closes the idle drawer and clears it', async ({ page }) => {
    await stubNetwork(page)
    const sheet = await openDrawer(page)
    await sheet.getByLabel('Current password', { exact: true }).fill('something')
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await page.getByRole('button', { name: 'Change password', exact: true }).click()
    await expect(drawer(page).getByLabel('Current password', { exact: true })).toHaveValue('')
  })

  test('no horizontal scroll at 320px with the drawer open, empty and with errors, and it reads in dark mode', async ({ page }) => {
    await stubNetwork(page)
    await page.setViewportSize({ width: 320, height: 700 })
    const sheet = await openDrawer(page)
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
    await submit(sheet).click()
    await expect(sheet.getByText('Enter your current password.')).toBeVisible()
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(sheet.getByText('Enter your current password.')).toBeVisible()
  })
})

test.describe('simulated accounts', () => {
  test('an admin changes the password: it signs out, the old password then fails and the new one works', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/admin/profile')
    await page.getByRole('button', { name: 'Change password', exact: true }).click()
    const sheet = drawer(page)
    await fillForm(sheet, ADMIN.password, 'Brand#New-2026x')
    await submit(sheet).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('Password changed.', { exact: true })).toBeVisible()
    await signIn(page, ADMIN)
    await expect(page).toHaveURL(/\/login$/)
    await signIn(page, { email: ADMIN.email, password: 'Brand#New-2026x' })
    await expect(page).toHaveURL(/\/admin$/)
  })

  test('a wrong current password is shown on the field', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/admin/profile')
    await page.getByRole('button', { name: 'Change password', exact: true }).click()
    const sheet = drawer(page)
    await fillForm(sheet, 'Wrong#Pass-123', 'Brand#New-2026x')
    await submit(sheet).click()
    await expect(sheet.getByText('That is not your current password. Check it and try again.')).toBeVisible()
  })
})
