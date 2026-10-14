import { expect, test, type Page } from '@playwright/test'
import { DEMO, mockAuth, mockGoogle, signedIn } from '../shared/session'

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

// supabase-js keeps the session under an `sb-*-auth-token` key; none may outlive a flow that did not finish.
const sbKeys = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('sb-') && key.endsWith('-auth-token')))

async function signInByEmail(page: Page) {
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('the callback tab title says what happened', async ({ page }) => {
  await mockGoogle(page, { cancelled: true })
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  await expect(page).toHaveTitle('Google sign-in cancelled — SilhouFit')
})

test('the callback tab title names a failure', async ({ page }) => {
  await mockGoogle(page)
  await page.route('**/users/me', (route) => route.fulfill({ status: 404, json: {}, headers: CORS }))
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveTitle("Couldn't sign you in — SilhouFit")
  await expect.poll(() => sbKeys(page)).toEqual([])
})

test('reloading the callback while the profile loads finishes the sign-in', async ({ page }) => {
  await mockGoogle(page)
  let hold = true
  await page.route('**/users/me', (route) => (hold ? undefined : route.fallback()))
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  // The code is exchanged and gone from the URL; only /users/me is outstanding.
  await expect(page.getByRole('status', { name: 'Signing you in with Google' })).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/callback$/)
  await expect.poll(() => sbKeys(page)).toHaveLength(1)

  hold = false
  await page.reload()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Demo Shopper' })).toBeVisible()
})

test('leaving the callback by any link after a retryable failure leaves no Supabase token', async ({ page }) => {
  await mockGoogle(page)
  await page.route('**/users/me', (route) => route.fulfill({ status: 500, json: {}, headers: CORS }))
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  expect(await sbKeys(page)).toHaveLength(1)

  // The result card has no header, so move through the router the way any in-app link would.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/shop')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page).toHaveURL(/\/shop/)
  await expect.poll(() => sbKeys(page)).toEqual([])
})

test('a stale ?code= on /login is never exchanged into a session', async ({ page }) => {
  const exchanges: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('grant_type=pkce')) exchanges.push(request.url())
  })
  await mockGoogle(page)
  // Park the Google round trip so the PKCE verifier stays in storage, as after an abandoned sign-in.
  await page.route('**/auth/v1/authorize*', (route) => route.fulfill({ contentType: 'text/html', body: '<p>Google</p>' }))
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  await expect(page.getByText('Google', { exact: true })).toBeVisible()

  await page.goto('/login?code=stale-code')
  const verifiers = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.endsWith('-code-verifier')))
  expect(verifiers.length).toBeGreaterThan(0)
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill('Wrong@1234')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(exchanges).toEqual([])
  expect(await sbKeys(page)).toEqual([])
})

test('an email sign-in clears a Google next path left in the stash', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(() => sessionStorage.setItem('silhoufit-auth-next', '/shop'))
  await signInByEmail(page)
  await expect(page).toHaveURL(/\/profile$/)
  expect(await page.evaluate(() => sessionStorage.getItem('silhoufit-auth-next'))).toBeNull()
})

test('signing out clears a Google next path left in the stash', async ({ page }) => {
  await page.goto('/login')
  await signInByEmail(page)
  await expect(page).toHaveURL(/\/profile$/)
  await page.evaluate(() => sessionStorage.setItem('silhoufit-auth-next', '/shop'))
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/$/)
  expect(await page.evaluate(() => sessionStorage.getItem('silhoufit-auth-next'))).toBeNull()
})

// The skeleton holds the page while its chunk (cancelled) or /users/me (error) is held, then the result takes over.
for (const width of [320, 1280]) {
  for (const state of ['cancelled', 'error'] as const) {
    test(`the loading skeleton and the ${state} card are the same height at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await mockGoogle(page, { cancelled: state === 'cancelled' })
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/AuthCallbackPage*', async (route) => {
        await held
        await route.continue()
      })
      if (state === 'error') {
        await page.route('**/users/me', (route) => route.fulfill({ status: 500, json: {}, headers: CORS }))
      }
      await page.goto('/login')
      await page.getByRole('button', { name: 'Sign in with Google' }).click()

      const skeleton = page.getByRole('status', { name: 'Signing you in with Google' }).locator('.glass-card')
      await expect(skeleton).toBeVisible()
      const skeletonHeight = (await skeleton.boundingBox())!.height
      release()

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const card = page.locator('.glass-card').filter({ has: page.getByRole('heading', { level: 1 }) })
      const cardHeight = (await card.boundingBox())!.height
      expect(Math.abs(cardHeight - skeletonHeight)).toBeLessThanOrEqual(1)
    })
  }
}
