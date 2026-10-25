import { expect, test, type Page } from '@playwright/test'
import { mockAuth, mockGoogle } from '../shared/session'

// Regression: a first-time Google user used to get no tour because the gate waited for the cookie banner to be answered.
// Supabase Auth, the Google redirect and /users/me are mocked (see mockGoogle); nothing leaves the browser.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

async function googleSignIn(page: Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  await expect(page).toHaveURL(/\/profile$/)
}

const welcome = (page: Page) => page.getByRole('dialog', { name: 'Welcome to SilhouFit' })
const cookieNotice = (page: Page) => page.getByRole('region', { name: 'Cookie notice' })

test('a brand-new Google user gets the welcome tour without answering the cookie banner', async ({ page }) => {
  await mockAuth(page, { brandNew: true })
  await mockGoogle(page, { brandNew: true })
  await googleSignIn(page)

  await expect(welcome(page)).toBeVisible()
  await expect(cookieNotice(page)).toBeHidden()
})

test('the cookie banner returns once the tour is skipped', async ({ page }) => {
  await mockAuth(page, { brandNew: true })
  await mockGoogle(page, { brandNew: true })
  await googleSignIn(page)

  await welcome(page).getByRole('button', { name: 'Skip tour' }).click()
  await expect(welcome(page)).toBeHidden()
  await expect(cookieNotice(page)).toBeVisible()
})

test('with cookie consent already accepted the welcome tour still appears', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await mockAuth(page, { brandNew: true })
  await mockGoogle(page, { brandNew: true })
  await googleSignIn(page)

  await expect(welcome(page)).toBeVisible()
  await expect(cookieNotice(page)).toBeHidden()
})

test('a Google user who already finished the tour is not offered it, and sees the cookie banner', async ({ page }) => {
  await mockAuth(page)
  await mockGoogle(page)
  await googleSignIn(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Demo Shopper' })).toBeVisible()
  await expect(cookieNotice(page)).toBeVisible()
  await expect(welcome(page)).toHaveCount(0)
})

test('a staff Google user is not offered the tour', async ({ page }) => {
  await mockAuth(page, { brandNew: true })
  await mockGoogle(page, { brandNew: true })
  // Registered last, so it wins over the customer profile mockAuth serves.
  await page.route('**/users/me', (route) =>
    route.fulfill({
      json: {
        id: 'user-1',
        email: 'demo@silhoufit.com',
        role: 'staff',
        firstName: 'Demo',
        middleName: null,
        lastName: 'Staff',
        suffix: null,
        fullName: 'Demo Staff',
        avatarUrl: null,
        createdAt: '2026-01-15T08:30:00.000Z',
        updatedAt: '2026-01-15T08:30:00.000Z',
      },
      headers: CORS,
    }),
  )
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()

  await expect(page).not.toHaveURL(/\/auth\/callback/)
  await expect(page.getByRole('region', { name: 'Cookie notice' })).toBeVisible()
  await expect(welcome(page)).toHaveCount(0)
})
