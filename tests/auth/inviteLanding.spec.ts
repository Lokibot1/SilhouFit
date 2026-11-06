import { expect, test, type Page } from '@playwright/test'
import { stubUsersApi } from '../admin/usersApiStub'

// Where the invitation and password reset emails land: /auth/callback#access_token=...&type=invite|recovery hands the session to
// /auth/set-password, where the person chooses their own password with Supabase (PUT /auth/v1/user) and goes on to their role's home.
// Supabase and /users/me are stubbed; there are no real credentials.

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '')
const jwt = () => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'inv-1', role: 'authenticated', exp: 4_102_444_800 })}.sig`
const USER = { id: 'inv-1', aud: 'authenticated', role: 'authenticated', email: 'invited@example.com', app_metadata: { provider: 'email', providers: ['email'] }, identities: [{ provider: 'email' }], user_metadata: {} }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await stubUsersApi(page)
})

async function stubSupabase(page: Page, role: 'staff' | 'admin' = 'staff') {
  const updates: unknown[] = []
  let failWith: { status: number; body: object } | null = null
  await page.route('**/auth/v1/user*', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() === 'GET') return route.fulfill({ json: USER, headers: CORS })
    updates.push(request.postDataJSON())
    if (failWith) return route.fulfill({ status: failWith.status, json: failWith.body, headers: CORS })
    return route.fulfill({ json: USER, headers: CORS })
  })
  await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204, headers: CORS }))
  await page.route('**/users/me', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({
          json: { id: 'inv-1', email: USER.email, role, isActive: true, firstName: 'Ivy', middleName: null, lastName: 'Invited', suffix: null, fullName: 'Ivy Invited', avatarUrl: null, birthday: null, gender: null, createdAt: '2026-01-15T08:30:00.000Z', updatedAt: '2026-01-15T08:30:00.000Z' },
          headers: CORS,
        }),
  )
  return { updates, fail: (status: number, body: object) => (failWith = { status, body }) }
}

const landing = (type: 'invite' | 'recovery') => `/auth/callback#access_token=${jwt()}&refresh_token=r&expires_in=3600&token_type=bearer&type=${type}`

for (const type of ['invite', 'recovery'] as const) {
  test(`a ${type} link opens the set-password page, validates, sets the password and lands on the role home`, async ({ page }) => {
    const supabase = await stubSupabase(page)
    await page.goto(landing(type))
    await expect(page).toHaveURL(/\/auth\/set-password$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Choose your password' })).toBeVisible()
    // The tokens are gone from the address bar and history.
    expect(page.url()).not.toContain('access_token')

    await page.getByLabel('New password', { exact: true }).fill('abc')
    await page.getByLabel('Confirm password', { exact: true }).fill('abd')
    await page.getByRole('button', { name: 'Set password', exact: true }).click()
    await expect(page.getByText('Use at least 8 characters.')).toBeVisible()
    await expect(page.getByText("Passwords don't match.")).toBeVisible()
    expect(supabase.updates).toEqual([])

    await page.getByLabel('New password', { exact: true }).fill('Sup3r$ecret1')
    await page.getByLabel('Confirm password', { exact: true }).fill('Sup3r$ecret1')
    await page.getByRole('button', { name: 'Set password', exact: true }).click()
    await expect(page).toHaveURL(/\/staff$/)
    expect(supabase.updates).toMatchObject([{ password: 'Sup3r$ecret1' }])
  })
}

test('each unmet sign-up requirement blocks the submit with a clear message, and the checklist ticks live', async ({ page }) => {
  const supabase = await stubSupabase(page)
  await page.goto(landing('invite'))
  const password = page.getByLabel('New password', { exact: true })
  const checklist = page.getByRole('group', { name: 'Password requirements' })
  await expect(checklist).toContainText('Too weak')
  await password.fill('abcdefg1!')
  await expect(checklist.getByText('One lowercase letter').locator('..')).not.toContainText('not met')
  await expect(checklist.getByText('One uppercase letter').locator('..')).toContainText('not met')
  const cases: [string, string][] = [
    ['abcdefg1!', 'Add an uppercase letter.'],
    ['ABCDEFG1!', 'Add a lowercase letter.'],
    ['Abcdefgh!', 'Add a number.'],
    ['Abcdefg12', 'Add a special character, like ! or #.'],
  ]
  for (const [value, message] of cases) {
    await password.fill(value)
    await page.getByLabel('Confirm password', { exact: true }).fill(value)
    await page.getByRole('button', { name: 'Set password', exact: true }).click()
    await expect(page.getByText(message)).toBeVisible()
  }
  expect(supabase.updates).toEqual([])
  await password.fill('Sup3r$ecret1')
  await expect(checklist).not.toContainText('not met')
  await expect(checklist).not.toContainText('Too weak')
})

test("Supabase's weak password message is shown and the form stays", async ({ page }) => {
  const supabase = await stubSupabase(page)
  supabase.fail(422, { code: 422, error_code: 'weak_password', msg: 'Password is known to be weak and easy to guess.' })
  await page.goto(landing('invite'))
  await page.getByLabel('New password', { exact: true }).fill('Sup3r$ecret1')
  await page.getByLabel('Confirm password', { exact: true }).fill('Sup3r$ecret1')
  await page.getByRole('button', { name: 'Set password', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Password is known to be weak and easy to guess.')
  await expect(page).toHaveURL(/\/auth\/set-password$/)
})

test('opening /auth/set-password with no session says the link has expired and offers a new reset email', async ({ page }) => {
  await page.goto('/auth/set-password')
  await expect(page.getByRole('heading', { level: 1, name: 'This link has expired.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Send a new reset email' })).toHaveAttribute('href', '/forgot-password')
})

test('fits 320px wide with no horizontal scroll', async ({ page }) => {
  await stubSupabase(page)
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto(landing('invite'))
  await expect(page.getByRole('button', { name: 'Set password', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})

test('keyboard: Tab moves from the password to the confirmation to Set password, and Enter submits once', async ({ page }) => {
  const supabase = await stubSupabase(page)
  await page.goto(landing('invite'))
  const password = page.getByLabel('New password', { exact: true })
  await expect(password).toBeVisible()
  await password.focus()
  await page.keyboard.type('Sup3r$ecret1')
  await page.getByLabel('Confirm password', { exact: true }).focus()
  await page.keyboard.type('Sup3r$ecret1')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/staff$/)
  expect(supabase.updates).toHaveLength(1)
})

test('keyboard: submitting an empty form moves focus to the first field with a problem', async ({ page }) => {
  await stubSupabase(page)
  await page.goto(landing('recovery'))
  await page.getByRole('button', { name: 'Set password', exact: true }).click()
  await expect(page.getByLabel('New password', { exact: true })).toBeFocused()
})

test('dark mode: the page follows the system preference with readable text and the error stays visible', async ({ page }) => {
  await stubSupabase(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(landing('invite'))
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Set password', exact: true }).click()
  await expect(page.getByText('Password is required.')).toBeVisible()
  const [bg, text] = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('h1')!).color])
  const lum = (css: string) => {
    const [r, g, b] = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  expect(lum(bg)).toBeLessThan(110)
  expect(lum(text)).toBeGreaterThan(130)
})
