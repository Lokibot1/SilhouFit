import { expect, test, type Page } from '@playwright/test'
import { stubStaffApi } from '../admin/staffApiStub'

// What a staff member sees after an administrator resets their password: the forced sign-out (401 `session_revoked`) with the notice on /login,
// and the non-dismissible "Choose a new password" gate. Supabase and the API are stubbed (no real credentials); "network" staff below is a
// non-simulated account, "simulated" ones are the dev-only localStorage accounts.

const NETWORK = { email: 'net.staff@example.com', password: 'Temp#Pass-2026x' }
const SIMULATED = { email: 'sam.reyes@silhoufit.dev', password: 'Staff@12345' }
const REVOKED = { code: 'session_revoked', message: 'Your password was reset by an administrator' }
const SKIP_KEY = 'silhoufit.password-gate.skipped.net-1'

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '')
const jwt = () => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'net-1', role: 'authenticated', exp: 4_102_444_800 })}.sig`

interface Session {
  /** Answers GET /users/me; change it mid-test. Default: 200 with the profile + `flags`. */
  me: 'ok' | 'revoked' | 'plain401' | 'expired'
  flags: { mustChangePassword?: boolean; passwordResetRequired?: boolean }
  meCalls: number
  /** What GET /products (a request() call) answers. */
  products: 'ok' | 'revoked' | 'plain401'
}

/** A signed-in-able "network" staff account, answered by page.route. */
async function stubSession(page: Page, flags: Session['flags'] = {}) {
  const session: Session = { me: 'ok', flags, meCalls: 0, products: 'ok' }
  const user = { id: 'net-1', aud: 'authenticated', role: 'authenticated', email: NETWORK.email, user_metadata: {} }
  await page.route('**/auth/v1/user*', (route) => route.fulfill({ json: user, headers: CORS }))
  await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204, headers: CORS }))
  await page.route('**/auth/v1/token*', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    return route.fulfill({ json: { access_token: jwt(), token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user }, headers: CORS })
  })
  await page.route('**/users/me/addresses', (route) => route.fulfill({ json: [], headers: CORS }))
  await page.route('**/users/me', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    session.meCalls++
    if (session.me === 'revoked') return route.fulfill({ status: 401, json: REVOKED, headers: CORS })
    if (session.me === 'expired') return route.fulfill({ status: 403, json: { code: 'password_reset_expired' }, headers: CORS })
    if (session.me === 'plain401') return route.fulfill({ status: 401, json: { message: 'Unauthorized' }, headers: CORS })
    return route.fulfill({
      headers: CORS,
      json: {
        id: 'net-1',
        email: NETWORK.email,
        role: 'staff',
        firstName: 'Nia',
        middleName: null,
        lastName: 'Network',
        suffix: null,
        fullName: 'Nia Network',
        avatarUrl: null,
        birthday: null,
        gender: null,
        mustChangePassword: false,
        createdAt: '2026-01-15T08:30:00.000Z',
        updatedAt: '2026-01-15T08:30:00.000Z',
        ...session.flags,
      },
    })
  })
  await page.route(
    (url) => url.pathname === '/products' && url.port !== '5173',
    (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      if (session.products === 'revoked') return route.fulfill({ status: 401, json: REVOKED, headers: CORS })
      if (session.products === 'plain401') return route.fulfill({ status: 401, json: { message: 'Unauthorized' }, headers: CORS })
      return route.fulfill({ status: 200, json: { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } }, headers: CORS })
    },
  )
  return session
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await stubStaffApi(page) // keeps GET /users/staff off the network if a page asks
})

async function signIn(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

const banner = (page: Page) => page.getByRole('status').filter({ hasText: 'Your password was reset by an administrator' })
const gate = (page: Page) => page.getByRole('dialog', { name: 'Choose a new password' })
const plainGate = (page: Page) => page.getByRole('dialog', { name: 'Change your temporary password' })
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Change password', exact: true })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const search = (page: Page) => new URL(page.url()).search

/** Makes "30 seconds later" instant: Date.now() runs ahead by window.__skew ms. */
const skewClock = (page: Page) =>
  page.addInitScript(() => {
    const real = Date.now.bind(Date)
    ;(window as unknown as { __skew: number }).__skew = 0
    Date.now = () => real() + (window as unknown as { __skew: number }).__skew
  })

const showAgain = (page: Page, skew = 31_000) =>
  page.evaluate((ms) => {
    ;(window as unknown as { __skew: number }).__skew += ms
    document.dispatchEvent(new Event('visibilitychange'))
  }, skew)

test.describe('forced sign-out after an administrator reset', () => {
  test('a 401 session_revoked from GET /users/me lands on plain /login with the notice, which is gone after a reload', async ({ page }) => {
    const session = await stubSession(page)
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/staff$/)
    session.me = 'revoked'
    await page.goto('/staff/profile') // a fresh load asks /users/me again

    await expect(page).toHaveURL(/\/login$/)
    expect(search(page)).toBe('')
    const notice = banner(page)
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('Your password was reset.')
    await expect(notice).toContainText('Sign in with the default password and choose a new one.')
    expect(await overflow(page)).toBeLessThanOrEqual(0)

    await page.reload()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(banner(page)).toHaveCount(0)

    // The session really ended.
    await page.goto('/staff')
    await expect(page).toHaveURL(/\/login/)
  })

  test('a 401 session_revoked from a request() call (the inventory list) signs out the same way', async ({ page }) => {
    const session = await stubSession(page)
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/staff$/)
    session.products = 'revoked'
    await page.goto('/staff/inventory')

    await expect(page).toHaveURL(/\/login$/)
    expect(search(page)).toBe('')
    await expect(banner(page)).toBeVisible()
  })

  test('a 403 password_reset_expired from GET /users/me lands on plain /login with the informational expired notice', async ({ page }) => {
    const session = await stubSession(page)
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/staff$/)
    session.me = 'expired'
    await page.goto('/staff/profile')
    await expect(page).toHaveURL(/\/login$/)
    expect(search(page)).toBe('')
    const notice = page.getByRole('status').filter({ hasText: 'Your temporary password expired' })
    await expect(notice).toContainText('Ask an administrator to reset your password again.')
    await expect(notice).toHaveClass(/border-info/)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })

  test('a plain 401 on GET /users/me keeps the old behaviour: signed out with no reset notice', async ({ page }) => {
    const session = await stubSession(page)
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/staff$/)
    session.me = 'plain401'
    await page.goto('/staff/profile')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(banner(page)).toHaveCount(0)
  })

  test('a plain 401 from a request() call does not sign the user out or show the notice', async ({ page }) => {
    const session = await stubSession(page)
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/staff$/)
    session.products = 'plain401'
    await page.goto('/staff/inventory')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page).toHaveURL(/\/staff\/inventory$/)
    await expect(banner(page)).toHaveCount(0)
  })

  test('an idle tab signs out when it is shown again, but not before 30 seconds have passed', async ({ page }) => {
    await skewClock(page)
    const session = await stubSession(page)
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    const before = session.meCalls

    // Too soon: throttled, no request, still signed in even though the API would now refuse.
    session.me = 'revoked'
    await showAgain(page, 0)
    await expect(page).toHaveURL(/\/staff$/)
    expect(session.meCalls).toBe(before)

    await showAgain(page, 31_000)
    await expect(page).toHaveURL(/\/login$/)
    expect(search(page)).toBe('')
    await expect(banner(page)).toBeVisible()
  })

  test('a hidden tab does not re-check', async ({ page }) => {
    await skewClock(page)
    const session = await stubSession(page)
    await signIn(page, NETWORK)
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    const before = session.meCalls
    session.me = 'revoked'
    await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }))
    await showAgain(page, 31_000)
    expect(session.meCalls).toBe(before)
    await expect(page).toHaveURL(/\/staff$/)
    // The handler is alive: once the tab is visible again the same event signs out.
    await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }))
    await showAgain(page, 0)
    await expect(page).toHaveURL(/\/login$/)
  })

  test('a simulated account is never re-checked and stays signed in', async ({ page }) => {
    await skewClock(page)
    const session = await stubSession(page)
    session.me = 'revoked' // would sign a network account out; a simulated one never asks
    await signIn(page, SIMULATED)
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await showAgain(page, 31_000)
    await expect(page).toHaveURL(/\/staff$/)
    expect(session.meCalls).toBe(0)
    await expect(banner(page)).toHaveCount(0)
  })
})

test.describe('reset-account gate', () => {
  const RESET = { mustChangePassword: true, passwordResetRequired: true }

  test('cannot be dismissed: no close button, no Remind me later, Escape and the backdrop do nothing', async ({ page }) => {
    await stubSession(page, RESET)
    await signIn(page, NETWORK)
    const popup = gate(page)
    await expect(popup).toBeVisible()
    await expect(popup.getByText('An administrator reset your password to the default. Choose your own now before you continue.')).toBeVisible()
    await expect(popup.getByRole('button')).toHaveText(['Sign out', 'Change password'])
    await expect(popup.getByRole('button', { name: /close/i })).toHaveCount(0)
    await expect(popup.getByRole('button', { name: 'Remind me later' })).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(popup).toBeVisible()
    await page.mouse.click(2, 2) // the backdrop
    await expect(popup).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })

  test('Change password opens /staff/profile with the drawer; the gate steps aside there', async ({ page }) => {
    await stubSession(page, RESET)
    await signIn(page, NETWORK)
    await gate(page).getByRole('button', { name: 'Change password' }).click()
    await expect(page).toHaveURL(/\/staff\/profile$/)
    await expect(drawer(page)).toBeVisible()
    await expect(gate(page)).toHaveCount(0)
  })

  test('Sign out ends the session and returns to /login', async ({ page }) => {
    await stubSession(page, RESET)
    await signIn(page, NETWORK)
    await gate(page).getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(search(page)).toBe('') // a chosen sign out: no ?next=
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('a sessionStorage dismissal from an earlier visit does not hide it', async ({ page }) => {
    await page.addInitScript((key) => sessionStorage.setItem(key, '1'), SKIP_KEY)
    await stubSession(page, RESET)
    await signIn(page, NETWORK)
    await expect(gate(page)).toBeVisible()
    await page.reload()
    await expect(gate(page)).toBeVisible()
  })

  test('a plain mustChangePassword (no reset) keeps the dismissible pop-up, and the dismissal sticks', async ({ page }) => {
    await stubSession(page, { mustChangePassword: true })
    await signIn(page, NETWORK)
    const popup = plainGate(page)
    await expect(popup).toBeVisible()
    await expect(gate(page)).toHaveCount(0)
    await expect(popup.getByRole('button', { name: 'Remind me later' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(popup).toBeHidden()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(popup).toHaveCount(0)
  })

  test('going back from /staff/profile to another page brings the gate back', async ({ page }) => {
    await stubSession(page, RESET)
    await signIn(page, NETWORK)
    await gate(page).getByRole('button', { name: 'Change password' }).click()
    await expect(drawer(page)).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/staff$/)
    await expect(gate(page)).toBeVisible()
  })

  test('the drawer opened from the gate cannot be closed: no X, Escape and backdrop do nothing, Sign out is offered', async ({ page }) => {
    await stubSession(page, RESET)
    await signIn(page, NETWORK)
    await gate(page).getByRole('button', { name: 'Change password' }).click()
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByRole('button', { name: /close/i })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(drawer(page)).toBeVisible()
    await page.mouse.click(2, 2) // the backdrop
    await expect(drawer(page)).toBeVisible()
    await expect(gate(page)).toHaveCount(0) // never two modals at once
    await expect(drawer(page).getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('Sign out from the drawer lands on a plain /login with no ?next=', async ({ page }) => {
    await stubSession(page, RESET)
    await signIn(page, NETWORK)
    await gate(page).getByRole('button', { name: 'Change password' }).click()
    await drawer(page).getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(search(page)).toBe('')
  })

  test('loading /staff/profile directly shows the non-dismissible gate, and Change password opens the drawer in its place', async ({ page }) => {
    await stubSession(page, RESET)
    await signIn(page, NETWORK)
    await expect(gate(page)).toBeVisible()
    await page.goto('/staff/profile')
    await expect(gate(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(gate(page)).toBeVisible()
    await gate(page).getByRole('button', { name: 'Change password' }).click()
    await expect(drawer(page)).toBeVisible()
    await expect(gate(page)).toHaveCount(0)
  })

  test('is readable in dark mode at 320px with no horizontal scroll', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.setViewportSize({ width: 320, height: 568 })
    await stubSession(page, RESET)
    await signIn(page, NETWORK)
    const popup = gate(page)
    await expect(popup).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    for (const name of ['Sign out', 'Change password']) {
      const box = await popup.getByRole('button', { name }).boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    const panel = await popup.boundingBox()
    expect(panel!.x).toBeGreaterThanOrEqual(0)
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(320)
  })
})
