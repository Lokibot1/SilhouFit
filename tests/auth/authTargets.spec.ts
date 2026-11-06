import { expect, test, type Locator, type Page } from '@playwright/test'
import { stubUsersApi } from '../admin/usersApiStub'

// Touch targets (44px) on the pages without the photo panel, and the copy for links that expired. Supabase and /users/me are stubbed.

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '')
const jwt = () => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'inv-1', role: 'authenticated', exp: 4_102_444_800 })}.sig`
const USER = { id: 'inv-1', aud: 'authenticated', role: 'authenticated', email: 'invited@example.com', app_metadata: { provider: 'email', providers: ['email'] }, identities: [{ provider: 'email' }], user_metadata: {} }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await stubUsersApi(page)
})

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

const landing = `/auth/callback#access_token=${jwt()}&refresh_token=r&expires_in=3600&token_type=bearer&type=invite`

async function expectTall(locator: Locator, min = 44) {
  const box = await locator.boundingBox()
  expect(box, 'the control is on screen').not.toBeNull()
  expect(box!.height).toBeGreaterThanOrEqual(min - 0.5)
}

for (const width of [768, 1024, 1920]) {
  test(`set-password inputs, button and logo link are 44px at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await stubSupabase(page)
    await page.goto(landing)
    await expect(page.getByRole('heading', { level: 1, name: 'Choose your password' })).toBeVisible()
    await expectTall(page.getByLabel('New password', { exact: true }))
    await expectTall(page.getByLabel('Confirm password', { exact: true }))
    await expectTall(page.getByRole('button', { name: 'Set password', exact: true }))
    await expectTall(page.getByRole('link', { name: 'KRAL home' }))
  })

  test(`forgot-password controls and logo link are 44px at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/forgot-password')
    await expectTall(page.getByLabel('Email', { exact: true }))
    await expectTall(page.locator('form button[type="submit"]').first())
    await expectTall(page.getByRole('link', { name: 'KRAL home' }))
  })
}

test('the logo keeps its size: only the hit area grew', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/forgot-password')
  const logo = await page.getByRole('link', { name: 'KRAL home' }).locator('svg').boundingBox()
  expect(logo!.height).toBeLessThanOrEqual(24.5)
})

test.describe('expired links', () => {
  const urls = [
    '/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    '/auth/callback?error=access_denied&error_code=otp_expired',
  ]
  for (const url of urls) {
    test(`${url.slice(0, 40)}... says the link expired and offers a new reset email`, async ({ page }) => {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1, name: 'This link has expired or was already used' })).toBeVisible()
      await expect(page.getByText('cancelled')).toHaveCount(0)
      await expect(page).toHaveTitle('Link expired — KRAL')
      await page.getByRole('link', { name: 'Send a new reset email' }).click()
      await expect(page).toHaveURL(/\/forgot-password$/)
    })
  }

  test('a real Google cancellation keeps its own copy', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied&error_description=User+denied')
    await expect(page.getByRole('heading', { level: 1, name: 'You cancelled Google sign-in' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Send a new reset email' })).toHaveCount(0)
  })

  test('set-password with a gone session (403 session_not_found) says the link expired', async ({ page }) => {
    await stubSupabase(page, { status: 403, body: { code: 403, error_code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' } })
    await page.goto(landing)
    await page.getByLabel('New password', { exact: true }).fill('Sup3r$ecret1')
    await page.getByLabel('Confirm password', { exact: true }).fill('Sup3r$ecret1')
    await page.getByRole('button', { name: 'Set password', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('This link has expired.')
    await expect(page.getByText('went wrong on our side')).toHaveCount(0)
  })
})
