import { expect, test, type Locator, type Page } from '@playwright/test'
import { CUSTOMER, OLD, SAM, conversation, msg, openMessages, startChat } from './chatMock'

// The staff Messages dropdown and the small chat window: long unbroken text must never scroll sideways, at 320px and 1920px, light and dark.

const LONG = 'asdadasdasdas'.repeat(14)
const LIA = { id: 'u2', name: 'Lia Cruz', role: 'customer' } as const
const NORA = { id: 'u3', name: 'Nora Santos', role: 'customer' } as const

const spill = (locator: Locator) => locator.evaluate((el) => el.scrollWidth - el.clientWidth)
const pageSpill = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const panel = (page: Page) => page.getByRole('dialog', { name: 'Conversations' })
const open = async (page: Page) => {
  await page.getByRole('button', { name: /^Messages/ }).click()
  await expect(panel(page)).toBeVisible()
}

const long = conversation({ hasUnreadMessages: true, lastMessageAt: OLD(2), lastMessage: msg(LONG, CUSTOMER, OLD(2)) })
const mineRow = conversation({ id: 'c2', lastMessageAt: OLD(1), lastMessage: msg('Sure, sending it now', SAM, OLD(1)) }, LIA)
const quiet = conversation({ id: 'c3' }, NORA)

test.describe('messages dropdown', () => {
  for (const [label, width, scheme] of [
    ['320px light', 320, 'light'],
    ['1920px light', 1920, 'light'],
    ['320px dark', 320, 'dark'],
    ['1920px dark', 1920, 'dark'],
  ] as const) {
    test(`a long unbroken preview is truncated and never scrolls sideways (${label})`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 640 : 900 })
      await page.emulateMedia({ colorScheme: scheme })
      await startChat(page, 'staff', { path: '/staff', init: { conversations: [long, mineRow, quiet] } })
      await open(page)
      const list = panel(page).locator('ul[aria-label="Conversations"]')
      await expect(list.getByTestId('inbox-row')).toHaveCount(3)

      expect(await spill(panel(page))).toBeLessThanOrEqual(0)
      expect(await spill(list.locator('xpath=..'))).toBeLessThanOrEqual(0)
      expect(await pageSpill(page)).toBe(0)
      const box = (await panel(page).boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)

      const row = list.getByTestId('inbox-row').filter({ hasText: 'Demo Shopper' })
      const preview = row.getByText(LONG)
      expect(await spill(preview)).toBeGreaterThan(0)
      expect(await preview.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis')
      expect(await spill(row)).toBeLessThanOrEqual(0)
      await expect(row.getByLabel('Unread')).toBeVisible()
      expect(Number(await row.getByText('Demo Shopper').evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(600)
      const dot = (await row.getByLabel('Unread').boundingBox())!
      const rowBox = (await row.boundingBox())!
      expect(dot.x + dot.width).toBeLessThanOrEqual(rowBox.x + rowBox.width)
    })
  }

  test('shows You:, a short time and no dot for a read thread', async ({ page }) => {
    await startChat(page, 'staff', { path: '/staff', init: { conversations: [long, mineRow, quiet] } })
    await open(page)
    const row = panel(page).getByTestId('inbox-row').filter({ hasText: 'Lia Cruz' })
    await expect(row).toContainText('You: Sure, sending it now')
    await expect(row).toContainText(/· Nov 3/)
    await expect(row.getByLabel('Unread')).toHaveCount(0)
    await expect(panel(page).getByTestId('inbox-row').filter({ hasText: 'Nora Santos' })).toContainText('No messages yet')
  })

  test('the search filters the loaded conversations, and Clear search restores them', async ({ page }) => {
    await startChat(page, 'staff', { path: '/staff', init: { conversations: [long, mineRow, quiet] } })
    await open(page)
    const search = panel(page).getByRole('searchbox', { name: 'Search conversations' })
    await search.fill('lia')
    await expect(panel(page).getByTestId('inbox-row')).toHaveCount(1)
    await search.fill('zzz')
    await expect(panel(page).getByText(/No conversations match/)).toBeVisible()
    await panel(page).getByRole('button', { name: 'Clear search' }).click()
    await expect(panel(page).getByTestId('inbox-row')).toHaveCount(3)
    await panel(page).getByRole('tab', { name: 'Unread' }).click()
    await expect(panel(page).getByTestId('inbox-row')).toHaveCount(1)
    await panel(page).getByRole('tab', { name: 'Read', exact: true }).click()
    await expect(panel(page).getByTestId('inbox-row')).toHaveCount(2)
  })

  test('says so when there are no conversations', async ({ page }) => {
    await startChat(page, 'staff', { path: '/staff', init: { conversations: [] } })
    await open(page)
    await expect(panel(page).getByText(/No conversations yet/)).toBeVisible()
  })

  test('a failed load says what happened and Retry loads the list', async ({ page }) => {
    const api = await startChat(page, 'staff', { path: '/staff', init: { conversations: [long] }, setup: (mock) => (mock.fail.inbox = 500) })
    await open(page)
    await expect(panel(page).getByRole('alert')).toBeVisible()
    api.fail.inbox = null
    await panel(page).getByRole('button', { name: /retry|try again/i }).click()
    await expect(panel(page).getByTestId('inbox-row')).toHaveCount(1)
  })

  test('keyboard: Enter opens, focus is in the panel, arrows walk the rows, Escape closes and returns focus', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a keyboard walk is a desktop flow')
    await startChat(page, 'staff', { path: '/staff', init: { conversations: [long, mineRow, quiet] } })
    const button = page.getByRole('button', { name: /^Messages/ })
    await button.focus()
    await page.keyboard.press('Enter')
    await expect(panel(page)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(panel(page).getByRole('button', { name: 'Close conversations' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(panel(page).getByRole('searchbox')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(panel(page).getByTestId('inbox-row').first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(panel(page).getByTestId('inbox-row').nth(1)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(panel(page)).toHaveCount(0)
    await expect(button).toBeFocused()
  })

  test('touch targets are at least 44px', async ({ page }) => {
    await startChat(page, 'staff', { path: '/staff', init: { conversations: [long] } })
    await open(page)
    for (const target of [panel(page).getByRole('button', { name: 'Close conversations' }), panel(page).getByRole('searchbox'), panel(page).getByTestId('inbox-row').first()]) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(43.9)
    }
  })
})

test.describe('chat window', () => {
  const URL_TEXT = `https://example.com/${'path/'.repeat(40)}`
  const theirs = msg(LONG, SAM, OLD(1))
  const theirsUrl = msg(URL_TEXT, SAM, OLD(2))
  const mine = msg(`f${LONG}`, CUSTOMER, OLD(3))
  const short = msg('f', CUSTOMER, OLD(4))

  for (const width of [320, 1280]) {
    test(`long words and URLs wrap in the bubbles, own bubbles are fully visible, no sideways scroll (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 })
      await startChat(page, 'customer', { path: '/wishlist', init: { messages: [theirs, theirsUrl, mine, short] } })
      await openMessages(page)
      const chat = page.getByRole('region', { name: 'Chat with KRAL' })
      await expect(page.getByTestId('chat-message')).toHaveCount(4)

      const scroller = chat.getByRole('log', { name: 'Messages' }).locator('xpath=..')
      expect(await spill(scroller)).toBeLessThanOrEqual(0)
      expect(await spill(chat)).toBeLessThanOrEqual(0)
      expect(await pageSpill(page)).toBe(0)

      const listBox = (await scroller.boundingBox())!
      for (const text of [LONG, URL_TEXT, `f${LONG}`, 'f']) {
        const bubble = chat.getByText(text, { exact: true })
        const box = (await bubble.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(listBox.x)
        expect(box.x + box.width).toBeLessThanOrEqual(listBox.x + listBox.width)
        expect(box.width).toBeLessThanOrEqual(listBox.width * 0.8 + 1)
        expect(await spill(bubble)).toBeLessThanOrEqual(0)
      }
      const own = (await chat.getByText('f', { exact: true }).boundingBox())!
      expect(own.x + own.width).toBeGreaterThan(listBox.x + listBox.width - 80)
    })
  }
})
