import { expect, test, type Page } from '@playwright/test'
import { DEMO, mockAuth } from '../shared/session'

// The Skin tone slider on the Build step of /profile/measurements. The only hook into the 3D avatar's colour is the
// data-skin-tone attribute on the studio's host div (canvas pixels cannot be read), so it is located by that attribute.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const STORE_KEY = 'silhoufit-skin-tone'
const DEFAULT_HEX = '#d7bd96'
const LIGHTEST_HEX = '#f6ede4'
const DEEPEST_HEX = '#292420'
const WAIT = { timeout: 10_000 }
const SAVED = { heightCm: 170, bodyModel: 'female', bodyBuild: 'lean' }

/** Answers /users/me/body-profile (404 until a PUT). `failFirstPut` answers the first PUT with a 500; `initial` is a profile already saved. */
async function mockBodyProfile(page: Page, { failFirstPut = false, initial = null }: { failFirstPut?: boolean; initial?: object | null } = {}) {
  const puts: Array<Record<string, unknown>> = []
  let stored: object | null = initial
  let attempts = 0
  await page.route('**/users/me/body-profile', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() === 'PUT') {
      attempts += 1
      if (failFirstPut && attempts === 1) return route.fulfill({ status: 500, json: {}, headers: CORS })
      const body = request.postDataJSON()
      puts.push(body)
      stored = body
      return route.fulfill({ json: body, headers: CORS })
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
  await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 })
}

const next = (page: Page) => page.getByRole('button', { name: /^(Next|Review)$/ }).click()
const slider = (page: Page) => page.getByRole('slider', { name: 'Skin tone' })
// No accessible role exists for the studio host div, so its data-skin-tone attribute is the one hook.
const studio = (page: Page) => page.locator('[data-skin-tone]')

/** Signs in, opens the setup, picks a body shape and lands on the Build step with the slider showing. */
async function openBuildStep(page: Page) {
  await signIn(page)
  await page.goto('/profile/measurements')
  await page.locator('label', { hasText: 'A female body shape' }).click()
  await next(page)
  await expect(slider(page)).toBeVisible(WAIT)
}

/** From the Build step, presses Next until the review screen shows. */
async function toReview(page: Page) {
  const heading = page.getByRole('heading', { name: 'Review your measurements' })
  for (let i = 0; i < 20 && !(await heading.isVisible()); i += 1) await next(page)
  await expect(heading).toBeVisible(WAIT)
}

async function finishSetup(page: Page) {
  await page.getByRole('checkbox', { name: /Save my measurements to my account/ }).check({ force: true })
  await page.getByRole('button', { name: /Finish Setup/ }).click()
}

const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), STORE_KEY)

test.describe('Skin tone slider', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000)
    await mockAuth(page)
    await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  })

  test('the Build step shows the slider at the default Medium 44', async ({ page }) => {
    await mockBodyProfile(page)
    await openBuildStep(page)

    await expect(slider(page)).toHaveValue('44')
    await expect(slider(page)).toHaveAttribute('min', '0')
    await expect(slider(page)).toHaveAttribute('max', '100')
    await expect(slider(page)).toHaveAttribute('step', '1')
    await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Medium, 44 of 100')
    await expect(studio(page)).toHaveAttribute('data-skin-tone', DEFAULT_HEX, WAIT)
  })

  test('the keyboard moves the tone and recolours the avatar', async ({ page }) => {
    await mockBodyProfile(page)
    await openBuildStep(page)
    await slider(page).focus()

    await page.keyboard.press('Home')
    await expect(slider(page)).toHaveValue('0')
    await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Light, 0 of 100')
    await expect(studio(page)).toHaveAttribute('data-skin-tone', LIGHTEST_HEX, WAIT)

    await page.keyboard.press('End')
    await expect(slider(page)).toHaveValue('100')
    await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Deep, 100 of 100')
    await expect(studio(page)).toHaveAttribute('data-skin-tone', DEEPEST_HEX, WAIT)

    await page.keyboard.press('ArrowLeft')
    await expect(slider(page)).toHaveValue('99')
    await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Deep, 99 of 100')
    await expect(studio(page)).not.toHaveAttribute('data-skin-tone', DEEPEST_HEX)
    await expect(studio(page)).toHaveAttribute('data-skin-tone', /^#[0-9a-f]{6}$/)

    await page.keyboard.press('PageDown')
    await expect(slider(page)).toHaveValue('89')
    await expect(studio(page)).toHaveAttribute('data-skin-tone', '#3a312a', WAIT)
    await page.keyboard.press('PageUp')
    await expect(slider(page)).toHaveValue('99')
  })

  test('the label changes at the Light, Medium and Deep boundaries', async ({ page }) => {
    await mockBodyProfile(page)
    await openBuildStep(page)
    await slider(page).focus()

    await page.keyboard.press('Home')
    for (let i = 0; i < 33; i += 1) await page.keyboard.press('ArrowRight')
    await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Light, 33 of 100')
    await page.keyboard.press('ArrowRight')
    await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Medium, 34 of 100')
    await page.keyboard.press('PageUp')
    await page.keyboard.press('PageUp')
    await page.keyboard.press('PageUp')
    await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Medium, 64 of 100')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Medium, 66 of 100')
    await page.keyboard.press('ArrowRight')
    await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Deep, 67 of 100')
  })

  test('reloading on the step keeps the tone', async ({ page }) => {
    await mockBodyProfile(page)
    await openBuildStep(page)
    await slider(page).focus()
    await page.keyboard.press('End')
    await expect(slider(page)).toHaveValue('100')

    await page.reload()
    await expect(slider(page)).toBeVisible(WAIT)
    await expect(slider(page)).toHaveValue('100')
    await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Deep, 100 of 100')
    await expect(studio(page)).toHaveAttribute('data-skin-tone', DEEPEST_HEX, WAIT)
  })

  test('the review step shows the tone and its change button returns to the Build step with the tone kept', async ({ page }) => {
    await mockBodyProfile(page)
    await openBuildStep(page)
    await slider(page).focus()
    await page.keyboard.press('End')
    await toReview(page)

    await expect(page.getByText('Skin tone', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Change skin tone' }).click()
    await expect(slider(page)).toBeVisible(WAIT)
    await expect(slider(page)).toHaveValue('100')
    await expect(studio(page)).toHaveAttribute('data-skin-tone', DEEPEST_HEX, WAIT)
  })

  test('after Finish the profile avatar has the tone, the PUT carries the tone and nothing is stored in the browser', async ({ page }) => {
    const puts = await mockBodyProfile(page)
    await openBuildStep(page)
    await slider(page).focus()
    await page.keyboard.press('End')
    await expect(studio(page)).toHaveAttribute('data-skin-tone', DEEPEST_HEX, WAIT)
    await next(page)
    await page.getByRole('textbox').fill('175') // Finish Setup stays disabled until a measurement is entered
    await toReview(page)
    await finishSetup(page)

    await expect(page).toHaveURL(/\/profile$/, WAIT)
    expect(puts).toHaveLength(1)
    expect(puts[0].skinTone).toBe(100)
    expect(await stored(page)).toBeNull()
    const card = page.getByRole('region', { name: 'Body measurements' })
    await expect(card.locator('[data-skin-tone]')).toHaveAttribute('data-skin-tone', DEEPEST_HEX, WAIT)
  })

  test('Skip for now writes nothing and sends no PUT', async ({ page }) => {
    const puts = await mockBodyProfile(page)
    await openBuildStep(page)
    await slider(page).focus()
    await page.keyboard.press('End')

    await page.getByRole('button', { name: 'Skip for now', exact: true }).first().click()
    await expect(page).toHaveURL(/\/profile$/, WAIT)
    expect(await stored(page)).toBeNull()
    expect(puts).toHaveLength(0)
  })

  test('Escape with the slider focused skips the setup', async ({ page }) => {
    const puts = await mockBodyProfile(page)
    await openBuildStep(page)
    await slider(page).focus()
    await page.keyboard.press('End')
    await page.keyboard.press('Escape')

    await expect(page).toHaveURL(/\/profile$/, WAIT)
    expect(await stored(page)).toBeNull()
    expect(puts).toHaveLength(0)
  })

  test('a failed first save keeps the draft tone, and Retry sends it', async ({ page }) => {
    const puts = await mockBodyProfile(page, { failFirstPut: true })
    await openBuildStep(page)
    await slider(page).focus()
    await page.keyboard.press('End')
    await next(page)
    await page.getByRole('textbox').fill('175') // Finish Setup stays disabled until a measurement is entered
    await toReview(page)
    await finishSetup(page)

    const toast = page.getByRole('alert').filter({ hasText: "We couldn't save your measurements." })
    await expect(toast).toBeVisible(WAIT)
    await toast.hover() // hovering pauses the toast's auto-dismiss
    await expect(page).toHaveURL(/\/profile\/measurements$/)
    expect(puts).toHaveLength(0)

    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page).toHaveURL(/\/profile$/, WAIT)
    expect(puts).toHaveLength(1)
    expect(puts[0].skinTone).toBe(100)
    expect(await stored(page)).toBeNull()
  })

  test('a stored tone for another email is ignored', async ({ page }) => {
    await mockBodyProfile(page)
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ email: 'someone.else@silhoufit.com', tone: 90 })), STORE_KEY)
    await openBuildStep(page)

    await expect(slider(page)).toHaveValue('44')
    await expect(studio(page)).toHaveAttribute('data-skin-tone', DEFAULT_HEX, WAIT)
  })

  test('a browser value from before the profile stored it is the starting value when the profile has none', async ({ page }) => {
    await mockBodyProfile(page)
    await page.addInitScript(
      ([key, email]) => localStorage.setItem(key, JSON.stringify({ email, tone: 100 })),
      [STORE_KEY, DEMO.email],
    )
    await openBuildStep(page)

    await expect(slider(page)).toHaveValue('100')
    await expect(studio(page)).toHaveAttribute('data-skin-tone', DEEPEST_HEX, WAIT)
  })

  test('at 320px there is no horizontal scroll, the slider is at least 44px tall and the console is clean', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      // The mocked 401/404 body-profile responses log a resource error in Chrome; they are not app errors.
      if (message.type() === 'error' && !/status of (401|404)/.test(message.text())) errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width: 320, height: 700 })
    await mockBodyProfile(page)
    await openBuildStep(page)
    await slider(page).scrollIntoViewIfNeeded()

    const box = await slider(page).boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await slider(page).focus()
    await page.keyboard.press('End')
    await expect(studio(page)).toHaveAttribute('data-skin-tone', DEEPEST_HEX, WAIT)
    expect(errors).toEqual([])
  })

  test('a saved profile tone wins over the browser value, and the avatar on the profile uses it', async ({ page }) => {
    await mockBodyProfile(page, { initial: { ...SAVED, skinTone: 0 } })
    await page.addInitScript(
      ([key, email]) => localStorage.setItem(key, JSON.stringify({ email, tone: 100 })),
      [STORE_KEY, DEMO.email],
    )
    await openBuildStep(page)
    await expect(slider(page)).toHaveValue('0')
    await expect(studio(page)).toHaveAttribute('data-skin-tone', LIGHTEST_HEX, WAIT)
  })

  for (const [name, extra] of [['null', { skinTone: null }], ['missing', {}]] as const) {
    test(`a saved profile with skinTone ${name} starts at the default`, async ({ page }) => {
      await mockBodyProfile(page, { initial: { ...SAVED, ...extra } })
      await openBuildStep(page)
      await expect(slider(page)).toHaveValue('44')
    })
  }
})
