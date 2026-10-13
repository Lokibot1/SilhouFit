import { expect, test, type Page } from '@playwright/test'
import { DEMO, mockSignUp } from '../shared/session'

// Supabase Auth sign-up is mocked; nothing leaves the browser.
const PASSWORD = 'Str0ng!Pass-9'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function fillAndSubmit(page: Page, email: string) {
  await page.goto('/signup')
  await page.getByLabel('First name', { exact: true }).fill('Anne')
  await page.getByLabel('Last name', { exact: true }).fill('Santos')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  // Create account opens the legal flow first; "I understand" on each document ticks the box.
  await page.getByRole('button', { name: 'Create account' }).click()
  for (const name of ['Terms of Service', 'Privacy Policy']) {
    const dialog = page.getByRole('dialog', { name })
    // The button stays disabled until the document is scrolled to its end.
    const understood = dialog.getByRole('button', { name: 'I understand' })
    await expect(async () => {
      await dialog.locator('*').evaluateAll((els) => els.forEach((el) => (el.scrollTop = el.scrollHeight)))
      await expect(understood).toBeEnabled({ timeout: 1000 })
    }).toPass()
    await understood.click()
    await expect(dialog).toBeHidden()
  }
  await page.getByRole('button', { name: 'Create account' }).click()
}

test('sends the details to Supabase and tells the user to check their email', async ({ page }) => {
  const bodies: Record<string, unknown>[] = []
  await mockSignUp(page, bodies)
  await fillAndSubmit(page, 'anne@example.com')

  await expect(page.getByRole('heading', { name: 'Welcome, Anne' })).toBeVisible()
  await expect(page.getByText('anne@example.com')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Go to login' })).toHaveAttribute('href', '/login')
  expect(bodies).toHaveLength(1)
  expect(bodies[0]).toMatchObject({ email: 'anne@example.com', password: PASSWORD })
  expect(bodies[0].data).toMatchObject({ first_name: 'Anne', last_name: 'Santos', full_name: 'Anne Santos' })
})

test('an already-registered email reads exactly like a new one', async ({ page }) => {
  await mockSignUp(page)
  await fillAndSubmit(page, DEMO.email)

  await expect(page.getByRole('heading', { name: 'Welcome, Anne' })).toBeVisible()
  await expect(page.getByText(DEMO.email)).toBeVisible()
})

test('the form has no horizontal scroll at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/signup')
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

// The skeleton card must be as tall as the loaded form at every width, or the swap shifts the page.
for (const width of [320, 360, 375, 390, 414, 640, 768, 1280]) {
  test(`the skeleton card is as tall as the loaded form at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    // Hold the page chunk back so the Suspense skeleton stays on screen.
    await page.route(/SignUpPage\.tsx|SignUpPage-.*\.js/, async (route) => {
      await gate
      await route.continue()
    })
    await page.goto('/signup', { waitUntil: 'commit' })
    const skeleton = page.getByRole('status', { name: 'Loading sign up form' })
    await expect(skeleton).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const skeletonHeight = (await skeleton.locator('.glass-card').boundingBox())!.height

    release()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    const formHeight = (await page.locator('form').locator('xpath=..').boundingBox())!.height
    expect(Math.abs(skeletonHeight - formHeight)).toBeLessThanOrEqual(1)
  })
}
