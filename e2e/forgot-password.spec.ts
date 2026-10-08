import { expect, test, type Locator, type Page } from '@playwright/test'
import { DEVICE_MATRIX } from './viewports'

const WIDTHS = [320, 640, 768, 1024, 1280, 1920]
const MIN_TARGET = 44

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

const emailField = (page: Page) => page.getByLabel('Email', { exact: true })
const submit = (page: Page) => page.getByRole('button', { name: 'Send reset link', exact: true })
const backLink = (page: Page) => page.getByRole('link', { name: /back to (login|sign in)/i })

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 20; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Never reached the target by pressing Tab')
}

test('renders the reset form with its own title and meta description', async ({ page }) => {
  await page.goto('/forgot-password')
  await expect(page).toHaveTitle('Reset your password — SilhouFit')
  await expect(page.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible()
  await expect(emailField(page)).toBeVisible()
  await expect(submit(page)).toBeVisible()
  await expect(backLink(page)).toHaveAttribute('href', '/login')

  const description = await page.locator('meta[name="description"]').getAttribute('content')
  expect(description?.length).toBeGreaterThanOrEqual(150)
  expect(description?.length).toBeLessThanOrEqual(160)
  await expect(page.getByRole('contentinfo')).toHaveCount(0)
})

for (const width of WIDTHS) {
  test(`fits ${width}px wide with 44px controls and no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/forgot-password')
    await expect(submit(page)).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows, `/forgot-password overflows horizontally at ${width}px`).toBe(false)

    for (const control of [emailField(page), submit(page), backLink(page)]) {
      const box = await control.boundingBox()
      expect(box, 'control is laid out').not.toBeNull()
      expect(box!.height, `control height at ${width}px`).toBeGreaterThanOrEqual(MIN_TARGET)
    }
  })
}

for (const { name, width, height } of DEVICE_MATRIX) {
  test(`${name} ${width}x${height}: no horizontal scroll, every control reachable, submit clickable`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/forgot-password')
    await expect(submit(page)).toBeVisible()

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
      `/forgot-password overflows horizontally at ${width}x${height}`,
    ).toBe(false)

    for (const control of [emailField(page), submit(page), backLink(page)]) {
      await control.scrollIntoViewIfNeeded()
      const box = await control.boundingBox()
      expect(box, 'control is laid out').not.toBeNull()
      expect(box!.height, `control height at ${width}x${height}`).toBeGreaterThanOrEqual(MIN_TARGET)
      expect(box!.x, 'control starts inside the viewport').toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width, 'control ends inside the viewport').toBeLessThanOrEqual(width)
    }

    await submit(page).scrollIntoViewIfNeeded()
    const covered = await submit(page).evaluate((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return !(hit && el.contains(hit))
    })
    expect(covered, 'submit is covered by another element').toBe(false)
    await submit(page).click()
    await expect(page.getByText('Email is required.')).toBeVisible()
  })
}

test('shows an inline error for an empty or malformed email and sends nothing', async ({ page }) => {
  await page.goto('/forgot-password')
  await submit(page).click()
  await expect(page.getByText('Email is required.')).toBeVisible()
  await expect(emailField(page)).toBeFocused()

  await emailField(page).fill('nope')
  await submit(page).click()
  await expect(page.getByText('Enter a valid email like name@example.com.')).toBeVisible()
  await expect(page.getByText(/if an account exists/i)).toHaveCount(0)
})

test('gives the same generic confirmation for any well-formed address, using the keyboard alone', async ({ page }) => {
  const messages: string[] = []
  for (const address of ['demo@silhoufit.com', 'nobody-at-all@example.org']) {
    await page.goto('/forgot-password')
    await tabTo(page, emailField(page))
    await page.keyboard.type(address)
    await page.keyboard.press('Enter')

    const message = page.getByText(/if an account exists/i)
    await expect(message).toBeVisible()
    messages.push((await message.textContent()) ?? '')
    await expect(page.getByText(/expires in 30 minutes/i)).toBeVisible()
    await expect(page.getByText(/no account|not found|doesn't exist|does not exist/i)).toHaveCount(0)
  }
  expect(messages[1]).toBe(messages[0])
})

test('returns to /login from the form and from the confirmation', async ({ page }) => {
  await page.goto('/forgot-password')
  await backLink(page).click()
  await expect(page).toHaveURL(/\/login$/)

  await page.goto('/forgot-password')
  await emailField(page).fill('demo@silhoufit.com')
  await submit(page).click()
  await expect(page.getByText(/if an account exists/i)).toBeVisible()
  await backLink(page).click()
  await expect(page).toHaveURL(/\/login$/)
})

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
  })

  test('renders the form visibly', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible()
    await expect(emailField(page)).toBeVisible()
    await expect(submit(page)).toBeVisible()
  })
})
