import { expect, test, type Page, type Route } from '@playwright/test'
import { json, stubStaffApi } from '../admin/staffApiStub'

// Staff forced password change: the first-login pop-up, the Change password drawer on /staff/profile and the sign-out that follows.
// There are no real Supabase credentials, so two sign-in routes are used:
//  - the dev-only simulated accounts (saved in localStorage, answered before Supabase): grace.tan is flagged mustChangePassword, sam.reyes is not;
//  - a stubbed Supabase + API ("network" staff below) for everything that must prove the POST /users/me/password contract.
// Every test signs in through the real form.

const FLAGGED = { email: 'grace.tan@silhoufit.dev', password: 'Staff@12345' }
const UNFLAGGED = { email: 'sam.reyes@silhoufit.dev', password: 'Staff@12345' }
const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }

const NEW_PASSWORD = 'Brand#New-2026x'
const NETWORK = { email: 'net.staff@example.com', password: 'Temp#Pass-2026x' }
const NOTICE = 'Password changed. Sign in with your new password.'

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '')
const jwt = () => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'net-1', role: 'authenticated', exp: 4_102_444_800 })}.sig`

type Role = 'staff' | 'admin' | 'superadmin' | 'customer'

interface Network {
  /** The password the stubbed Supabase currently accepts. */
  password: string
  /** Bodies of every POST /users/me/password. */
  posts: { currentPassword: string; newPassword: string }[]
  /** Answer the POST yourself; the default is `ok`. */
  onPost: (route: Route) => Promise<void> | void
  /** 204, and the stubbed Supabase now accepts the new password. */
  ok: (route: Route) => Promise<void>
}

/** Stands in for Supabase Auth and the API for one non-simulated user. */
async function stubNetwork(
  page: Page,
  { role = 'staff', mustChangePassword = true, canChangePassword, passwordResetRequired }: { role?: Role; mustChangePassword?: boolean; canChangePassword?: boolean; passwordResetRequired?: boolean } = {},
) {
  const net: Network = {
    password: NETWORK.password,
    posts: [],
    ok: async (route) => {
      net.password = net.posts.at(-1)!.newPassword
      await route.fulfill({ status: 204, headers: CORS })
    },
    onPost: (route) => net.ok(route),
  }
  const user = { id: 'net-1', aud: 'authenticated', role: 'authenticated', email: NETWORK.email, user_metadata: {} }
  await page.route('**/auth/v1/user*', (route) => route.fulfill({ json: user, headers: CORS }))
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
  await page.route('**/users/me', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({
          json: {
            id: 'net-1',
            email: NETWORK.email,
            role,
            firstName: 'Nia',
            middleName: null,
            lastName: 'Network',
            suffix: null,
            fullName: 'Nia Network',
            avatarUrl: null,
            birthday: null,
            gender: null,
            mustChangePassword,
            ...(canChangePassword === undefined ? {} : { canChangePassword }),
            ...(passwordResetRequired === undefined ? {} : { passwordResetRequired }),
            createdAt: '2026-01-15T08:30:00.000Z',
            updatedAt: '2026-01-15T08:30:00.000Z',
          },
          headers: CORS,
        }),
  )
  await page.route('**/users/me/password', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    net.posts.push(request.postDataJSON())
    await net.onPost(route)
  })
  return net
}

test.beforeEach(async ({ page }) => {
  // Keep the cookie banner out of the way, and the staff API (Staff tab) off the network.
  // The customer welcome tour is kept out of the way too (the "not again in this tab" flag).
  await page.addInitScript(() => {
    localStorage.setItem('silhoufit-cookie-consent', 'accepted')
    sessionStorage.setItem('silhoufit-tour', JSON.stringify({ phase: null, step: 0, stop: 0, exited: true }))
  })
  await stubStaffApi(page)
})

async function signIn(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

/** Simulated staff, admin and superadmin plus a stubbed network customer. */
const EVERY_ROLE_PROFILES = [
  { role: 'staff', account: UNFLAGGED, home: /\/staff$/, profile: '/staff/profile' },
  { role: 'admin', account: ADMIN, home: /\/admin$/, profile: '/admin/profile' },
  { role: 'superadmin', account: SUPERADMIN, home: /\/superadmin$/, profile: '/superadmin/profile' },
  { role: 'customer', account: NETWORK, home: /\/profile$/, profile: '/profile' },
] as const

/** Marks the saved sample admin as still on the temporary password (the accounts live in localStorage). */
async function flagSimulatedAdmin(page: Page) {
  await page.goto('/login')
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('silhoufit.accounts.v1')!)
    state.admins.find((a: { email: string }) => a.email === 'admin@silhoufit.dev').mustChangePassword = true
    localStorage.setItem('silhoufit.accounts.v1', JSON.stringify(state))
  })
}

async function signInAs(page: Page, role: Role, account: { email: string; password: string }) {
  if (role === 'customer') await stubNetwork(page, { role, mustChangePassword: false })
  await signIn(page, account)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
}

const gate = (page: Page) => page.getByRole('dialog', { name: 'Change your temporary password' })
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Change password', exact: true })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function dismissGate(page: Page) {
  await gate(page).getByRole('button', { name: 'Remind me later' }).click()
  await expect(gate(page)).toBeHidden()
}

/** Signs the network staff in and opens the Change password drawer on the profile. */
async function openDrawer(page: Page, net: Network) {
  await signIn(page, NETWORK)
  await expect(page).toHaveURL(/\/staff$/)
  await dismissGate(page)
  await page.goto('/staff/profile')
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(drawer(page)).toBeVisible()
  void net
  return drawer(page)
}

async function fillForm(sheet: ReturnType<typeof drawer>, current = NETWORK.password, next = NEW_PASSWORD, confirm = next) {
  await sheet.getByLabel('Current password', { exact: true }).fill(current)
  await sheet.getByLabel('New password', { exact: true }).fill(next)
  await sheet.getByLabel('Confirm password', { exact: true }).fill(confirm)
}

const submit = (sheet: ReturnType<typeof drawer>) => sheet.getByRole('button', { name: 'Change password', exact: true })

test.describe('first-login pop-up', () => {
  test('appears for a flagged staff member, can be dismissed, stays away for the session and returns after sign-out and sign-in', async ({ page }) => {
    await signIn(page, FLAGGED)
    await expect(page).toHaveURL(/\/staff$/)
    const popup = gate(page)
    await expect(popup).toBeVisible()
    await expect(popup.getByText('You signed in with a temporary password')).toBeVisible()
    await expect(popup.getByRole('button', { name: 'Change password' })).toBeVisible()
    await expect(popup.locator('svg').first()).toBeVisible() // the lock icon in the title

    await popup.getByRole('button', { name: 'Remind me later' }).click()
    await expect(popup).toBeHidden()

    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Staff' }).or(page.getByRole('button', { name: 'Open menu' }))).toBeVisible()
    await expect(popup).toBeHidden()

    // Sign out from the profile, then sign in again: the notice returns.
    await page.goto('/staff/profile')
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    await signIn(page, FLAGGED)
    await expect(popup).toBeVisible()
  })

  test('Escape dismisses it too', async ({ page }) => {
    await signIn(page, FLAGGED)
    await expect(gate(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(gate(page)).toBeHidden()
  })

  test('Change password closes it and opens /staff/profile with the drawer already open', async ({ page }) => {
    await signIn(page, FLAGGED)
    await gate(page).getByRole('button', { name: 'Change password' }).click()
    await expect(page).toHaveURL(/\/staff\/profile$/)
    await expect(gate(page)).toBeHidden()
    await expect(drawer(page)).toBeVisible()
    await page.reload()
    await expect(drawer(page)).toBeHidden()
  })

  test('is not shown to an unflagged staff member', async ({ page }) => {
    await signIn(page, UNFLAGGED)
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(gate(page)).toHaveCount(0)
  })

  test('is not shown to an unflagged admin or a superadmin', async ({ page }) => {
    await signIn(page, ADMIN)
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(gate(page)).toHaveCount(0)
    await page.goto('/admin/profile')
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)

    await signIn(page, SUPERADMIN)
    await expect(page).toHaveURL(/\/superadmin$/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(gate(page)).toHaveCount(0)
  })

  test('is not shown to a customer even when the API flags mustChangePassword', async ({ page }) => {
    await stubNetwork(page, { role: 'customer' })
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(gate(page)).toHaveCount(0)
  })

  test('a superadmin flagged by the API gets the dismissible pop-up; Change password opens /superadmin/profile with the drawer and ends on /login', async ({ page }) => {
    const net = await stubNetwork(page, { role: 'superadmin' })
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/superadmin$/)
    await expect(gate(page)).toBeVisible()
    await expect(gate(page).getByRole('button', { name: 'Remind me later' })).toBeVisible()
    await expect(gate(page).getByRole('button', { name: 'Sign out' })).toHaveCount(0)
    await gate(page).getByRole('button', { name: 'Change password' }).click()
    await expect(page).toHaveURL(/\/superadmin\/profile$/)
    await expect(gate(page)).toBeHidden()
    await expect(drawer(page)).toBeVisible()
    await fillForm(drawer(page))
    await submit(drawer(page)).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(net.posts).toHaveLength(1)
    await expect(page.getByRole('status').filter({ has: page.getByText('Password changed.', { exact: true }) })).toContainText('Sign in with your new password.')
  })

  test('a flagged superadmin can put the pop-up off with Remind me later or Escape, and it returns after sign-out', async ({ page }) => {
    await stubNetwork(page, { role: 'superadmin' })
    await signIn(page, NETWORK)
    await dismissGate(page)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(gate(page)).toBeHidden()
    await page.goto('/superadmin/profile')
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    await signIn(page, NETWORK)
    await expect(gate(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(gate(page)).toBeHidden()
  })

  test('an unflagged network superadmin is not asked, and a reset flag never gives a superadmin the blocking gate', async ({ page }) => {
    await stubNetwork(page, { role: 'superadmin', mustChangePassword: false })
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/superadmin$/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(gate(page)).toHaveCount(0)
    await page.goto('/superadmin/profile')
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)

    await stubNetwork(page, { role: 'superadmin', passwordResetRequired: true })
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/superadmin$/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('a flagged simulated admin gets the dismissible pop-up and Change password opens /admin/profile with the drawer', async ({ page }) => {
    await flagSimulatedAdmin(page)
    await signIn(page, ADMIN)
    await expect(page).toHaveURL(/\/admin$/)
    await expect(gate(page)).toBeVisible()
    await expect(gate(page).getByText('You signed in with a temporary password')).toBeVisible()
    await gate(page).getByRole('button', { name: 'Change password' }).click()
    await expect(page).toHaveURL(/\/admin\/profile$/)
    await expect(gate(page)).toBeHidden()
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByRole('button', { name: 'Sign out' })).toHaveCount(0)

    await fillForm(drawer(page), ADMIN.password, NEW_PASSWORD)
    await submit(drawer(page)).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('status').filter({ has: page.getByText('Password changed.', { exact: true }) })).toContainText('Sign in with your new password.')
  })

  test('a flagged simulated admin can put the pop-up off with Remind me later or Escape, and it returns after sign-out', async ({ page }) => {
    await flagSimulatedAdmin(page)
    await signIn(page, ADMIN)
    await dismissGate(page)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(gate(page)).toBeHidden()
    await page.goto('/admin/profile')
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    await signIn(page, ADMIN)
    await expect(gate(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(gate(page)).toBeHidden()
  })

  test('a network admin flagged by the API gets the dismissible pop-up; the full path ends on /login with the banner', async ({ page }) => {
    const net = await stubNetwork(page, { role: 'admin' })
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/admin$/)
    await expect(gate(page)).toBeVisible()
    await expect(gate(page).getByRole('button', { name: 'Remind me later' })).toBeVisible()
    await gate(page).getByRole('button', { name: 'Change password' }).click()
    await expect(page).toHaveURL(/\/admin\/profile$/)
    await expect(drawer(page)).toBeVisible()
    await fillForm(drawer(page))
    await submit(drawer(page)).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(net.posts).toHaveLength(1)
    await expect(page.getByRole('status').filter({ has: page.getByText('Password changed.', { exact: true }) })).toContainText('Sign in with your new password.')
  })

  test('is shown from the API flag for a non-simulated staff member', async ({ page }) => {
    await stubNetwork(page)
    await signIn(page, NETWORK)
    await expect(gate(page)).toBeVisible()
  })

  test('is not shown from the API for an unflagged staff member', async ({ page }) => {
    await stubNetwork(page, { mustChangePassword: false })
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(gate(page)).toHaveCount(0)
  })
})

test.describe('profile buttons', () => {
  test('a staff profile shows Change password and Sign out side by side, each with an icon', async ({ page }) => {
    await signIn(page, UNFLAGGED)
    await page.goto('/staff/profile')
    const change = page.getByRole('button', { name: 'Change password', exact: true })
    const out = page.getByRole('button', { name: 'Sign out', exact: true })
    await expect(change).toBeVisible()
    await expect(out).toBeVisible()
    await expect(change.locator('svg')).toBeVisible()
    await expect(out.locator('svg')).toBeVisible()
    const [a, b] = await Promise.all([change.boundingBox(), out.boundingBox()])
    // Reading order: Change password comes before Sign out (side by side on desktop, wrapped below on a narrow phone).
    expect(a!.y < b!.y || (a!.y === b!.y && a!.x < b!.x)).toBe(true)
  })

  for (const { role, account, profile } of EVERY_ROLE_PROFILES) {
    test(`a ${role} profile shows Change password before Sign out`, async ({ page }) => {
      await signInAs(page, role, account)
      if (role !== 'customer') await page.goto(profile) // a customer already lands on /profile
      const change = page.getByRole('button', { name: 'Change password', exact: true })
      const out = page.getByRole('button', { name: 'Sign out', exact: true })
      await expect(change).toBeVisible()
      await expect(change.locator('svg')).toBeVisible()
      const [a, b] = await Promise.all([change.boundingBox(), out.boundingBox()])
      expect(a!.height).toBeGreaterThanOrEqual(44)
      expect(a!.y < b!.y || (a!.y === b!.y && a!.x < b!.x)).toBe(true)
    })
  }

  test('is hidden for an account that signs in only with Google (canChangePassword false)', async ({ page }) => {
    await stubNetwork(page, { role: 'customer', mustChangePassword: false, canChangePassword: false })
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change password', exact: true })).toHaveCount(0)
  })
})

test.describe('every role can change its password', () => {
  for (const { role, account, home, profile } of EVERY_ROLE_PROFILES) {
    test(`${role}: the drawer opens closable, validates, and a success signs out to plain /login with the banner`, async ({ page }) => {
      await signInAs(page, role, account)
      if (role !== 'customer') await page.goto(profile) // a customer already lands on /profile
      await page.getByRole('button', { name: 'Change password', exact: true }).click()
      const sheet = drawer(page)
      await expect(sheet).toBeVisible()
      await expect(sheet.getByRole('button', { name: 'Sign out' })).toHaveCount(0)

      await submit(sheet).click()
      await expect(sheet.getByText('Enter your current password.')).toBeVisible()
      await expect(sheet.getByRole('group', { name: 'Password requirements' })).toBeVisible()

      await fillForm(sheet, account.password, NEW_PASSWORD)
      await submit(sheet).click()

      await expect(page).toHaveURL(/\/login$/)
      expect(new URL(page.url()).searchParams.has('next')).toBe(false)
      await expect(page.getByRole('status').filter({ has: page.getByText('Password changed.', { exact: true }) })).toContainText('Sign in with your new password.')

      await page.reload()
      await expect(page.getByText('Password changed.', { exact: true })).toHaveCount(0)
      await page.goto(profile)
      await expect(page).toHaveURL(/\/login/) // the session really ended

      if (role === 'customer') {
        await signIn(page, { email: NETWORK.email, password: NETWORK.password }) // the stub now only accepts the new password
        await expect(page).toHaveURL(/\/login$/)
      } else {
        await signIn(page, account) // the old password
        await expect(page).toHaveURL(/\/login$/)
        await signIn(page, { email: account.email, password: NEW_PASSWORD })
        await expect(page).toHaveURL(home)
      }
    })
  }

  test('a wrong current password is shown on the field for an admin', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/admin/profile')
    await page.getByRole('button', { name: 'Change password', exact: true }).click()
    const sheet = drawer(page)
    await fillForm(sheet, 'Wrong#Pass-123', NEW_PASSWORD)
    await submit(sheet).click()
    await expect(sheet.getByText('That is not your current password. Check it and try again.')).toBeVisible()
  })

  test('a customer whose account has no password sees the Google explanation and can retry', async ({ page }) => {
    const net = await stubNetwork(page, { role: 'customer', mustChangePassword: false })
    net.onPost = (route) => json(route, 403, { code: 'password_login_not_available' })
    await signIn(page, NETWORK)
    await page.getByRole('button', { name: 'Change password', exact: true }).click()
    const sheet = drawer(page)
    await fillForm(sheet)
    await submit(sheet).click()
    await expect(sheet.getByRole('alert')).toContainText('This account signs in with Google (or another provider), so there is no password to change here.')
    await expect(submit(sheet)).toBeEnabled()
  })
})

test.describe('drawer validation', () => {
  test('required fields are reported on submit and the policy checklist updates live', async ({ page }) => {
    const net = await stubNetwork(page)
    const sheet = await openDrawer(page, net)

    await submit(sheet).click()
    await expect(sheet.getByText('Enter your current password.')).toBeVisible()
    await expect(sheet.getByText('Password is required.')).toBeVisible()
    await expect(sheet.getByText('Confirm your password.')).toBeVisible()
    expect(net.posts).toHaveLength(0)

    const notMet = sheet.getByRole('group', { name: 'Password requirements' }).getByRole('listitem').filter({ hasText: 'not met' })
    await sheet.getByLabel('New password', { exact: true }).fill('abc')
    const before = await notMet.count()
    expect(before).toBeGreaterThan(0)
    await expect(sheet.getByText('Use at least 8 characters.')).toBeVisible()
    await sheet.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await expect(notMet).toHaveCount(0)
    await expect(sheet.getByText('Too weak', { exact: true })).toHaveCount(0)
  })

  test('a password that fails the policy shows the specific missing rule', async ({ page }) => {
    const net = await stubNetwork(page)
    const sheet = await openDrawer(page, net)
    await sheet.getByLabel('Current password', { exact: true }).fill(NETWORK.password)
    const next = sheet.getByLabel('New password', { exact: true })
    for (const [value, message] of [
      ['short1!', 'Use at least 8 characters.'],
      ['lowercase1!x', 'Add an uppercase letter.'],
      ['UPPERCASE1!X', 'Add a lowercase letter.'],
      ['NoNumbers!xx', 'Add a number.'],
      ['NoSpecial1xx', 'Add a special character, like ! or #.'],
    ] as const) {
      await next.fill(value)
      await next.blur()
      await expect(sheet.getByText(message)).toBeVisible()
    }
    expect(net.posts).toHaveLength(0)
  })

  test('a confirmation that differs is reported and nothing is sent', async ({ page }) => {
    const net = await stubNetwork(page)
    const sheet = await openDrawer(page, net)
    await fillForm(sheet, NETWORK.password, NEW_PASSWORD, `${NEW_PASSWORD}x`)
    await submit(sheet).click()
    await expect(sheet.getByText("Passwords don't match.")).toBeVisible()
    expect(net.posts).toHaveLength(0)
  })

  test('a new password equal to the current one is refused before any request', async ({ page }) => {
    const net = await stubNetwork(page)
    const sheet = await openDrawer(page, net)
    await fillForm(sheet, NETWORK.password, NETWORK.password)
    await submit(sheet).click()
    await expect(sheet.getByText('Choose a password different from your current one.')).toBeVisible()
    expect(net.posts).toHaveLength(0)
  })

  test('the eye toggles reveal and hide each password field', async ({ page }) => {
    const net = await stubNetwork(page)
    const sheet = await openDrawer(page, net)
    await fillForm(sheet)
    for (const label of ['Current password', 'New password', 'Confirm password']) {
      const field = sheet.getByLabel(label, { exact: true })
      await expect(field).toHaveAttribute('type', 'password')
    }
    for (const name of ['current password', 'new password', 'confirm password']) {
      await sheet.getByRole('button', { name: `Show ${name}`, exact: true }).click()
    }
    for (const label of ['Current password', 'New password', 'Confirm password']) {
      await expect(sheet.getByLabel(label, { exact: true })).toHaveAttribute('type', 'text')
    }
    for (const name of ['current password', 'new password', 'confirm password']) {
      await expect(sheet.getByRole('button', { name: `Hide ${name}`, exact: true })).toBeVisible()
    }
  })
})

test.describe('submitting', () => {
  test('while the request is pending the button is disabled and busy, a double click sends one POST with the right body', async ({ page }) => {
    const net = await stubNetwork(page)
    let release!: () => void
    const gateOpen = new Promise<void>((resolve) => (release = resolve))
    net.onPost = async (route) => {
      await gateOpen
      await net.ok(route)
    }
    const sheet = await openDrawer(page, net)
    await fillForm(sheet)
    const button = submit(sheet)
    await button.dblclick()
    await expect(button).toBeDisabled()
    await expect(button).toHaveAttribute('aria-busy', 'true')
    await expect(sheet.getByLabel('Current password', { exact: true })).toHaveAttribute('readonly', '')
    expect(net.posts).toHaveLength(1)
    expect(net.posts[0]).toEqual({ currentPassword: NETWORK.password, newPassword: NEW_PASSWORD })
    release()
    await expect(page).toHaveURL(/\/login/)
    expect(net.posts).toHaveLength(1)
  })

  test('success shows a toast, signs out and lands on /login without ?next=, with a banner that is gone after a reload', async ({ page }) => {
    const net = await stubNetwork(page)
    const sheet = await openDrawer(page, net)
    await fillForm(sheet)
    await submit(sheet).click()

    await expect(page).toHaveURL(/\/login$/)
    expect(new URL(page.url()).searchParams.has('next')).toBe(false)
    const banner = page.getByRole('status').filter({ has: page.getByText('Password changed.', { exact: true }) })
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Sign in with your new password.')

    await page.reload()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(page.getByText('Password changed.', { exact: true })).toHaveCount(0)

    // The session really ended, and only the new password signs in.
    await page.goto('/staff')
    await expect(page).toHaveURL(/\/login/)
    await signIn(page, { email: NETWORK.email, password: NETWORK.password })
    await expect(page.getByText('Password changed.', { exact: true })).toHaveCount(0)
    await expect(page).toHaveURL(/\/login/)
  })

  test('the success toast carries the same instruction', async ({ page }) => {
    const net = await stubNetwork(page)
    net.onPost = async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await net.ok(route)
    }
    const sheet = await openDrawer(page, net)
    await fillForm(sheet)
    await submit(sheet).click()
    await expect(page.getByText(NOTICE, { exact: true })).toBeVisible()
  })
})

test.describe('server errors keep the form usable', () => {
  const cases: { name: string; fulfill: (route: Route) => Promise<void> | void; text: RegExp; field?: string }[] = [
    {
      name: '403 invalid_current_password',
      fulfill: (route) => json(route, 403, { code: 'invalid_current_password' }),
      text: /That is not your current password\. Check it and try again\./,
      field: 'Current password',
    },
    {
      name: '422 same_password',
      fulfill: (route) => json(route, 422, { code: 'same_password' }),
      text: /This is already your password\. Choose a different one\./,
      field: 'New password',
    },
    { name: '400 weak', fulfill: (route) => json(route, 400, { message: 'weak' }), text: /found the new password too weak.*try again/ },
    { name: '401', fulfill: (route) => json(route, 401, {}), text: /Your session has expired.*Sign in again/ },
    { name: '429', fulfill: (route) => json(route, 429, {}), text: /Too many attempts.*Wait a few minutes, then try again/ },
    { name: '503', fulfill: (route) => json(route, 503, {}), text: /Password changes are unavailable right now.*could not complete the request/ },
    { name: '500', fulfill: (route) => json(route, 500, {}), text: /Something went wrong on our side\. Try again in a moment/ },
    { name: 'network failure', fulfill: (route) => route.abort('failed'), text: /connection dropped.*Check your connection and try again/ },
  ]

  for (const { name, fulfill, text, field } of cases) {
    test(`${name} explains what happened and why, and the form can be resubmitted`, async ({ page }) => {
      const net = await stubNetwork(page)
      net.onPost = fulfill
      const sheet = await openDrawer(page, net)
      await fillForm(sheet)
      await submit(sheet).click()

      if (field) {
        const input = sheet.getByLabel(field, { exact: true })
        await expect(sheet.getByText(text)).toBeVisible()
        await expect(input).toBeFocused()
      } else {
        const alert = sheet.getByRole('alert')
        await expect(alert).toContainText(text)
        await expect(alert.locator('p').first()).toBeVisible() // the title: what happened
      }
      // Still on the page, values kept, button usable again.
      await expect(drawer(page)).toBeVisible()
      await expect(page).toHaveURL(/\/staff\/profile$/)
      await expect(submit(sheet)).toBeEnabled()
      await expect(submit(sheet)).not.toHaveAttribute('aria-busy', 'true')
      await expect(sheet.getByLabel('New password', { exact: true })).toHaveValue(NEW_PASSWORD)

      // Retry succeeds once the server recovers.
      if (name !== '401') {
        net.onPost = (route) => net.ok(route)
        if (field === 'Current password') await sheet.getByLabel(field, { exact: true }).fill(NETWORK.password)
        if (field === 'New password') await sheet.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
        await submit(sheet).click()
        await expect(page).toHaveURL(/\/login/)
        expect(net.posts.length).toBeGreaterThanOrEqual(2)
      }
    })
  }

  test('401 offers Sign in again, which ends the session', async ({ page }) => {
    const net = await stubNetwork(page)
    net.onPost = (route) => json(route, 401, {})
    const sheet = await openDrawer(page, net)
    await fillForm(sheet)
    await submit(sheet).click()
    await sheet.getByRole('button', { name: 'Sign in again' }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('an inline field error clears once the user edits that field', async ({ page }) => {
    const net = await stubNetwork(page)
    net.onPost = (route) => json(route, 403, { code: 'invalid_current_password' })
    const sheet = await openDrawer(page, net)
    await fillForm(sheet)
    await submit(sheet).click()
    await expect(sheet.getByText('That is not your current password.')).toBeVisible()
    await sheet.getByLabel('Current password', { exact: true }).fill('Other#Pass-1')
    await expect(sheet.getByText('That is not your current password.')).toHaveCount(0)
  })
})

test.describe('keyboard and layout', () => {
  test('Escape closes the drawer and clears it, but not while the request is pending', async ({ page }) => {
    const net = await stubNetwork(page)
    const sheet = await openDrawer(page, net)
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()

    await page.getByRole('button', { name: 'Change password', exact: true }).click()
    await expect(sheet.getByLabel('Current password', { exact: true })).toHaveValue('')

    let release!: () => void
    const open = new Promise<void>((resolve) => (release = resolve))
    net.onPost = async (route) => {
      await open
      await net.ok(route)
    }
    await fillForm(sheet)
    await submit(sheet).click()
    await expect(submit(sheet)).toHaveAttribute('aria-busy', 'true')
    await page.keyboard.press('Escape')
    await expect(sheet).toBeVisible()
    release()
    await expect(page).toHaveURL(/\/login/)
  })

  test('the form can be completed and sent with the keyboard alone', async ({ page }) => {
    const net = await stubNetwork(page)
    const sheet = await openDrawer(page, net)
    await sheet.getByLabel('Current password', { exact: true }).focus()
    await page.keyboard.type(NETWORK.password)
    await page.getByLabel('New password', { exact: true }).focus()
    await page.keyboard.type(NEW_PASSWORD)
    await page.getByLabel('Confirm password', { exact: true }).focus()
    await page.keyboard.type(NEW_PASSWORD)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/login/)
    expect(net.posts).toEqual([{ currentPassword: NETWORK.password, newPassword: NEW_PASSWORD }])
  })

  test('no horizontal scroll at 320px with the drawer open, empty and with errors', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    const net = await stubNetwork(page)
    net.onPost = (route) => json(route, 429, {})
    const sheet = await openDrawer(page, net)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await submit(sheet).click()
    await expect(sheet.getByText('Enter your current password.')).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await fillForm(sheet)
    await submit(sheet).click()
    await expect(sheet.getByRole('alert')).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    const panel = await sheet.boundingBox()
    expect(panel!.x).toBeGreaterThanOrEqual(0)
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(320)
  })

  test('dark mode keeps the drawer readable', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    const net = await stubNetwork(page)
    const sheet = await openDrawer(page, net)
    await expect(sheet.getByRole('heading', { name: 'Change password' }).or(sheet.getByText('Change password').first())).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('simulated account', () => {
  test('changing the temporary password signs out; the old password then fails and the new one works', async ({ page }) => {
    await signIn(page, FLAGGED)
    await dismissGate(page)
    await page.goto('/staff/profile')
    await page.getByRole('button', { name: 'Change password', exact: true }).click()
    const sheet = drawer(page)
    await fillForm(sheet, FLAGGED.password, NEW_PASSWORD)
    await submit(sheet).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('Password changed.', { exact: true })).toBeVisible()

    await signIn(page, FLAGGED) // the old password
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()

    await signIn(page, { email: FLAGGED.email, password: NEW_PASSWORD })
    await expect(page).toHaveURL(/\/staff$/)
    await expect(gate(page)).toHaveCount(0) // no longer flagged
  })

  test('a wrong current password is shown on the field', async ({ page }) => {
    await signIn(page, FLAGGED)
    await dismissGate(page)
    await page.goto('/staff/profile')
    await page.getByRole('button', { name: 'Change password', exact: true }).click()
    const sheet = drawer(page)
    await fillForm(sheet, 'Wrong#Pass-123', NEW_PASSWORD)
    await submit(sheet).click()
    await expect(sheet.getByText('That is not your current password. Check it and try again.')).toBeVisible()
  })
})
