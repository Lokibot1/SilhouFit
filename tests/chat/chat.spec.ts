import { expect, test, type Page } from '@playwright/test'
import { ANA, CID, CUSTOMER, ME, OLD, SAM, SUE, detail, emitted, inboxPath, msg, serverEmit, setConnected, startChat, summary } from './chatMock'

// Order chat against a mocked REST API and a fake Socket.IO connection (see chatMock.ts); each test signs in through the real form.

const messages = (page: Page) => page.getByTestId('chat-message')
const composer = (page: Page) => page.getByRole('textbox', { name: 'Message', exact: true })
const sendButton = (page: Page) => page.getByRole('button', { name: 'Send message', exact: true })
const banner = (page: Page) => page.getByTestId('takeover-banner')
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function write(page: Page, text: string) {
  await composer(page).fill(text)
  await sendButton(page).click()
}

const HELLO = msg('Hi, how can we help with SF-1001?', SAM, OLD(1))

test.describe('customer thread', () => {
  test('sends a message (pending, then sent) and shows a staff reply that arrives over the socket', async ({ page }) => {
    const api = await startChat(page, 'customer', { init: { messages: [HELLO] } })
    await expect(messages(page)).toHaveCount(1)
    await expect(page.getByTestId('chat-message').getByText('KRAL', { exact: true })).toBeVisible()
    await expect(page.getByRole('log', { name: 'Messages' })).toContainText(HELLO.body)
    await expect(banner(page)).toHaveCount(0)
    await expect.poll(async () => (await emitted(page)).some((e) => e.event === 'conversation:join')).toBe(true)

    const release = api.hold('send')
    await write(page, 'Is the hoodie in M?')
    const mine = messages(page).filter({ hasText: 'Is the hoodie in M?' })
    await expect(mine).toHaveAttribute('data-status', 'pending')
    await expect(composer(page)).toHaveValue('')
    release()
    await expect(mine).toHaveAttribute('data-status', 'sent')
    expect(api.sends).toHaveLength(1)
    expect(api.sends[0].body).toBe('Is the hoodie in M?')
    expect(api.sends[0].clientId).toBeTruthy()

    await serverEmit(page, 'message:new', msg('Yes, M is in stock.', SAM))
    await expect(messages(page).filter({ hasText: 'Yes, M is in stock.' })).toHaveAttribute('data-status', 'sent')
    await expect(messages(page)).toHaveCount(3)
    expect(api.calls).toContain(`POST /conversations/${CID}/read`)
  })

  test('a failed send shows Retry, which sends the same clientId again; Remove drops a failed message', async ({ page }) => {
    const api = await startChat(page, 'customer')
    api.sendReply = (attempt) => (attempt <= 2 ? 'abort' : 'ok')
    await write(page, 'First try')
    const failed = messages(page).filter({ hasText: 'First try' })
    await expect(failed).toHaveAttribute('data-status', 'failed')
    await failed.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(failed).toHaveAttribute('data-status', 'failed')
    await failed.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(failed).toHaveAttribute('data-status', 'sent')
    expect(api.sends.map((s) => s.clientId)).toEqual(Array(3).fill(api.sends[0].clientId))
    expect(api.sends.map((s) => s.body)).toEqual(Array(3).fill('First try'))

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

  test('the Messages page lists the customer threads with unread badges and opens one', async ({ page }) => {
    await startChat(page, 'customer', {
      path: '/messages',
      init: { summaries: [summary({ lastMessage: 'Yes, M is in stock.', lastMessageAt: OLD(5), unreadCount: 2 })], messages: [HELLO] },
    })
    await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible()
    await expect(page.getByLabel('2 unread')).toBeVisible()
    await page.getByRole('link', { name: /Order SF-1001/ }).click()
    await expect(page).toHaveURL(new RegExp(`/messages/${CID}$`))
    await expect(messages(page)).toHaveCount(1)
    await page.getByRole('link', { name: 'Back to messages' }).click()
    await expect(page).toHaveURL(/\/messages$/)
  })

  test('the Messages page has an empty state with a way back to the shop', async ({ page }) => {
    await startChat(page, 'customer', { path: '/messages', init: { summaries: [] } })
    await expect(page.getByText('No conversations yet.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to shop' })).toBeVisible()
  })
})

test.describe('staff inbox', () => {
  test('lists threads, opens one, replies, and shows a customer message and an inbox update live', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the list and thread are side by side on desktop only; the phone layout is covered below')
    const second = summary({ id: 'c2', orderNo: 'SF-2002', customer: { id: 'u2', firstName: 'Lia', lastName: 'Cruz' } })
    const api = await startChat(page, 'staff', {
      path: inboxPath('staff', false),
      init: { summaries: [summary({ lastMessage: 'Hello?', lastMessageAt: OLD(2), unreadCount: 3 }), second], messages: [msg('Hello?', ME.customer, OLD(2))] },
    })
    await expect(page.getByTestId('inbox-row')).toHaveCount(2)
    const demoRow = page.getByTestId('inbox-row').filter({ hasText: 'Demo Shopper' })
    await expect(demoRow.getByLabel('3 unread')).toBeVisible()
    await expect(page.getByText('Choose a conversation to read it and reply.')).toBeVisible()

    await page.getByRole('searchbox', { name: 'Search conversations' }).fill('lia')
    await expect(page.getByTestId('inbox-row')).toHaveCount(1)
    await page.getByRole('searchbox', { name: 'Search conversations' }).fill('zzz')
    await expect(page.getByText(/No conversation matches “zzz”/)).toBeVisible()
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(page.getByTestId('inbox-row')).toHaveCount(2)

    await page.getByTestId('inbox-row').filter({ hasText: 'Demo Shopper' }).click()
    await expect(page).toHaveURL(new RegExp(`\\?c=${CID}$`))
    await expect(page.getByRole('heading', { level: 2, name: /Order SF-1001/ })).toBeVisible()
    await expect(demoRow).toHaveAttribute('aria-current', 'true')
    await expect(messages(page)).toHaveCount(1)

    await write(page, 'On it, one moment.')
    await expect(messages(page).filter({ hasText: 'On it, one moment.' })).toHaveAttribute('data-status', 'sent')
    expect(api.sends.map((s) => s.body)).toEqual(['On it, one moment.'])

    await serverEmit(page, 'message:new', msg('Thanks!', ME.customer))
    await expect(messages(page).filter({ hasText: 'Thanks!' })).toBeVisible()

    api.summaries = [summary({ lastMessage: 'Thanks!', lastMessageAt: new Date().toISOString(), unreadCount: 0 }), second]
    await serverEmit(page, 'conversation:updated', { id: CID, customerId: CUSTOMER.id, lastMessage: 'Thanks!', lastMessageAt: new Date().toISOString(), holder: null })
    await expect(page.getByTestId('inbox-row').filter({ hasText: 'Thanks!' })).toBeVisible()
    await expect(demoRow.getByLabel('3 unread')).toHaveCount(0)
  })

  test('shows an empty inbox, and an inbox error with Retry', async ({ page }) => {
    const api = await startChat(page, 'staff', { path: inboxPath('staff', false), init: { summaries: [] }, setup: (a) => (a.fail.inbox = 500) })
    await expect(page.getByText('We couldn\'t load conversations.')).toBeVisible()
    api.fail.inbox = null
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(page.getByText('No conversations yet. When a customer messages about an order, it shows up here.')).toBeVisible()
    await expect(page.getByTestId('inbox-row')).toHaveCount(0)
  })
})

test.describe('thread states', () => {
  test('shows a skeleton while loading, then the thread', async ({ page }) => {
    let release = () => {}
    await startChat(page, 'customer', { init: { messages: [HELLO] }, setup: (api) => (release = api.hold('detail')) })
    await expect(page.getByRole('status', { name: 'Loading conversation' })).toBeVisible()
    release()
    await expect(messages(page)).toHaveCount(1)
    await expect(page.getByRole('status', { name: 'Loading conversation' })).toHaveCount(0)
  })

  test('shows an error with Retry when the conversation fails to load', async ({ page }) => {
    const api = await startChat(page, 'customer', { init: { messages: [HELLO] }, setup: (a) => (a.fail.detail = 500) })
    await expect(page.getByRole('alert')).toContainText('We couldn\'t load this conversation.')
    api.fail.detail = null
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(messages(page)).toHaveCount(1)
  })
})

test.describe('taking over', () => {
  test('an admin takes over after confirming, then releases after confirming', async ({ page }) => {
    const api = await startChat(page, 'admin', { init: { detail: detail({ canTakeOver: true }), messages: [HELLO] } })
    await expect(banner(page)).toContainText('Nobody is handling this conversation.')
    await expect(page.getByRole('button', { name: 'Release', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Take over', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Take over this conversation?' })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    expect(api.calls).not.toContain(`POST /conversations/${CID}/takeover`)

    await page.getByRole('button', { name: 'Take over', exact: true }).click()
    await dialog.getByRole('button', { name: 'Take over', exact: true }).click()
    await expect(banner(page)).toContainText('You are handling this conversation.')
    await expect(page.getByText('You are now handling this conversation.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Take over', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Release', exact: true }).click()
    await page.getByRole('dialog', { name: 'Release this conversation?' }).getByRole('button', { name: 'Release conversation' }).click()
    await expect(banner(page)).toContainText('Nobody is handling this conversation.')
    expect(api.calls).toContain(`POST /conversations/${CID}/release`)
  })

  test('staff become read-only on a takeover event but still see new messages, and can reply again after a release event', async ({ page }) => {
    const api = await startChat(page, 'staff', { init: { messages: [HELLO] } })
    await expect(composer(page)).toBeEnabled()

    await serverEmit(page, 'conversation:takeover', { conversationId: CID, holder: ANA })
    await expect(banner(page)).toContainText('Handled by Ana Admin (Admin). You can read this conversation but not reply.')
    await expect(composer(page)).toBeDisabled()
    await expect(sendButton(page)).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Take over', exact: true })).toHaveCount(0)

    await serverEmit(page, 'message:new', msg('Admin here, I will handle this.', ANA))
    await expect(messages(page).filter({ hasText: 'Admin here, I will handle this.' })).toBeVisible()

    await serverEmit(page, 'conversation:release', { conversationId: CID, holder: null })
    await expect(banner(page)).toHaveCount(0) // staff see no banner on a thread nobody holds
    await expect(composer(page)).toBeEnabled()
    await write(page, 'Back with you.')
    await expect(messages(page).filter({ hasText: 'Back with you.' })).toHaveAttribute('data-status', 'sent')
    expect(api.sends).toHaveLength(1)
  })

  test('a 403 on send turns the composer read-only, toasts the server message and drops the pending message', async ({ page }) => {
    const api = await startChat(page, 'staff', { init: { messages: [HELLO] } })
    const reason = 'This conversation is being handled by an admin. You can read it but not reply.'
    api.sendReply = () => ({ status: 403, message: reason })
    await write(page, 'Too late?')
    await expect(page.getByText(reason, { exact: true })).toBeVisible()
    await expect(composer(page)).toBeDisabled()
    await expect(messages(page).filter({ hasText: 'Too late?' })).toHaveCount(0)
    await expect(messages(page)).toHaveCount(1)
  })

  test('a superadmin takes over an admin-held thread after confirming', async ({ page }) => {
    const held = detail({ holder: ANA, canTakeOver: true, canRelease: true })
    const sup = await startChat(page, 'superadmin', { init: { detail: held, messages: [HELLO] } })
    await expect(banner(page)).toContainText('Handled by Ana Admin (Admin).')
    await page.getByRole('button', { name: 'Take over', exact: true }).click()
    await page.getByRole('dialog', { name: 'Take over this conversation?' }).getByRole('button', { name: 'Take over', exact: true }).click()
    await expect(banner(page)).toContainText('You are handling this conversation.')
    expect(sup.calls).toContain(`POST /conversations/${CID}/takeover`)
  })

  test('an admin cannot take over a superadmin-held thread and is read-only there', async ({ page }) => {
    await startChat(page, 'admin', { init: { detail: detail({ holder: SUE, canSend: false, canTakeOver: false, canRelease: false }), messages: [HELLO] } })
    await expect(banner(page)).toContainText('Handled by Sue Super (Superadmin). You can read this conversation but not reply.')
    await expect(page.getByRole('button', { name: 'Take over', exact: true })).toHaveCount(0)
    await expect(composer(page)).toBeDisabled()
  })

  test('an admin turns read-only when a superadmin takes the thread over', async ({ page }) => {
    await startChat(page, 'admin', { init: { detail: detail({ holder: ME.admin, canTakeOver: false, canRelease: true }), messages: [HELLO] } })
    await expect(banner(page)).toContainText('You are handling this conversation.')
    await expect(composer(page)).toBeEnabled()
    await serverEmit(page, 'conversation:takeover', { conversationId: CID, holder: SUE })
    await expect(banner(page)).toContainText('Handled by Sue Super (Superadmin).')
    await expect(composer(page)).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Take over', exact: true })).toBeEnabled()
  })
})

test.describe('connection and layout', () => {
  test('shows a reconnecting banner while the socket is down and hides it on reconnect', async ({ page }) => {
    await startChat(page, 'customer', { init: { messages: [HELLO] } })
    await expect(messages(page)).toHaveCount(1)
    await setConnected(page, false)
    await expect(page.getByTestId('chat-reconnecting')).toBeVisible()
    await expect(page.getByText('Connection lost. We are reconnecting; messages you send now may be delayed.')).toBeVisible()
    await write(page, 'Sent while offline-ish')
    await expect(messages(page).filter({ hasText: 'Sent while offline-ish' })).toHaveAttribute('data-status', 'sent')
    await setConnected(page, true)
    await expect(page.getByTestId('chat-reconnecting')).toHaveCount(0)
  })

  for (const width of [320, 768]) {
    test(`staff inbox at ${width}px: list then thread with a back button, and no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await startChat(page, 'staff', { path: inboxPath('staff', false), init: { messages: [HELLO], summaries: [summary({ lastMessage: HELLO.body, lastMessageAt: OLD(1) })] } })
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

  test('customer thread at 320px has no horizontal scroll, even with a long unbroken message', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await startChat(page, 'customer', { init: { messages: [msg('x'.repeat(200), SAM, OLD(1))] } })
    await expect(messages(page)).toHaveCount(1)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
})
