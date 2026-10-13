import { expect, test, type Page } from '@playwright/test'
import { mockAuth, mockGoogle, signedIn } from '../shared/session'

// Supabase Auth, the Google redirect and /users/me are mocked (see mockGoogle); nothing leaves the browser.
const CALLBACK = 'http://localhost:5173/auth/callback'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

test.beforeEach(async ({ page }) => {
  await mockAuth(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function readTerms(page: Page) {
  for (const name of ['Terms of Service', 'Privacy Policy']) {
    const dialog = page.getByRole('dialog', { name })
    const understood = dialog.getByRole('button', { name: 'I understand' })
    await expect(async () => {
      await dialog.locator('*').evaluateAll((els) => els.forEach((el) => (el.scrollTop = el.scrollHeight)))
      await expect(understood).toBeEnabled({ timeout: 1000 })
    }).toPass()
    await understood.click()
    await expect(dialog).toBeHidden()
  }
}

test('Sign in with Google asks Supabase for Google, comes back through the callback and lands on the profile', async ({ page }) => {
  const authorize: URL[] = []
  await mockGoogle(page, {}, authorize)
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()

  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Demo Shopper' })).toBeVisible()
  expect(authorize).toHaveLength(1)
  expect(authorize[0].searchParams.get('provider')).toBe('google')
  expect(authorize[0].searchParams.get('redirect_to')).toBe(CALLBACK)
  // Nothing from the round trip is left in the address bar.
  expect(page.url()).not.toContain('code=')
})

test('returns to the page that asked for sign-in, without putting it in redirect_to', async ({ page }) => {
  const authorize: URL[] = []
  await mockGoogle(page, {}, authorize)
  await page.goto('/login?next=%2Fabout%3Fref%3Dgoogle')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()

  await expect(page).toHaveURL(/\/about\?ref=google$/)
  expect(authorize[0].searchParams.get('redirect_to')).toBe(CALLBACK)
})

test('sign-up Google button runs the same flow after the documents are read', async ({ page }) => {
  const authorize: URL[] = []
  await mockGoogle(page, {}, authorize)
  await page.goto('/signup')
  await page.getByRole('button', { name: 'Sign up with Google' }).click()
  await readTerms(page)

  await expect(page).toHaveURL(/\/profile$/)
  expect(authorize).toHaveLength(1)
  expect(authorize[0].searchParams.get('provider')).toBe('google')
  expect(authorize[0].searchParams.get('redirect_to')).toBe(CALLBACK)
})

test('cancelling on Google shows a calm message and a way back to login', async ({ page }) => {
  await mockGoogle(page, { cancelled: true })
  await page.goto('/login?next=%2Fshop')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()

  const heading = page.getByRole('heading', { level: 1, name: 'You cancelled Google sign-in' })
  await expect(heading).toBeVisible()
  await expect(heading).toBeFocused()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(page.url()).not.toContain('error')
  await page.getByRole('link', { name: 'Back to login' }).click()
  await expect(page).toHaveURL(/\/login\?next=%2Fshop$/)
})

test('a missing profile (404) shows what happened and offers only Back to login', async ({ page }) => {
  await mockGoogle(page)
  await page.route('**/users/me', (route) => route.fulfill({ status: 404, json: {}, headers: CORS }))
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()

  await expect(page.getByRole('alert')).toContainText("We couldn't find your profile.")
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Back to login' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('a server error (500) offers Try again and finishes on retry', async ({ page }) => {
  await mockGoogle(page)
  let calls = 0
  await page.route('**/users/me', (route) => {
    calls += 1
    return calls === 1 ? route.fulfill({ status: 500, json: {}, headers: CORS }) : route.fallback()
  })
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()

  await expect(page.getByRole('alert')).toContainText("We couldn't finish signing you in.")
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page).toHaveURL(/\/profile$/)
})

test('opening the callback with no code sends a signed-out visitor to login', async ({ page }) => {
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/login$/)
})

test('opening the callback with no code sends a signed-in user to the profile', async ({ page }) => {
  await signedIn(page)
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/profile$/)
})

test('the callback result has no horizontal scroll at 320px', async ({ page }) => {
  await mockGoogle(page, { cancelled: true })
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'You cancelled Google sign-in' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
