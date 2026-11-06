import { expect, test, type Page } from '@playwright/test'
import { stubUsersApi } from '../admin/usersApiStub'

// Expired invitation and reset links: /auth/callback#error=access_denied&error_code=otp_expired, and the errors Supabase returns when
// the person sets a password with a session that is gone (SetPasswordPage). Supabase and /users/me are stubbed; no real credentials.

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '')
const jwt = () => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'inv-1', role: 'authenticated', exp: 4_102_444_800 })}.sig`
const USER = { id: 'inv-1', aud: 'authenticated', role: 'authenticated', email: 'invited@example.com', app_metadata: { provider: 'email', providers: ['email'] }, identities: [{ provider: 'email' }], user_metadata: {} }
const EXPIRED = '/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
const landing = `/auth/callback#access_token=${jwt()}&refresh_token=r&expires_in=3600&token_type=bearer&type=invite`

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await stubUsersApi(page)
})

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const luminance = (css: string) => {
  const [r, g, b] = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

async function stubSupabase(page: Page, failUpdate?: { status: number; body: object }) {
  await page.route('**/auth/v1/user*', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() === 'GET') return route.fulfill({ json: USER, headers: CORS })
    if (failUpdate) return route.fulfill({ status: failUpdate.status, json: failUpdate.body, headers: CORS })
    return route.fulfill({ json: USER, headers: CORS })
  })
  await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204, headers: CORS }))
}

async function submitPassword(page: Page) {
  await page.goto(landing)
  await page.getByLabel('New password', { exact: true }).fill('Sup3r$ecret1')
  await page.getByLabel('Confirm password', { exact: true }).fill('Sup3r$ecret1')
  await page.getByRole('button', { name: 'Set password', exact: true }).click()
}

test.describe('expired link page', () => {
  test('explains what happened and why, names the next step, and shows no Google cancellation copy', async ({ page }) => {
    await page.goto(EXPIRED)
    await expect(page.getByRole('heading', { level: 1, name: 'This link has expired or was already used' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('Invitation and reset links work once and stop working after a short time')
    await expect(page.getByRole('alert')).toContainText('Send a new reset email to choose a password.')
    await expect(page.getByText(/cancelled/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
    await expect(page).toHaveTitle('Link expired — KRAL')
    // The error is cleaned out of the address bar.
    expect(page.url()).not.toContain('otp_expired')
  })

  test('Send a new reset email goes to /forgot-password, Back to login goes to /login', async ({ page }) => {
    await page.goto(EXPIRED)
    await expect(page.getByRole('link', { name: 'Send a new reset email' })).toHaveAttribute('href', '/forgot-password')
    await page.getByRole('link', { name: 'Back to login' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('the heading takes focus, Tab reaches Send a new reset email first and Enter follows it', async ({ page }) => {
    await page.goto(EXPIRED)
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Send a new reset email' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Back to login' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/forgot-password$/)
  })

  for (const width of [320, 768]) {
    test(`fits ${width}px with no horizontal scroll and 44px links`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 })
      await page.goto(EXPIRED)
      await expect(page.getByRole('link', { name: 'Send a new reset email' })).toBeVisible()
      expect(await overflow(page)).toBeLessThanOrEqual(0)
      for (const name of ['Send a new reset email', 'Back to login']) {
        expect((await page.getByRole('link', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
      }
    })
  }

  test('dark mode: the heading and the primary link stay readable', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(EXPIRED)
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const [bg, heading] = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('h1')!).color])
    expect(luminance(bg)).toBeLessThan(110)
    expect(Math.abs(luminance(heading) - luminance(bg))).toBeGreaterThan(80)
    const link = page.getByRole('link', { name: 'Send a new reset email' })
    const [linkText, linkBg] = await link.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor])
    expect(Math.abs(luminance(linkText) - luminance(linkBg))).toBeGreaterThan(60)
  })
})

test.describe('set-password session errors', () => {
  const cases: { name: string; status: number; body: object; title: string; absent?: string }[] = [
    { name: '401 without a code', status: 401, body: { msg: 'invalid JWT' }, title: 'This link has expired.' },
    { name: '403 session_not_found', status: 403, body: { code: 403, error_code: 'session_not_found', msg: 'Session does not exist' }, title: 'This link has expired.' },
    { name: '400 bad_jwt', status: 400, body: { code: 400, error_code: 'bad_jwt', msg: 'invalid JWT' }, title: 'This link has expired.' },
    { name: '400 refresh_token_not_found', status: 400, body: { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }, title: 'This link has expired.' },
    { name: '429 rate limit', status: 429, body: { code: 429, error_code: 'over_request_rate_limit', msg: 'slow down' }, title: 'Too many attempts.' },
    { name: '500', status: 500, body: { msg: 'boom' }, title: 'Your password was not set.' },
  ]

  for (const c of cases) {
    test(`${c.name} shows "${c.title}" and keeps the form`, async ({ page }) => {
      await stubSupabase(page, { status: c.status, body: c.body })
      await submitPassword(page)
      await expect(page.getByRole('alert').filter({ hasText: c.title })).toBeVisible()
      await expect(page).toHaveURL(/\/auth\/set-password$/)
      await expect(page.getByRole('button', { name: 'Set password', exact: true })).toBeEnabled()
    })
  }

  test('an expired session says the password was not set and what to do next', async ({ page }) => {
    await stubSupabase(page, { status: 403, body: { code: 403, error_code: 'session_not_found', msg: 'gone' } })
    await submitPassword(page)
    const alert = page.getByRole('alert').filter({ hasText: 'This link has expired.' })
    await expect(alert).toContainText('Your password was not set.')
    await expect(alert).toContainText('Ask for a new reset email from the login page.')
  })

  test('same_password is shown next to the field and focuses it', async ({ page }) => {
    await stubSupabase(page, { status: 422, body: { code: 422, error_code: 'same_password', msg: 'same' } })
    await submitPassword(page)
    await expect(page.getByText('This is already your password. Choose a different one.')).toBeVisible()
    await expect(page.getByLabel('New password', { exact: true })).toBeFocused()
  })

  test('with no session at all the page offers a new reset email and fits 320px at 44px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/auth/set-password')
    await expect(page.getByRole('heading', { level: 1, name: 'This link has expired.' })).toBeVisible()
    const link = page.getByRole('link', { name: 'Send a new reset email' })
    await expect(link).toHaveAttribute('href', '/forgot-password')
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    // The logo link comes first in the page; the reset link is within the next few stops.
    for (let i = 0; i < 4 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(link).toBeFocused()
  })

  test('an error banner at 320px does not scroll the page sideways', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await stubSupabase(page, { status: 403, body: { code: 403, error_code: 'session_not_found', msg: 'gone' } })
    await submitPassword(page)
    await expect(page.getByRole('alert').filter({ hasText: 'This link has expired.' })).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
})
