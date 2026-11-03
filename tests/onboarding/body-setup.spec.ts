import { expect, test, type Page } from '@playwright/test'
import { mockAddresses } from '../shared/addresses'
import { DEMO, mockAuth } from '../shared/session'
import { ADDRESS } from '../fixtures/addresses'

// The optional "Body Measurements & Avatar Setup" phase that follows the address step of the tour.
// Supabase Auth, /users/me and /users/me/body-profile are mocked; the app code under test is real.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const DRAFT_KEY = 'silhoufit-body-setup'
const SAVED_PROFILE = {
  heightCm: 168, weightKg: null, shoulderWidthCm: null, chestCm: 90, bustCm: null, torsoLengthCm: null, waistCm: null,
  hipsCm: null, inseamCm: null, outseamCm: null, thighCm: null, armLengthCm: 59, bodyModel: 'female', bodyBuild: 'lean',
}

/**
 * Answers /users/me/body-profile from `profile` (404 when null). Every PUT body is pushed to `puts` and becomes the profile;
 * every PATCH body is pushed to `puts.patches` and is merged into it (404 when no profile is saved, as the API does).
 */
async function mockBodyProfile(page: Page, profile: object | null = null) {
  const patches: Array<Record<string, unknown>> = []
  const puts = Object.assign([] as Array<Record<string, unknown>>, { patches })
  let stored = profile
  await page.route('**/users/me/body-profile', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() === 'PUT') {
      const body = request.postDataJSON()
      puts.push(body)
      stored = body
      return route.fulfill({ json: body, headers: CORS })
    }
    if (request.method() === 'PATCH') {
      if (!stored) return route.fulfill({ status: 404, json: {}, headers: CORS })
      const body = request.postDataJSON()
      patches.push(body)
      stored = { ...stored, ...body }
      return route.fulfill({ json: stored, headers: CORS })
    }
    return stored ? route.fulfill({ json: stored, headers: CORS }) : route.fulfill({ status: 404, json: {}, headers: CORS })
  })
  return puts
}

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  // The first sign-in on a cold dev server compiles the profile route, which can take longer than the default 5 seconds.
  await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 })
}

/** Starts the tour from its welcome card and presses through to Finish. */
async function finishTour(page: Page) {
  await page.getByRole('dialog', { name: 'Welcome to SilhouFit' }).getByRole('button', { name: 'Start the tour' }).click()
  const current = page.getByRole('dialog')
  for (let i = 0; i < 20; i += 1) {
    if (await current.getByRole('button', { name: 'Finish', exact: true }).isVisible()) break
    await current.getByRole('button', { name: 'Next', exact: true }).click()
  }
  await current.getByRole('button', { name: 'Finish', exact: true }).click()
}

const next = (page: Page) => page.getByRole('button', { name: /^(Next|Review)$/ }).click()
const model = (page: Page, which: 'male' | 'female') =>
  page.locator('label', { hasText: which === 'male' ? 'A male body shape' : 'A female body shape' }).click()

/** From the height step, moves through every remaining step to the review screen. */
async function walkToReview(page: Page, steps: number) {
  for (let i = 0; i < steps; i += 1) await next(page)
  await expect(page.getByRole('heading', { name: 'Review your measurements' })).toBeVisible()
}

async function finishSetup(page: Page) {
  await page.getByRole('checkbox', { name: /Save my measurements to my account/ }).check({ force: true })
  await page.getByRole('button', { name: /Finish Setup/ }).click()
}

const storageDump = (page: Page) =>
  page.evaluate(() => ({
    local: Object.entries(localStorage).map(([k, v]) => `${k}=${v}`).join('\n'),
    draft: sessionStorage.getItem('silhoufit-body-setup'),
  }))

test.describe('as a brand-new customer in the tour', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000) // a dozen steps through the lazy-loaded studio on a shared dev server
    await mockAuth(page, { brandNew: true })
    await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  })

  test('full path: address skipped, avatar and measurements saved, completion card follows', async ({ page }) => {
    const puts = await mockBodyProfile(page)
    await signIn(page)
    await finishTour(page)
    await page.getByRole('dialog', { name: 'Save your delivery address' }).getByRole('button', { name: 'Skip this step' }).click()

    await expect(page).toHaveURL(/\/profile\/measurements$/)
    await expect(page.getByText('Step 1 of 15').or(page.getByText('Step 1 of 14'))).toBeVisible()
    await model(page, 'female')
    await next(page)
    await page.locator('label', { hasText: 'Slim, defined physique' }).click()
    await next(page)

    await expect(page.getByRole('heading', { name: 'Height' })).toBeFocused()
    await page.getByRole('textbox').fill('165')
    await next(page) // weight
    await next(page) // shoulders
    await next(page) // sleeve
    await page.getByRole('textbox').fill('58')
    await next(page)
    await expect(page.getByRole('heading', { name: 'Bust' })).toBeVisible()
    await walkToReview(page, 8)
    await expect(page.getByText('Step 15 of 15')).toBeVisible()
    await expect(page.getByRole('button', { name: /Finish Setup/ })).toBeDisabled()
    await finishSetup(page)

    await expect(page).toHaveURL(/\/profile$/)
    expect(puts).toHaveLength(1)
    expect(puts[0]).toEqual({
      heightCm: 165, weightKg: null, shoulderWidthCm: null, chestCm: null, bustCm: null, torsoLengthCm: null, waistCm: null,
      hipsCm: null, inseamCm: null, outseamCm: null, thighCm: null, armLengthCm: 58, bodyModel: 'female', bodyBuild: 'lean',
    })
    await expect(page.getByRole('dialog', { name: "You're Ready to Shop!" })).toBeVisible()

    const dump = await storageDump(page)
    expect(dump.draft).toBeNull()
    expect(dump.local).not.toContain('165')
  })

  test('skip path: nothing is sent, the saved address is kept and the tour still completes', async ({ page }) => {
    const addresses = await mockAddresses(page, [ADDRESS])
    const puts = await mockBodyProfile(page)
    await signIn(page)
    await finishTour(page)

    // The address is saved, so the tour goes straight to the measurements page.
    await expect(page).toHaveURL(/\/profile\/measurements$/)
    await model(page, 'male')
    await next(page)
    await next(page)
    await page.getByRole('textbox').fill('175')
    expect((await storageDump(page)).draft).toContain('175')

    await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByText('You can add your measurements any time from your profile.')).toBeVisible()
    await expect(page.getByRole('dialog', { name: "You're Ready to Shop!" })).toBeVisible()
    expect(puts).toHaveLength(0)

    const dump = await storageDump(page)
    expect(dump.draft).toBeNull()
    expect(addresses.calls.filter((c) => c.method !== 'GET')).toEqual([])
    expect(dump.local).not.toContain('175')
  })

  test('a replay skips the body step when a profile is already saved', async ({ page }) => {
    await mockAddresses(page, [ADDRESS])
    const puts = await mockBodyProfile(page, SAVED_PROFILE)
    await signIn(page)
    await finishTour(page)

    await expect(page.getByRole('dialog', { name: "You're Ready to Shop!" })).toBeVisible()
    await expect(page).not.toHaveURL(/measurements/)
    expect(puts).toHaveLength(0)
  })
})

test.describe('as a returning customer', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000)
    await mockAuth(page)
    await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  })

  test('reloading mid-measurement restores the step, the values and the unit', async ({ page }) => {
    await mockBodyProfile(page)
    await signIn(page)
    await page.goto('/profile/measurements')
    await model(page, 'male')
    await next(page)
    await next(page)
    await page.getByRole('button', { name: 'in, lb' }).click()
    await page.getByRole('textbox', { name: 'Height (in)' }).fill('70')
    await next(page)
    await expect(page.getByRole('heading', { name: 'Weight' })).toBeVisible()
    await expect(page.getByText('Step 4 of 14')).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Weight' })).toBeVisible()
    await expect(page.getByText('Step 4 of 14')).toBeVisible()
    await expect(page.getByRole('button', { name: 'in, lb' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('textbox', { name: 'Height (in)' })).toHaveValue('70')

    // Kept for this tab only: nothing about the measurements reaches localStorage.
    const dump = await storageDump(page)
    expect(dump.local).not.toMatch(/177\.8|"height"/)
  })

  test('the browser Back button leaves the setup', async ({ page }) => {
    await mockBodyProfile(page)
    await signIn(page)
    await page.getByRole('link', { name: 'Add your measurements' }).click()
    await expect(page).toHaveURL(/\/profile\/measurements$/)
    await model(page, 'male')
    await next(page)

    await page.goBack()
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByRole('region', { name: 'Body measurements' })).toBeVisible()
    await expect(page.getByRole('group', { name: '3D body preview' })).toHaveCount(0)
  })

  test('editing from the profile pre-fills the saved values and saves the change', async ({ page }) => {
    const puts = await mockBodyProfile(page, SAVED_PROFILE)
    await signIn(page)
    const section = page.getByRole('region', { name: 'Body measurements' })
    await expect(section.getByText('168 cm')).toBeVisible()
    await expect(section.getByText('Sleeve length')).toBeVisible()
    await section.getByRole('link', { name: 'Edit measurements' }).click()

    await expect(page).toHaveURL(/\/profile\/measurements$/)
    await expect(page.getByRole('radio', { name: /Female/ })).toBeChecked()
    await next(page)
    await expect(page.getByRole('radio', { name: /Lean/ })).toBeChecked()
    await next(page)
    await expect(page.getByRole('textbox')).toHaveValue('168')
    await page.getByRole('textbox').fill('170')
    await walkToReview(page, 12)
    await finishSetup(page)

    await expect(page).toHaveURL(/\/profile$/)
    // A saved profile is updated, not replaced: only the changed field is sent.
    expect(puts).toHaveLength(0)
    expect(puts.patches).toEqual([{ heightCm: 170 }])
  })

  test('a failed save keeps the answers and Retry sends them again', async ({ page }) => {
    const puts = await mockBodyProfile(page)
    let attempts = 0
    await page.route('**/users/me/body-profile', async (route) => {
      if (route.request().method() === 'PUT' && (attempts += 1) === 1) {
        return route.fulfill({ status: 500, json: {}, headers: CORS })
      }
      return route.fallback()
    })
    await signIn(page)
    await page.goto('/profile/measurements')
    await model(page, 'male')
    await next(page)
    await next(page)
    await page.getByRole('textbox').fill('175')
    await walkToReview(page, 11)
    await finishSetup(page)

    const toast = page.getByRole('alert').filter({ hasText: "We couldn't save your measurements." })
    await expect(toast).toBeVisible()
    await toast.hover() // hovering pauses the toast's 4.5 second auto-dismiss
    await expect(page).toHaveURL(/\/profile\/measurements$/)
    expect((await storageDump(page)).draft).toContain('175')
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page).toHaveURL(/\/profile$/)
    expect(puts).toHaveLength(1)
    expect(puts[0].heightCm).toBe(175)
  })

  test('signing out clears a half-finished draft', async ({ page }) => {
    await mockBodyProfile(page)
    await signIn(page)
    await page.getByRole('link', { name: 'Add your measurements' }).click()
    await model(page, 'male')
    await next(page)
    await next(page)
    await page.getByRole('textbox').fill('175')
    expect((await storageDump(page)).draft).toContain('175')

    await page.goBack()
    await expect(page).toHaveURL(/\/profile$/)
    expect((await storageDump(page)).draft).not.toBeNull() // still this tab's draft until the user signs out
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect((await storageDump(page)).draft).toBeNull()
    expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBeNull()
  })

  test('the setup page asks a signed-out visitor to sign in first', async ({ page }) => {
    await page.goto('/profile/measurements')
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile%2Fmeasurements$/)
  })
})

test.describe('Body profile – Update fields', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000)
    await mockAuth(page)
    await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  })

  // From the profile's Edit link through to the review screen, changing the height when `height` is given.
  async function editToReview(page: Page, height?: string) {
    const section = page.getByRole('region', { name: 'Body measurements' })
    await expect(section.getByText('168 cm')).toBeVisible()
    await section.getByRole('link', { name: 'Edit measurements' }).click()
    await expect(page).toHaveURL(/\/profile\/measurements$/)
    await next(page) // body shape
    await next(page) // build
    await expect(page.getByRole('textbox')).toHaveValue('168')
    if (height) await page.getByRole('textbox').fill(height)
    await walkToReview(page, 12)
  }

  test('editing one measurement of a saved profile sends a PATCH with only that field', async ({ page }) => {
    const sent = await mockBodyProfile(page, SAVED_PROFILE)
    await signIn(page)
    await editToReview(page, '172')
    await finishSetup(page)

    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByText('Measurements saved. SilhouFit can now recommend sizes.')).toBeVisible()
    expect(sent.patches).toEqual([{ heightCm: 172 }])
    expect(sent).toHaveLength(0)
  })

  test('changing nothing sends no request but still shows the success toast', async ({ page }) => {
    const sent = await mockBodyProfile(page, SAVED_PROFILE)
    await signIn(page)
    await editToReview(page)
    await finishSetup(page)

    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByText('Measurements saved. SilhouFit can now recommend sizes.')).toBeVisible()
    expect(sent.patches).toHaveLength(0)
    expect(sent).toHaveLength(0)
  })

  test('a new profile (GET 404) is created with a PUT of every field, not a PATCH', async ({ page }) => {
    const sent = await mockBodyProfile(page)
    await signIn(page)
    await page.getByRole('link', { name: 'Add your measurements' }).click()
    await model(page, 'male')
    await next(page)
    await next(page)
    await page.getByRole('textbox').fill('175')
    await walkToReview(page, 11)
    await finishSetup(page)

    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByText('Measurements saved. SilhouFit can now recommend sizes.')).toBeVisible()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ heightCm: 175, bodyModel: 'male' })
    expect(sent.patches).toHaveLength(0)
  })
})
