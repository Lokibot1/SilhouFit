import { expect, test, type Page } from '@playwright/test'
import { DEMO, mockAuth } from '../shared/session'

// Regression for the smoother thigh/hips/knee blend in deformBody.ts. The mesh has no debug hook, so these
// specs only prove the avatar keeps rendering and the value flows through the draft, review and save.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const DRAFT_KEY = 'silhoufit-body-setup'

async function mockBodyProfile(page: Page) {
  const puts: Array<Record<string, unknown>> = []
  await page.route('**/users/me/body-profile', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() === 'PUT') {
      const body = request.postDataJSON()
      puts.push(body)
      return route.fulfill({ json: body, headers: CORS })
    }
    return route.fulfill({ status: 404, json: {}, headers: CORS })
  })
  return puts
}

const next = (page: Page) => page.getByRole('button', { name: /^(Next|Review)$/ }).click()
// The mocked GET body-profile 404 (no saved profile) is an expected browser console line, so it is ignored.
// No accessible name exists for the WebGL canvas, so it is located by tag.
const canvas = (page: Page) => page.locator('canvas').first()

/** Signs in, picks a female body, enters a height and advances to the Thigh step. */
async function openThighStep(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/, { timeout: 30_000 })
  await page.goto('/profile/measurements')
  await page.locator('label', { hasText: 'A female body shape' }).click()
  await next(page)
  await next(page)
  await page.getByRole('textbox').fill('165')
  const thigh = page.getByRole('heading', { name: 'Thigh' })
  for (let i = 0; i < 15 && !(await thigh.isVisible()); i += 1) await next(page)
  await expect(thigh).toBeVisible()
}

async function expectAvatarRendering(page: Page) {
  await expect(canvas(page)).toBeVisible()
  await expect(page.getByText('Loading the 3D body')).toHaveCount(0)
}

test.describe('avatar shape with extreme thigh values', () => {
  let errors: string[]

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000)
    errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/users/me/body-profile')) errors.push(`console: ${m.text()}`) })
    await mockAuth(page)
    await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  })

  test.afterEach(() => {
    expect(errors).toEqual([])
  })

  test('100 cm and 30 cm render, persist in the draft and no horizontal scroll', async ({ page }, info) => {
    await mockBodyProfile(page)
    await openThighStep(page)
    await expectAvatarRendering(page)

    await page.getByRole('textbox').fill('100')
    await expectAvatarRendering(page)
    await expect.poll(() => page.evaluate((k) => sessionStorage.getItem(k), DRAFT_KEY)).toContain('100')
    await info.attach('thigh-100.png', { body: await canvas(page).screenshot(), contentType: 'image/png' })

    await page.getByRole('textbox').fill('30')
    await expectAvatarRendering(page)
    await expect.poll(() => page.evaluate((k) => sessionStorage.getItem(k), DRAFT_KEY)).toContain('30')
    await info.attach('thigh-30.png', { body: await canvas(page).screenshot(), contentType: 'image/png' })

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('changing the value back and forth keeps the canvas rendering', async ({ page }) => {
    await mockBodyProfile(page)
    await openThighStep(page)
    for (const value of ['100', '30', '60', '100', '45', '100']) {
      await page.getByRole('textbox').fill(value)
      await expect(page.getByRole('textbox')).toHaveValue(value)
      await expectAvatarRendering(page)
    }
  })

  test('the rotate buttons work after a large thigh value', async ({ page }) => {
    await mockBodyProfile(page)
    await openThighStep(page)
    await page.getByRole('textbox').fill('100')
    const left = page.getByRole('button', { name: 'Rotate the body left' })
    const right = page.getByRole('button', { name: 'Rotate the body right' })
    await expect(left).toBeEnabled()
    await left.click()
    await right.click()
    await right.click()
    await expectAvatarRendering(page)
  })

  test('review lists Thigh and the save sends thighCm 100', async ({ page }) => {
    const puts = await mockBodyProfile(page)
    await openThighStep(page)
    await page.getByRole('textbox').fill('100')
    for (let i = 0; i < 15 && !(await page.getByRole('heading', { name: 'Review your measurements' }).isVisible()); i += 1) {
      await next(page)
    }
    await expect(page.getByRole('heading', { name: 'Review your measurements' })).toBeVisible()
    await expect(page.getByText('Thigh', { exact: true })).toBeVisible()
    await expect(page.getByText(/100(\.0)?\s*cm/).first()).toBeVisible()

    await page.getByRole('checkbox', { name: /Save my measurements to my account/ }).check({ force: true })
    await page.getByRole('button', { name: /Finish Setup/ }).click()
    await expect(page).toHaveURL(/\/profile$/)
    expect(puts).toHaveLength(1)
    expect(puts[0]).toMatchObject({ thighCm: 100, heightCm: 165 })
  })
})
