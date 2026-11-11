import { expect, test, type Locator, type Page } from '@playwright/test'
import { contrastRatio } from '../shared/contrast'

// The "KRAL Help" chat for a visitor who is not signed in, on the landing page: opening it, tapping and typing, the keyboard, and the phone sheet.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  // Reduced motion skips the intro loader and the bot's typing pause.
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

const launcher = (page: Page) => page.getByRole('button', { name: 'Ask KRAL Help' })
const box = (page: Page) => page.getByRole('region', { name: 'Chat with KRAL Help' })
const chip = (page: Page, name: string) => box(page).getByRole('button', { name, exact: true })
const message = (page: Page) => box(page).getByRole('textbox', { name: 'Message' })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function open(page: Page) {
  await page.goto('/')
  await expect(launcher(page)).toBeVisible({ timeout: 20_000 })
  await launcher(page).click()
  await expect(box(page)).toBeVisible()
  await expect(chip(page, 'Browse topics')).toBeVisible()
}

test('a guest opens Help on the landing page, taps a question, then types one it cannot answer', async ({ page }) => {
  await open(page)
  await chip(page, 'How do I enter my measurements?').click()
  await expect(box(page).getByText(/Enter your measurements in centimetres or inches/)).toBeVisible()
  await expect(box(page).getByRole('link', { name: 'Open body setup' })).toBeVisible()

  await message(page).fill('zebra giraffe')
  await message(page).press('Enter')
  await expect(box(page).getByText("I don't have an answer for that yet.")).toBeVisible()
  await expect(chip(page, 'Talk to a person')).toBeVisible()
  await expect(chip(page, 'Rephrase')).toBeVisible()

  await chip(page, 'Talk to a person').click()
  await expect(page).toHaveURL(/\/login\?next=%2Fmessages$/)
})

test('the landing banner opens Help with its Ask about sizing button', async ({ page }) => {
  await page.goto('/')
  const ask = page.getByRole('button', { name: 'Ask about sizing' })
  await ask.scrollIntoViewIfNeeded()
  await ask.click()
  await expect(box(page)).toBeVisible()
  await expect(page.locator('#faq')).toHaveCount(0)
})

test('works from the keyboard: Enter opens, Tab reaches a chip, Escape returns focus to the head', async ({ page }) => {
  await page.goto('/')
  await launcher(page).focus()
  await page.keyboard.press('Enter')
  await expect(box(page)).toBeVisible()
  // The answers load first; the conversation takes focus when they are in.
  await expect(box(page).getByRole('log')).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(box(page).getByRole('group', { name: 'Suggested replies' }).getByRole('button').first()).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(box(page).getByText(/Enter your measurements|It is guidance|SilhouFit is KRAL|Turn on your camera/).first()).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(box(page)).toHaveCount(0)
  await expect(page.locator('[data-dock-head="help"]')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(box(page)).toBeVisible()
  // The conversation is kept while the box is only minimized.
  await expect(box(page).getByText(/Enter your measurements|It is guidance|SilhouFit is KRAL|Turn on your camera/).first()).toBeVisible()
})

for (const width of [320, 375]) {
  test(`${width}px: a bottom sheet, no sideways scroll, 44px chips and 16px text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 })
    await open(page)
    const sheet = (await box(page).boundingBox())!
    expect(sheet.x).toBe(0)
    expect(Math.round(sheet.width)).toBe(width)
    expect(Math.round(sheet.y + sheet.height)).toBe(640)
    expect(await overflow(page)).toBe(0)

    const chips = box(page).getByRole('group', { name: 'Suggested replies' }).getByRole('button')
    for (const each of await chips.all()) {
      expect((await each.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      expect(Number((await each.evaluate((el) => getComputedStyle(el).fontSize)).replace('px', ''))).toBeGreaterThanOrEqual(16)
    }
    expect(Number((await message(page).evaluate((el) => getComputedStyle(el).fontSize)).replace('px', ''))).toBeGreaterThanOrEqual(16)

    // A long unbroken word must not push the sheet sideways either.
    await message(page).fill('x'.repeat(190))
    await message(page).press('Enter')
    await expect(box(page).getByText('x'.repeat(190))).toBeVisible()
    expect(await overflow(page)).toBe(0)
    expect(await box(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
  })
}

/** The colour as sRGB, whatever notation the page used (oklch, color-mix). */
const rgb = (target: Locator, property: 'color' | 'backgroundColor') =>
  target.evaluate((el, prop) => {
    const context = document.createElement('canvas').getContext('2d')!
    context.fillStyle = getComputedStyle(el)[prop]
    context.fillRect(0, 0, 1, 1)
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data
    return `rgb(${r}, ${g}, ${b})`
  }, property)

for (const scheme of ['light', 'dark'] as const) {
  test(`text on the chips and the bubbles holds 4.5:1 (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.addInitScript((value) => localStorage.setItem('silhoufit-theme', value), scheme)
    await open(page)
    await chip(page, 'How accurate is the sizing?').click()
    await message(page).fill('hello there')
    await message(page).press('Enter')
    await expect(box(page).getByText('hello there').first()).toBeVisible()

    await page.mouse.move(0, 0) // a hovered chip is tinted
    const welcome = box(page).getByText(/I'm KRAL Help/)
    const answer = box(page).getByText(/It is guidance, not a guarantee/)
    const mine = box(page).getByText('hello there').first()
    const reply = box(page).getByRole('group', { name: 'Suggested replies' }).getByRole('button').first()
    for (const target of [welcome, answer, mine, reply]) {
      const ratio = contrastRatio(await rgb(target, 'color'), await rgb(target, 'backgroundColor'))
      expect(ratio, await target.innerText()).toBeGreaterThanOrEqual(4.5)
    }
  })
}
