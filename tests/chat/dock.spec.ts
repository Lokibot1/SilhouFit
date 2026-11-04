import { expect, test, type Page } from '@playwright/test'
import { CID, CUSTOMER, OLD, SAM, conversation, msg, startChat } from './chatMock'

// The Messenger-style chat dock (customer navbar icon, staff navbar icon) against the mocked chat API and Realtime server (see chatMock.ts).

const messages = (page: Page) => page.getByTestId('chat-message')
const composer = (page: Page) => page.getByRole('textbox', { name: 'Message', exact: true })
const box = (page: Page, name: string) => page.getByRole('region', { name: `Chat with ${name}` })
const head = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^Open chat with ${name}`) })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

const HELLO = msg('Hi, how can we help?', SAM, OLD(1))
const LIA = { id: 'u2', name: 'Lia Cruz', role: 'customer' } as const

test.describe('customer dock', () => {
  test('the navbar Messages icon opens the chat over the page, focused; the account menu has no Messages row', async ({ page }) => {
    await startChat(page, 'customer', { path: '/wishlist', init: { messages: [HELLO] } })
    await page.getByRole('button', { name: /^Account/ }).click()
    await expect(page.getByRole('group', { name: 'Account' }).getByText('Messages')).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Messages', exact: true }).click()
    await expect(box(page, 'KRAL')).toBeVisible()
    await expect(page).toHaveURL(/\/wishlist$/)
    await expect(messages(page)).toHaveCount(1)
    await expect(composer(page)).toBeFocused()
  })

  test('Escape minimizes to a head with focus on it, a click re-expands with the thread, Close removes it', async ({ page }) => {
    await startChat(page, 'customer', { path: '/wishlist', init: { messages: [HELLO] } })
    await page.getByRole('button', { name: 'Messages', exact: true }).click()
    await expect(composer(page)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(box(page, 'KRAL')).toHaveCount(0)
    await expect(head(page, 'KRAL')).toBeFocused()

    await head(page, 'KRAL').click()
    await expect(box(page, 'KRAL')).toBeVisible()
    await expect(messages(page)).toHaveCount(1)

    await box(page, 'KRAL').getByRole('button', { name: 'Close chat with KRAL' }).click()
    await expect(box(page, 'KRAL')).toHaveCount(0)
    await expect(head(page, 'KRAL')).toHaveCount(0)
  })

  test('a route change minimizes the open chat to a head', async ({ page }) => {
    await startChat(page, 'customer', { path: '/wishlist' })
    await page.getByRole('button', { name: 'Messages', exact: true }).click()
    await expect(box(page, 'KRAL')).toBeVisible()
    await page.getByRole('link', { name: /^Cart/ }).click()
    await expect(page).toHaveURL(/\/cart$/)
    await expect(box(page, 'KRAL')).toHaveCount(0)
    await expect(head(page, 'KRAL')).toBeVisible()
  })

  test('/messages is still the full page, without the dock', async ({ page }) => {
    await startChat(page, 'customer', { path: '/messages', init: { messages: [HELLO] } })
    await expect(messages(page)).toHaveCount(1)
    await page.getByRole('button', { name: 'Messages', exact: true }).click()
    await expect(page.getByRole('region', { name: /^Chat with/ })).toHaveCount(0)
  })

  test('a saved dev account sees that chat needs a real account', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-session', JSON.stringify({ name: 'Dev User', email: 'dev@example.com', role: 'customer', simulated: true })))
    await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
    await page.goto('/wishlist')
    await page.getByRole('button', { name: 'Messages', exact: true }).click()
    await expect(box(page, 'KRAL')).toContainText('Chat needs a real signed-in account')
  })

  test('on a 320px phone the open chat is a full-width sheet with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await startChat(page, 'customer', { path: '/wishlist', init: { messages: [HELLO] } })
    await page.getByRole('button', { name: 'Messages', exact: true }).click()
    await expect(messages(page)).toHaveCount(1)
    const rect = await box(page, 'KRAL').boundingBox()
    expect(rect?.x).toBe(0)
    expect(rect?.width).toBe(320)
    expect(await overflow(page)).toBe(0)
  })
})

test.describe('staff dock', () => {
  const first = conversation({ hasUnreadMessages: true, lastMessageAt: OLD(2), lastMessage: msg('Hello?', CUSTOMER, OLD(2)) })
  const second = conversation({ id: 'c2' }, LIA)

  test('the navbar icon shows the unread count and lists conversations; choosing one opens its chat', async ({ page }) => {
    const api = await startChat(page, 'staff', { path: '/staff', init: { conversations: [first, second], messages: [HELLO] } })
    await expect(page.getByRole('button', { name: 'Messages, 1 unread' })).toBeVisible()
    await page.getByRole('button', { name: 'Messages, 1 unread' }).click()
    const list = page.getByRole('dialog', { name: 'Conversations' })
    await expect(list.getByTestId('inbox-row')).toHaveCount(2)
    await expect(list.getByRole('link', { name: 'Open full Messages page' })).toHaveAttribute('href', '/staff/messages')

    await list.getByTestId('inbox-row').filter({ hasText: 'Demo Shopper' }).click()
    await expect(list).toHaveCount(0)
    await expect(box(page, 'Demo Shopper')).toBeVisible()
    await expect(page).toHaveURL(/\/staff$/)
    await expect(messages(page)).toHaveCount(1)
    // One channel for the open conversation plus the inbox one; a minimized head opens none.
    await expect.poll(() => api.realtime.topics().sort()).toEqual(['realtime:chat:conversation:c1', 'realtime:chat:inbox'])
    await page.keyboard.press('Escape')
    await expect(head(page, 'Demo Shopper')).toBeVisible()
    await expect.poll(() => api.realtime.topics()).not.toContain('realtime:chat:conversation:c1')
  })

  test('the popover closes on Escape and on an outside click', async ({ page }) => {
    await startChat(page, 'staff', { path: '/staff', init: { conversations: [first, second] } })
    const button = page.getByRole('button', { name: /^Messages/ })
    await button.click()
    await expect(page.getByRole('dialog', { name: 'Conversations' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Conversations' })).toHaveCount(0)
    await expect(button).toBeFocused()
    await button.click()
    await page.mouse.click(5, 300)
    await expect(page.getByRole('dialog', { name: 'Conversations' })).toHaveCount(0)
  })

  test('two customers make two stacked heads, and expanding one minimizes the other', async ({ page }) => {
    await startChat(page, 'staff', { path: '/staff', init: { conversations: [first, second], messages: [HELLO] } })
    for (const name of ['Demo Shopper', 'Lia Cruz']) {
      await page.getByRole('button', { name: /^Messages/ }).click()
      await page.getByRole('dialog', { name: 'Conversations' }).getByTestId('inbox-row').filter({ hasText: name }).click()
      await expect(box(page, name)).toBeVisible()
    }
    await expect(head(page, 'Demo Shopper')).toBeVisible()
    await expect(box(page, 'Demo Shopper')).toHaveCount(0)

    await head(page, 'Demo Shopper').click()
    await expect(box(page, 'Demo Shopper')).toBeVisible()
    await expect(box(page, 'Lia Cruz')).toHaveCount(0)
    await expect(head(page, 'Lia Cruz')).toBeVisible()
  })

  test('/staff/messages is still the full page and the dock is hidden there', async ({ page }) => {
    test.skip(!!test.info().project.use.isMobile, 'the side-by-side page is covered by chat.spec.ts')
    await startChat(page, 'staff', { path: `/staff/messages?c=${CID}`, init: { messages: [HELLO] } })
    await expect(messages(page)).toHaveCount(1)
    await page.getByRole('button', { name: /^Messages/ }).click()
    await page.getByRole('dialog', { name: 'Conversations' }).getByTestId('inbox-row').first().click()
    await expect(page.getByRole('region', { name: /^Chat with/ })).toHaveCount(0)
  })
})
