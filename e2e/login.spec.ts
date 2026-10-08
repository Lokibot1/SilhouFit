import { expect, test, type Locator, type Page } from '@playwright/test'

// The one reserved credential the sign-in stub (src/service/signIn.ts) must accept.
// Every other pair resolves { ok: false, reason: 'invalid' }.
const DEMO = { email: 'demo@silhoufit.com', password: 'Demo@1234' }
const WRONG_PASSWORD = { email: DEMO.email, password: 'Wrong@1234' }
const UNKNOWN_EMAIL = { email: 'nobody@example.com', password: 'Whatever@1' }

const WIDTHS = [320, 640, 768, 1024, 1280, 1920]
const MIN_TARGET = 44

test.beforeEach(async ({ page }) => {
  // Keep the cookie banner out of the way; pick the theme per test.
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

const emailField = (page: Page) => page.getByLabel('Email', { exact: true })
const passwordField = (page: Page) => page.getByLabel('Password', { exact: true })
const rememberMe = (page: Page) => page.getByRole('checkbox', { name: 'Remember me' })
const submit = (page: Page) => page.getByRole('button', { name: 'Sign in', exact: true })

async function fillCredentials(page: Page, { email, password }: { email: string; password: string }) {
  await emailField(page).fill(email)
  await passwordField(page).fill(password)
}

// Keyboard-only: press Tab from wherever focus is until the target holds it.
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 20; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Never reached the target by pressing Tab')
}

test('renders the sign-in form with its own title and meta description', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveTitle('Sign in — SilhouFit')
  await expect(page.getByRole('heading', { level: 1, name: 'Login Form' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
  await expect(emailField(page)).toBeVisible()
  await expect(passwordField(page)).toHaveAttribute('type', 'password')
  await expect(submit(page)).toBeVisible()

  const description = await page.locator('meta[name="description"]').getAttribute('content')
  expect(description?.length).toBeGreaterThanOrEqual(150)
  expect(description?.length).toBeLessThanOrEqual(160)
})

test('has no footer, only the slim auth chrome', async ({ page }) => {
  await page.goto('/about')
  await expect(page.getByRole('contentinfo')).toHaveCount(1) // the selector does find a footer elsewhere
  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1, name: 'Login Form' })).toBeVisible()
  await expect(page.getByRole('contentinfo')).toHaveCount(0)
})

for (const width of WIDTHS) {
  test(`fits ${width}px wide with 44px controls and no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/login')
    await passwordField(page).fill('a') // the show/hide toggle must exist and be measurable
    await expect(submit(page)).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows, `/login overflows horizontally at ${width}px`).toBe(false)

    const controls = [
      emailField(page),
      passwordField(page),
      submit(page),
      page.getByRole('button', { name: 'Sign in with Google' }),
      page.getByRole('button', { name: 'Show password' }),
      page.getByRole('link', { name: 'Forgot password?' }),
      page.getByRole('link', { name: 'Join us today!' }),
      page.getByText('Remember me'),
    ]
    for (const control of controls) {
      const box = await control.boundingBox()
      expect(box, 'control is laid out').not.toBeNull()
      expect(box!.height, `control height at ${width}px`).toBeGreaterThanOrEqual(MIN_TARGET)
    }
    const toggle = await page.getByRole('button', { name: 'Show password' }).boundingBox()
    expect(toggle!.width).toBeGreaterThanOrEqual(MIN_TARGET)
    const label = await page.getByText('Remember me').boundingBox()
    expect(label!.width, `Remember me label width at ${width}px`).toBeGreaterThanOrEqual(MIN_TARGET)
    const join = await page.getByRole('link', { name: 'Join us today!' }).boundingBox()
    expect(join!.width, `Join link width at ${width}px`).toBeGreaterThanOrEqual(MIN_TARGET)
  })
}

test('signs in with the keyboard alone and lands on the welcome panel, staying on /login', async ({ page }) => {
  await page.goto('/login')

  await tabTo(page, emailField(page))
  await page.keyboard.type(DEMO.email)
  await tabTo(page, passwordField(page))
  await page.keyboard.type(DEMO.password)
  await page.keyboard.press('Enter')

  const heading = page.getByRole('heading', { name: 'Welcome back' })
  await expect(heading).toBeVisible()
  await expect(heading).toBeFocused()
  await expect(page.getByText('Signed in. Welcome back.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('shows one generic alert for wrong credentials, the same for an unknown email and a wrong password', async ({ page }) => {
  await page.goto('/login')
  const alert = page.getByRole('alert')

  await fillCredentials(page, UNKNOWN_EMAIL)
  await submit(page).click()
  await expect(alert).toHaveCount(1)
  await expect(alert).toContainText(/email or password/i)
  const unknownText = await alert.textContent()

  await fillCredentials(page, WRONG_PASSWORD)
  await submit(page).click()
  await expect(alert).toHaveCount(1)
  await expect(alert).toHaveText(unknownText!)

  await expect(page).toHaveURL(/\/login$/)
  await expect(emailField(page)).not.toHaveAttribute('aria-invalid', 'true')
  await expect(passwordField(page)).not.toHaveAttribute('aria-invalid', 'true')
})

test('the show/hide button flips the password between masked and visible', async ({ page }) => {
  await page.goto('/login')
  await passwordField(page).fill(DEMO.password)
  await expect(passwordField(page)).toHaveAttribute('type', 'password')

  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(passwordField(page)).toHaveAttribute('type', 'text')
  await expect(passwordField(page)).toHaveValue(DEMO.password)

  await page.getByRole('button', { name: 'Hide password' }).click()
  await expect(passwordField(page)).toHaveAttribute('type', 'password')
})

test('tabs email, password, show toggle, Remember me, Forgot password, submit, Google, Join link, with a visible focus ring on the checkbox', async ({ page }) => {
  await page.goto('/login')
  await emailField(page).focus()
  const order = [
    passwordField(page),
    page.getByRole('button', { name: 'Show password' }),
    rememberMe(page),
    page.getByRole('link', { name: 'Forgot password?' }),
    submit(page),
    page.getByRole('button', { name: 'Sign in with Google' }),
    page.getByRole('link', { name: 'Join us today!' }),
  ]
  for (const target of order) {
    await page.keyboard.press('Tab')
    await expect(target).toBeFocused()
    if (target === order[2]) {
      const outline = await page.getByText('Remember me').locator('span[aria-hidden]').evaluate((el) => getComputedStyle(el).outlineStyle)
      expect(outline).not.toBe('none')
    }
  }
})

test('Remember me is unchecked by default and toggles with Space', async ({ page }) => {
  await page.goto('/login')
  await expect(rememberMe(page)).not.toBeChecked()
  await rememberMe(page).focus()
  await page.keyboard.press('Space')
  await expect(rememberMe(page)).toBeChecked()
  await page.getByText('Remember me').click()
  await expect(rememberMe(page)).not.toBeChecked()
})

test('keeps the order submit, divider, Google, then the sign-up line', async ({ page }) => {
  await page.goto('/login')
  const y = async (l: Locator) => (await l.boundingBox())!.y
  const ys = [
    await y(submit(page)),
    await y(page.getByText('or continue with')),
    await y(page.getByRole('button', { name: 'Sign in with Google' })),
    await y(page.getByRole('link', { name: 'Join us today!' })),
  ]
  expect(ys).toEqual([...ys].sort((a, b) => a - b))
  await expect(page.getByText('Not a member yet?')).toBeVisible()
})

test('links between /login and /signup in both directions', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Join us today!' }).click()
  await expect(page).toHaveURL(/\/signup$/)

  await page.getByRole('link', { name: 'I already have an account' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Login Form' })).toBeVisible()
})

test('"Forgot password?" leads to the reset page', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible()
})

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
  })

  test('renders every control visibly with readable heading text', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('heading', { level: 1, name: 'Login Form' })).toBeVisible()
    await expect(emailField(page)).toBeVisible()
    await expect(passwordField(page)).toBeVisible()
    await expect(submit(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()

    const { heading, background } = await page.evaluate(() => ({
      heading: getComputedStyle(document.querySelector('h1')!).color,
      background: getComputedStyle(document.body).backgroundColor,
    }))
    expect(heading).not.toBe(background)
  })
})
