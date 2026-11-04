import { expect, test, type Page } from '@playwright/test'
import { ANA, CID, CUSTOMER, OLD, SAM, conversation, inboxPath, msg, startChat } from './chatMock'

// Support chat against a mocked REST API and a mocked Supabase Realtime server (see chatMock.ts); each test signs in through the real form.

const messages = (page: Page) => page.getByTestId('chat-message')
const composer = (page: Page) => page.getByRole('textbox', { name: 'Message', exact: true })
const sendButton = (page: Page) => page.getByRole('button', { name: 'Send message', exact: true })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function write(page: Page, text: string) {
  await composer(page).fill(text)
  await sendButton(page).click()
}

const HELLO = msg('Hi, how can we help?', SAM, OLD(1))
const LIA = { id: 'u2', name: 'Lia Cruz', role: 'customer' } as const

test.describe('customer thread', () => {
  test('sends a message (pending, then sent) and shows a staff reply that arrives over Realtime as KRAL', async ({ page }) => {
    const api = await startChat(page, 'customer', { init: { messages: [HELLO] } })
    await expect(messages(page)).toHaveCount(1)
    await expect(messages(page).getByText('KRAL', { exact: true })).toBeVisible()
    await expect(messages(page).getByText('Sam Staff')).toHaveCount(0)
    await expect(page.getByRole('log', { name: 'Messages' })).toContainText(HELLO.content)
    await expect.poll(() => api.realtime.topics()).toContain(`realtime:chat:conversation:${CID}`)
    expect(api.calls).toContain(`POST /chat/conversations/${CID}/read`)

    const release = api.hold('send')
    await write(page, 'Is the hoodie in M?')
    const mine = messages(page).filter({ hasText: 'Is the hoodie in M?' })
    await expect(mine).toHaveAttribute('data-status', 'pending')
    await expect(composer(page)).toHaveValue('')
    release()
    await expect(mine).toHaveAttribute('data-status', 'sent')
    expect(api.sends).toEqual(['Is the hoodie in M?'])

    const reply = msg('Yes, M is in stock.', SAM)
    api.messages.push(reply)
    await api.realtime.push(reply)
    await expect(messages(page).filter({ hasText: 'Yes, M is in stock.' })).toHaveAttribute('data-status', 'sent')
    await expect(messages(page).filter({ hasText: 'Yes, M is in stock.' }).getByText('KRAL', { exact: true })).toBeVisible()
    await expect(messages(page)).toHaveCount(3)
  })

  test('shows the Realtime echo of its own message once', async ({ page }) => {
    const api = await startChat(page, 'customer', { init: { messages: [HELLO] } })
    await expect.poll(() => api.realtime.topics()).toContain(`realtime:chat:conversation:${CID}`)
    await write(page, 'One only')
    await expect(messages(page).filter({ hasText: 'One only' })).toHaveAttribute('data-status', 'sent')
    await api.realtime.push(api.messages.at(-1)!)
    await expect(messages(page)).toHaveCount(2)
  })

  test('a reply from a staff member the thread has not met shows as KRAL straight from the broadcast (the REST list does not have it)', async ({ page }) => {
    const api = await startChat(page, 'customer', { init: { messages: [HELLO] } })
    await expect.poll(() => api.realtime.topics()).toContain(`realtime:chat:conversation:${CID}`)
    const reply = msg('Ana here, glad to help.', ANA)
    await api.realtime.push(reply)
    await expect(messages(page).filter({ hasText: 'Ana here, glad to help.' }).getByText('KRAL', { exact: true })).toBeVisible()
    await expect(page.getByText('Ana Admin')).toHaveCount(0)
  })

  test('a broadcast that never arrives is picked up by the 30 second safety poll while subscribed', async ({ page }) => {
    test.setTimeout(60_000)
    const api = await startChat(page, 'customer', { init: { messages: [HELLO] } })
    await expect.poll(() => api.realtime.topics()).toContain(`realtime:chat:conversation:${CID}`)
    await expect(page.getByTestId('chat-reconnecting')).toHaveCount(0)
    api.messages.push(msg('Missed broadcast.', SAM))
    await expect(messages(page).filter({ hasText: 'Missed broadcast.' })).toBeVisible({ timeout: 40_000 })
  })

  test('a failed send shows Retry, which sends it again; Remove drops a failed message', async ({ page }) => {
    const api = await startChat(page, 'customer')
    api.sendReply = (attempt) => (attempt <= 2 ? 'abort' : 'ok')
    await write(page, 'First try')
    const failed = messages(page).filter({ hasText: 'First try' })
    await expect(failed).toHaveAttribute('data-status', 'failed')
    await failed.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(failed).toHaveAttribute('data-status', 'failed')
    await failed.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(failed).toHaveAttribute('data-status', 'sent')
    expect(api.sends).toEqual(Array(3).fill('First try'))

    api.sendReply = () => 'abort'
    await write(page, 'Never mind')
    const other = messages(page).filter({ hasText: 'Never mind' })
    await expect(other).toHaveAttribute('data-status', 'failed')
    await other.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(other).toHaveCount(0)
  })

  test('an empty thread invites the first message, and Enter sends it', async ({ page }) => {
    await startChat(page, 'customer')
    await expect(page.getByText('No messages yet. Write the first message below.')).toBeVisible()
    await expect(messages(page)).toHaveCount(0)
    await expect(sendButton(page)).toBeDisabled()
    await composer(page).fill('hello')
    await expect(sendButton(page)).toBeEnabled()
    await composer(page).press('Enter')
    await expect(messages(page)).toHaveCount(1)
  })

  test('/messages is the one thread; an old thread link goes there', async ({ page }) => {
    await startChat(page, 'customer', { path: '/messages', init: { messages: [HELLO] } })
    await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeAttached()
    await expect(messages(page)).toHaveCount(1)
    await page.goto('/messages/some-old-id')
    await expect(page).toHaveURL(/\/messages$/)
    await expect(composer(page)).toBeVisible()
  })
})

test.describe('staff inbox', () => {
  test('lists threads, opens one, marks it read, replies, and shows a customer message and the inbox update live', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the list and thread are side by side on desktop only; the phone layout is covered below')
    const second = conversation({ id: 'c2' }, LIA)
    const first = conversation({ hasUnreadMessages: true, lastMessageAt: OLD(2), lastMessage: msg('Hello?', CUSTOMER, OLD(2)) })
    const api = await startChat(page, 'staff', { path: inboxPath('staff', false), init: { conversations: [first, second], messages: [msg('Hello?', CUSTOMER, OLD(2))] } })
    await expect(page.getByTestId('inbox-row')).toHaveCount(2)
    const demoRow = page.getByTestId('inbox-row').filter({ hasText: 'Demo Shopper' })
    await expect(demoRow.getByLabel('Unread')).toBeVisible()
    await expect(demoRow).toContainText('Hello?')
    await expect(page.getByText('Choose a conversation to read it and reply.')).toBeVisible()
    await expect.poll(() => api.realtime.topics()).toContain('realtime:chat:inbox')

    await demoRow.click()
    await expect(page).toHaveURL(new RegExp(`\\?c=${CID}$`))
    await expect(page.getByRole('heading', { level: 2, name: 'Demo Shopper' })).toBeVisible()
    await expect(demoRow).toHaveAttribute('aria-current', 'true')
    await expect(messages(page)).toHaveCount(1)
    await expect(messages(page).getByText('Demo Shopper')).toBeVisible()
    expect(api.calls).toContain(`POST /chat/conversations/${CID}/read`)

    await write(page, 'On it, one moment.')
    await expect(messages(page).filter({ hasText: 'On it, one moment.' })).toHaveAttribute('data-status', 'sent')
    expect(api.sends).toEqual(['On it, one moment.'])

    api.calls.length = 0
    const thanks = msg('Thanks!', CUSTOMER)
    api.messages.push(thanks)
    api.conversations[0] = { ...first, hasUnreadMessages: false, lastMessage: thanks, lastMessageAt: thanks.createdAt }
    await api.realtime.push(thanks)
    await expect(messages(page).filter({ hasText: 'Thanks!' })).toBeVisible()
    expect(api.calls).toContain(`POST /chat/conversations/${CID}/read`)
    await expect(demoRow).toContainText('Thanks!')
    await expect(demoRow.getByLabel('Unread')).toHaveCount(0)
  })

  test('the real names and role labels of senders show to staff', async ({ page }) => {
    await startChat(page, 'staff', { init: { messages: [msg('Rae here.', { id: 'staff-2', name: 'Rae Staff', role: 'staff' }, OLD(1)), msg('Admin here.', ANA, OLD(2)), msg('Hi!', CUSTOMER, OLD(3))] } })
    await expect(messages(page)).toHaveCount(3)
    await expect(messages(page).filter({ hasText: 'Rae here.' })).toContainText('Rae Staff')
    await expect(messages(page).filter({ hasText: 'Rae here.' })).toContainText('Staff')
    await expect(messages(page).filter({ hasText: 'Admin here.' })).toContainText('Ana Admin')
    await expect(messages(page).filter({ hasText: 'Admin here.' })).toContainText('Admin')
    await expect(page.getByText('KRAL', { exact: true })).toHaveCount(0)
  })

  test('searches on the server once typing pauses, and shows what matched', async ({ page, isMobile }) => {
    test.skip(isMobile, 'covered on desktop')
    const api = await startChat(page, 'staff', { path: inboxPath('staff', false), init: { conversations: [conversation(), conversation({ id: 'c2' }, LIA)] } })
    await expect(page.getByTestId('inbox-row')).toHaveCount(2)
    const search = page.getByRole('searchbox', { name: 'Search conversations' })
    await search.fill('lia')
    await expect(page.getByTestId('inbox-row')).toHaveCount(1)
    expect(api.inboxQueries.some((q) => q.includes('search=lia'))).toBe(true)
    await search.fill('zzz')
    await expect(page.getByText(/No conversation matches “zzz”/)).toBeVisible()
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(page.getByTestId('inbox-row')).toHaveCount(2)
  })

  test('the Unread chip asks the server for unread threads only', async ({ page, isMobile }) => {
    test.skip(isMobile, 'covered on desktop')
    const api = await startChat(page, 'staff', {
      path: inboxPath('staff', false),
      init: { conversations: [conversation({ hasUnreadMessages: true }), conversation({ id: 'c2' }, LIA)] },
    })
    await expect(page.getByTestId('inbox-row')).toHaveCount(2)
    await page.getByRole('tab', { name: 'Unread' }).click()
    await expect(page.getByTestId('inbox-row')).toHaveCount(1)
    expect(api.inboxQueries.some((q) => q.includes('unreadOnly=true'))).toBe(true)
    api.conversations[0].hasUnreadMessages = false
    await page.getByRole('tab', { name: 'All' }).click()
    await page.getByRole('tab', { name: 'Unread' }).click()
    await expect(page.getByText('Nothing is waiting for a reply.')).toBeVisible()
    await page.getByRole('button', { name: 'Show all' }).click()
    await expect(page.getByTestId('inbox-row')).toHaveCount(2)
  })

  test('shows an empty inbox, and an inbox error with Retry', async ({ page }) => {
    const api = await startChat(page, 'staff', { path: inboxPath('staff', false), init: { conversations: [] }, setup: (a) => (a.fail.inbox = 500) })
    await expect(page.getByText("We couldn't load conversations.")).toBeVisible()
    api.fail.inbox = null
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(page.getByText('No conversations yet. When a customer messages us, it shows up here.')).toBeVisible()
    await expect(page.getByTestId('inbox-row')).toHaveCount(0)
  })

  test('any staff role can reply, with no takeover controls', async ({ page }) => {
    const api = await startChat(page, 'admin', { init: { messages: [HELLO] } })
    await expect(composer(page)).toBeEnabled()
    await expect(page.getByRole('button', { name: /Take over|Release/ })).toHaveCount(0)
    await write(page, 'Admin reply')
    await expect(messages(page).filter({ hasText: 'Admin reply' })).toHaveAttribute('data-status', 'sent')
    expect(api.sends).toEqual(['Admin reply'])
    await expect(messages(page).filter({ hasText: 'Admin reply' })).not.toContainText('Dev Admin')
  })
})

test.describe('thread states', () => {
  test('shows a skeleton while loading, then the thread', async ({ page }) => {
    let release = () => {}
    await startChat(page, 'customer', { init: { messages: [HELLO] }, setup: (api) => (release = api.hold('conversation')) })
    await expect(page.getByRole('status', { name: 'Loading conversation' })).toBeVisible()
    release()
    await expect(messages(page)).toHaveCount(1)
    await expect(page.getByRole('status', { name: 'Loading conversation' })).toHaveCount(0)
  })

  test('shows an error with Retry when the conversation fails to load', async ({ page }) => {
    const api = await startChat(page, 'customer', { init: { messages: [HELLO] }, setup: (a) => (a.fail.conversation = 500) })
    await expect(page.getByRole('alert')).toContainText("We couldn't load your messages.")
    api.fail.conversation = null
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(messages(page)).toHaveCount(1)
  })
})

test.describe('connection and layout', () => {
  test('shows Reconnecting while the channel errors, polls for new messages meanwhile, and hides the banner once it is subscribed', async ({ page }) => {
    test.setTimeout(60_000)
    const api = await startChat(page, 'customer', { init: { messages: [HELLO] }, setup: (a) => (a.realtime.mode = 'error') })
    await expect(messages(page)).toHaveCount(1)
    await expect(page.getByTestId('chat-reconnecting')).toBeVisible()
    await expect(page.getByText('Connection lost. We are reconnecting; messages you send now may be delayed.')).toBeVisible()

    // No event reaches the page, so the 5 second poll is what brings the reply in.
    api.messages.push(msg('Found you by polling.', SAM))
    await expect(messages(page).filter({ hasText: 'Found you by polling.' })).toBeVisible({ timeout: 15_000 })

    await write(page, 'Sent while reconnecting')
    await expect(messages(page).filter({ hasText: 'Sent while reconnecting' })).toHaveAttribute('data-status', 'sent')

    api.realtime.mode = 'ok'
    await expect(page.getByTestId('chat-reconnecting')).toHaveCount(0, { timeout: 30_000 })
    await expect.poll(() => api.realtime.topics()).toContain(`realtime:chat:conversation:${CID}`)
    const live = msg('Live again.', SAM)
    api.messages.push(live)
    await api.realtime.push(live)
    await expect(messages(page).filter({ hasText: 'Live again.' })).toBeVisible()
  })

  for (const width of [320, 768]) {
    test(`staff inbox at ${width}px: list then thread with a back button, and no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await startChat(page, 'staff', { path: inboxPath('staff', false), init: { messages: [HELLO], conversations: [conversation({ lastMessage: HELLO, lastMessageAt: OLD(1) })] } })
      await expect(page.getByTestId('inbox-row')).toBeVisible()
      await expect(composer(page)).toBeHidden()
      expect(await overflow(page)).toBeLessThanOrEqual(0)

      await page.getByTestId('inbox-row').click()
      await expect(composer(page)).toBeVisible()
      await expect(page.getByTestId('inbox-row')).toBeHidden()
      expect(await overflow(page)).toBeLessThanOrEqual(0)

      await page.getByRole('button', { name: 'Back to conversations' }).click()
      await expect(page.getByTestId('inbox-row')).toBeVisible()
      await expect(composer(page)).toBeHidden()
    })
  }

  for (const width of [320, 768]) {
    test(`customer thread at ${width}px has no horizontal scroll, even with a long unbroken message`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 })
      await startChat(page, 'customer', { init: { messages: [msg('x'.repeat(200), SAM, OLD(1))] } })
      await expect(messages(page)).toHaveCount(1)
      expect(await overflow(page)).toBeLessThanOrEqual(0)
    })
  }
})
