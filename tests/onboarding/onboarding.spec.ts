import { expect, test, type Page } from '@playwright/test'
import { DEMO, mockAuth } from '../shared/session'
import { DEVICE_MATRIX } from '../shared/viewports'

// Supabase Auth is mocked with a brand-new user (no onboarding flag), so the tour is offered after sign-in.
// 320 and 768 come from the shared device matrix; 1280 is the laptop width it does not list.
const SIZES = [
  ...DEVICE_MATRIX.filter((device) => device.width === 320 || device.width === 768),
  { name: 'laptop 1280', width: 1280, height: 800 },
]

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

test.beforeEach(async ({ page }) => {
  await mockAuth(page, { brandNew: true })
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
}

for (const size of SIZES) {
  test.describe(`${size.name} (${size.width}px)`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('a new user is offered the tour, steps through it and finishes', async ({ page }) => {
      // No profile saved yet (404), so the tour offers the body measurements page after the address step.
      await page.route('**/users/me/body-profile', (route) =>
        route.request().method() === 'OPTIONS'
          ? route.fulfill({ status: 204, headers: CORS })
          : route.fulfill({ status: 404, json: {}, headers: CORS }),
      )
      await signIn(page)
      const welcome = page.getByRole('dialog', { name: 'Welcome to SilhouFit' })
      await expect(welcome).toBeVisible()
      await welcome.getByRole('button', { name: 'Start the tour' }).click()

      await expect(page).toHaveURL(/\/shop$/)
      const card = page.getByRole('dialog', { name: 'Explore the shop' })
      await expect(card).toBeVisible()
      await expect(card.getByText('Step 1 of 5')).toBeVisible()

      // The card never forces a sideways scroll.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

      await card.getByRole('button', { name: 'Next', exact: true }).click()
      await card.getByRole('button', { name: 'Back', exact: true }).click()
      await expect(card.getByText('Step 1 of 5')).toBeVisible()

      // Walk to the end; Finish is on the last stop. The card's name changes with each step.
      const current = page.getByRole('dialog')
      for (let i = 0; i < 20; i += 1) {
        if (await current.getByRole('button', { name: 'Finish', exact: true }).isVisible()) break
        await current.getByRole('button', { name: 'Next', exact: true }).click()
      }
      await current.getByRole('button', { name: 'Finish', exact: true }).click()
      // The optional address step comes first, then the optional body measurements page; skipping both goes on to the completion card.
      await page.getByRole('dialog', { name: 'Save your delivery address' }).getByRole('button', { name: 'Skip this step' }).click()
      await expect(page).toHaveURL(/\/profile\/measurements$/)
      await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
      await expect(page.getByRole('dialog', { name: "You're Ready to Shop!" })).toBeVisible()
      await page.getByRole('button', { name: 'Start Shopping' }).click()
      await expect(page).toHaveURL(/\/shop$/)
    })

    test('Skip tour dismisses it with a toast and it is not offered again', async ({ page }) => {
      await signIn(page)
      await page.getByRole('dialog', { name: 'Welcome to SilhouFit' }).getByRole('button', { name: 'Skip tour' }).click()
      await expect(page.getByText('Tour skipped. Replay it any time from your profile.')).toBeVisible()
      await page.goto('/shop')
      await expect(page.getByRole('dialog', { name: 'Welcome to SilhouFit' })).toHaveCount(0)
    })
  })
}

// Small phones, a 640 tablet edge and 768 are where the card is tallest compared with its target.
const FIT_SIZES = [
  { width: 320, height: 568 },
  { width: 320, height: 480 },
  { width: 640, height: 900 },
  { width: 768, height: 1024 },
]
type Rect = { left: number; top: number; right: number; bottom: number }

for (const size of FIT_SIZES) {
  test(`every stop keeps its buttons in view and its target clear of the card at ${size.width}x${size.height}`, async ({ page }) => {
    // Eleven stops, some of which wait out the target search before they settle.
    test.setTimeout(120_000)
    await page.setViewportSize(size)
    await signIn(page)
    await page.getByRole('dialog', { name: 'Welcome to SilhouFit' }).getByRole('button', { name: 'Start the tour' }).click()
    const card = page.getByRole('dialog').filter({ hasText: /Step \d of \d/ })
    const hole = page.locator('[aria-hidden="true"].fixed.border-chrome-strong')
    const rectOf = async (target: typeof card) => (await target.boundingBox()) as { x: number; y: number; width: number; height: number }

    for (let stop = 0; stop < 20; stop += 1) {
      await expect(card.getByText('Finding it on the page…')).toHaveCount(0, { timeout: 5000 })
      // Wait for the scroll and the spotlight to settle.
      let last = ''
      for (let i = 0; i < 40; i += 1) {
        await page.waitForTimeout(100)
        const now = JSON.stringify([await card.boundingBox(), await hole.boundingBox({ timeout: 500 }).catch(() => null), await page.evaluate(() => scrollY)])
        if (now === last) break
        last = now
      }
      const box = await rectOf(card)
      const buttons = ['Skip tour', 'Back', /^(Next|Finish)$/]
      for (const name of buttons) {
        const b = await rectOf(card.getByRole('button', { name }))
        expect(b.y, `${name} top`).toBeGreaterThanOrEqual(box.y - 1)
        expect(b.y + b.height, `${name} bottom`).toBeLessThanOrEqual(Math.min(box.y + box.height, size.height) + 1)
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.x + b.width).toBeLessThanOrEqual(size.width + 1)
        expect(b.height).toBeGreaterThanOrEqual(43.5)
      }
      const h = await hole.boundingBox({ timeout: 500 }).catch(() => null)
      if (h) {
        const a: Rect = { left: h.x, top: h.y, right: h.x + h.width, bottom: h.y + h.height }
        const c: Rect = { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }
        const overlaps = a.left < c.right - 1 && a.right > c.left + 1 && a.top < c.bottom - 1 && a.bottom > c.top + 1
        expect(overlaps, `hole ${JSON.stringify(a)} vs card ${JSON.stringify(c)}`).toBe(false)
      }
      const next = card.getByRole('button', { name: 'Finish', exact: true })
      if (await next.isVisible()) break
      await card.getByRole('button', { name: 'Next', exact: true }).click()
    }
  })
}

test('the cart stop still highlights the top bar cart when the catalogue fails to load', async ({ page }) => {
  await signIn(page)
  await page.getByRole('dialog', { name: 'Welcome to SilhouFit' }).getByRole('button', { name: 'Start the tour' }).click()
  await expect(page.getByRole('dialog', { name: 'Explore the shop' })).toBeVisible()
  // The tour resumes from sessionStorage; the dev-only ?fail makes the catalogue request fail, so there is no sample piece.
  await page.goto('/shop?fail')
  const card = page.getByRole('dialog').filter({ hasText: /Step \d of \d/ })
  await expect(card).toBeVisible()
  for (let i = 0; i < 5; i += 1) await card.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(card.getByText('Your cart is here, with a count of what you have added.')).toBeVisible()
  const hole = page.locator('[aria-hidden="true"].fixed.border-chrome-strong')
  await expect(hole).toBeVisible()
  const cart = await page.locator('[data-tour="cart"]:visible').first().boundingBox()
  const ring = await hole.boundingBox()
  expect(ring!.x).toBeLessThanOrEqual(cart!.x)
  expect(ring!.x + ring!.width).toBeGreaterThanOrEqual(cart!.x + cart!.width)
})

test('Replay the tour on the profile opens the first stop', async ({ page }) => {
  await signIn(page)
  await page.getByRole('dialog', { name: 'Welcome to SilhouFit' }).getByRole('button', { name: 'Skip tour' }).click()
  await page.getByRole('button', { name: 'Replay the tour' }).click()
  await expect(page.getByRole('dialog', { name: 'Explore the shop' })).toBeVisible()
  await page.getByRole('button', { name: 'Close tour' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
