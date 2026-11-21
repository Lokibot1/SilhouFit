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

test.describe('expired link redirect', () => {
  test('an expired link in the hash lands on /link-expired with the page content and no leftover error text', async ({ page }) => {
    await page.goto(EXPIRED)
    await expect(page).toHaveURL(/\/link-expired$/)
    await expect(page.getByRole('heading', { level: 1, name: 'This link has expired' })).toBeVisible()
    await expect(page.getByText(/cancelled/i)).toHaveCount(0)
    await expect(page).toHaveTitle('Link expired — SilhouFit')
    expect(page.url()).not.toContain('otp_expired')
  })

  test('an expired link in the query redirects too, and Back does not return to the callback', async ({ page }) => {
    await page.goto('/login')
    await page.goto('/auth/callback?error=access_denied&error_code=otp_expired')
    await expect(page).toHaveURL(/\/link-expired$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('Request a new link goes to /forgot-password, Back to login goes to /login', async ({ page }) => {
    await page.goto(EXPIRED)
    await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
    await page.getByRole('link', { name: 'Back to login' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('a Google cancellation does not redirect', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied&error_description=User+denied')
    await expect(page).toHaveURL(/\/auth\/callback$/)
  })
})

test.describe('set-password session errors', () => {
  const expired: { name: string; status: number; body: object }[] = [
    { name: '401 without a code', status: 401, body: { msg: 'invalid JWT' } },
    { name: '403 session_not_found', status: 403, body: { code: 403, error_code: 'session_not_found', msg: 'Session does not exist' } },
    { name: '400 bad_jwt', status: 400, body: { code: 400, error_code: 'bad_jwt', msg: 'invalid JWT' } },
    { name: '400 refresh_token_not_found', status: 400, body: { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' } },
  ]
  const others = [
    { name: '429 rate limit', status: 429, body: { code: 429, error_code: 'over_request_rate_limit', msg: 'slow down' }, title: 'Too many attempts.' },
    { name: '500', status: 500, body: { msg: 'boom' }, title: 'Your password was not set.' },
  ]

  for (const c of expired) {
    test(`${c.name} redirects to /link-expired`, async ({ page }) => {
      await stubSupabase(page, { status: c.status, body: c.body })
      await submitPassword(page)
      await expect(page).toHaveURL(/\/link-expired$/)
      await expect(page.getByRole('heading', { level: 1, name: 'This link has expired' })).toBeVisible()
    })
  }

  for (const c of others) {
    test(`${c.name} shows "${c.title}" and keeps the form`, async ({ page }) => {
      await stubSupabase(page, { status: c.status, body: c.body })
      await submitPassword(page)
      await expect(page.getByRole('alert').filter({ hasText: c.title })).toBeVisible()
      await expect(page).toHaveURL(/\/auth\/set-password$/)
      await expect(page.getByRole('button', { name: 'Set password', exact: true })).toBeEnabled()
    })
  }

  test('same_password is shown next to the field and focuses it', async ({ page }) => {
    await stubSupabase(page, { status: 422, body: { code: 422, error_code: 'same_password', msg: 'same' } })
    await submitPassword(page)
    await expect(page.getByText('This is already your password. Choose a different one.')).toBeVisible()
    await expect(page.getByLabel('New password', { exact: true })).toBeFocused()
  })

  test('with no session at all it redirects to /link-expired, which fits 320px with 44px links', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/auth/set-password')
    await expect(page).toHaveURL(/\/link-expired$/)
    await expect(page.getByRole('heading', { level: 1, name: 'This link has expired' })).toBeVisible()
    for (const name of ['Request a new link', 'Back to login']) {
      expect((await page.getByRole('link', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
})
