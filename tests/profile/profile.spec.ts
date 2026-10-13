import { expect, test, type Page } from '@playwright/test'
import { DEMO, mockAuth } from '../shared/session'
import { DEVICE_MATRIX } from '../shared/viewports'

// Supabase Auth and /users/me are mocked (see mockAuth). Each test signs in through the real form first.
test.beforeEach(async ({ page }) => {
  await mockAuth(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

test('signing in without a next lands on the profile page with the user data', async ({ page }) => {
  await signIn(page)
  await expect(page).toHaveTitle('Your profile — SilhouFit')
  const heading = page.getByRole('heading', { level: 1, name: 'Demo Shopper' })
  await expect(heading).toBeVisible()
  await expect(heading).toBeFocused()
  await expect(page.getByText(DEMO.email, { exact: true })).toBeVisible()
  await expect(page.getByText('January 15, 2026')).toBeVisible()
})

test('shows the error card for a 500 and loads the profile on Try again', async ({ page }) => {
  await signIn(page)
  let calls = 0
  await page.route('**/users/me', (route) => {
    calls += 1
    return calls === 1 ? route.fulfill({ status: 500, json: {}, headers: CORS }) : route.fallback()
  })
  await page.goto('/profile')

  await expect(page.getByRole('alert')).toContainText("We couldn't load your profile")
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Demo Shopper' })).toBeVisible()
})

test('sends the user to sign in, returning to the profile, when the token is rejected', async ({ page }) => {
  await signIn(page)
  await page.route('**/users/me', (route) => route.fulfill({ status: 401, json: {}, headers: CORS }))
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/)
})

test('Sign out ends at the home page, and the account menu does the same', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/$/)

  await signIn(page)
  await page.getByRole('button', { name: 'Account, Demo Shopper' }).click()
  await page.getByRole('group', { name: 'Account' }).getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('sends a signed-out visitor to sign in first', async ({ page }) => {
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/)
})

for (const { name, width, height } of DEVICE_MATRIX) {
  test(`has no horizontal scroll at ${name} (${width}x${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await signIn(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Demo Shopper' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

for (const width of [320, 1280]) {
  test(`the skeleton and the loaded card are the same height at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signIn(page)

    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/users/me', async (route) => {
      await gate
      await route.fallback()
    })
    await page.goto('/profile')

    const skeleton = page.getByRole('status', { name: 'Loading your profile' })
    await expect(skeleton).toBeVisible()
    const skeletonHeight = (await skeleton.boundingBox())!.height

    release()
    const card = page.getByRole('region', { name: 'Your profile' })
    await expect(card).toBeVisible()
    const loadedHeight = (await card.boundingBox())!.height
    expect(Math.abs(loadedHeight - skeletonHeight)).toBeLessThanOrEqual(1)
  })
}
