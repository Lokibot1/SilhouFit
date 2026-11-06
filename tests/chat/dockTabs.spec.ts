import { expect, test, type Page } from '@playwright/test'
import { CUSTOMER, OLD, SAM, conversation, msg, startChat } from './chatMock'

// The filter tabs (All | Unread | Read) in the staff Messages dropdown use SegmentedTabs `compact`: 28px tall on a desktop pointer,
// 44px on touch and below the md breakpoint. They stay keyboard operable and never scroll the page sideways.

const LIA = { id: 'u2', name: 'Lia Cruz', role: 'customer' } as const
const unread = conversation({ hasUnreadMessages: true, lastMessageAt: OLD(2), lastMessage: msg('Do you have it in M?', CUSTOMER, OLD(2)) })
const read = conversation({ id: 'c2', lastMessageAt: OLD(1), lastMessage: msg('Sure, sending it now', SAM, OLD(1)) }, LIA)

const panel = (page: Page) => page.getByRole('dialog', { name: 'Conversations' })
const tabs = (page: Page) => panel(page).getByRole('tablist', { name: 'Filter conversations' })
const rows = (page: Page) => panel(page).getByTestId('inbox-row')
const pageSpill = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function openDropdown(page: Page) {
  await startChat(page, 'staff', { path: '/staff', init: { conversations: [unread, read] } })
  await page.getByRole('button', { name: /^Messages/ }).click()
  await expect(panel(page)).toBeVisible()
  await expect(rows(page)).toHaveCount(2)
}

async function heights(page: Page) {
  const out: number[] = []
  for (const tab of await tabs(page).getByRole('tab').all()) out.push((await tab.boundingBox())!.height)
  return out
}

test('on a desktop pointer the tabs are the compact 28px', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'desktop pointer only')
  await page.setViewportSize({ width: 1280, height: 800 })
  await openDropdown(page)
  const all = await heights(page)
  expect(all).toHaveLength(3)
  for (const height of all) expect(height).toBeCloseTo(28, 0)
  await expect(tabs(page).getByRole('tab', { name: 'All' })).toHaveCSS('font-size', '12px')
})

test('on a desktop pointer below the md breakpoint the tabs are 44px', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'covered by the touch test on the mobile project')
  await page.setViewportSize({ width: 600, height: 800 })
  await openDropdown(page)
  for (const height of await heights(page)) expect(height).toBeGreaterThanOrEqual(43.5)
})

test('with touch emulation the tabs are at least 44px tall', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch emulation is the mobile project')
  await openDropdown(page)
  for (const height of await heights(page)) expect(height).toBeGreaterThanOrEqual(43.5)
})

for (const width of [320, 1280]) {
  test(`the tabs sit inside the panel with no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await openDropdown(page)
    expect(await pageSpill(page)).toBe(0)
    const box = (await panel(page).boundingBox())!
    for (const tab of await tabs(page).getByRole('tab').all()) {
      const t = (await tab.boundingBox())!
      expect(t.x).toBeGreaterThanOrEqual(box.x - 0.5)
      expect(t.x + t.width).toBeLessThanOrEqual(box.x + box.width + 0.5)
    }
    expect(await tabs(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
  })
}

test('keyboard: arrows move between tabs and filter the list, Home and End jump, only the open tab is in the Tab order', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'a keyboard walk is a desktop flow')
  await page.setViewportSize({ width: 1280, height: 800 })
  await openDropdown(page)
  const tab = (name: string) => tabs(page).getByRole('tab', { name, exact: true })
  await tab('All').focus()
  await expect(tab('All')).toHaveAttribute('aria-selected', 'true')
  await expect(tab('Unread')).toHaveAttribute('tabindex', '-1')

  await page.keyboard.press('ArrowRight')
  await expect(tab('Unread')).toBeFocused()
  await expect(tab('Unread')).toHaveAttribute('aria-selected', 'true')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('Demo Shopper')

  await page.keyboard.press('ArrowRight')
  await expect(tab('Read')).toBeFocused()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('Lia Cruz')

  await page.keyboard.press('ArrowRight')
  await expect(tab('All')).toBeFocused()
  await expect(rows(page)).toHaveCount(2)
  await page.keyboard.press('End')
  await expect(tab('Read')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(tab('All')).toBeFocused()
})

test('dark mode: the selected tab keeps readable contrast against its pill', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await openDropdown(page)
  await expect(page.locator('html')).toHaveClass(/dark/)
  const selected = tabs(page).getByRole('tab', { selected: true })
  await expect(selected).toBeVisible()
  const [text, pill] = await selected.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el.querySelector('span[aria-hidden]')!).backgroundColor])
  const lum = (css: string) => {
    const [r, g, b] = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  expect(Math.abs(lum(text) - lum(pill))).toBeGreaterThan(60)
})
