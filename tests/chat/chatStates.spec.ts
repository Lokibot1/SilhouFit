import { expect, test, type Page } from '@playwright/test'
import { ANA, CUSTOMER, OLD, SAM, msg, inboxPath, startChat } from './chatMock'

// Failed-send copy, the guest redirect and the typing indicator, against the mocked chat API and Realtime server (see chatMock.ts).

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message', exact: true })
const HELLO = msg('Hi, how can we help?', SAM, OLD(1))

async function write(page: Page, text: string) {
  await composer(page).fill(text)
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
}

test.describe('failed send copy', () => {
  const cases = [
    { name: 'a dropped connection', reply: 'abort', copy: "Not sent. We couldn't reach the server, so check your connection and press Retry.", retry: true },
    { name: 'a refused message (400)', reply: { status: 400, message: 'content too long' }, copy: 'Not sent. The message was refused as invalid (it may be empty or over 2,000 characters). Edit it and send a new one.', retry: false },
    { name: 'no permission (403)', reply: { status: 403, message: 'Forbidden' }, copy: 'Not sent. You may not have permission, or your sign-in expired. Sign in again, then retry.', retry: true },
    { name: 'too fast (429)', reply: { status: 429, message: 'Slow down' }, copy: "Not sent. You're sending too fast. Wait a moment, then press Retry.", retry: true },
    { name: 'a server error (500)', reply: { status: 500, message: 'Boom' }, copy: 'Not sent. Something went wrong on our side. Press Retry in a minute.', retry: true },
  ] as const

  for (const { name, reply, copy, retry } of cases) {
    test(`${name} says why, without the server's own text`, async ({ page }) => {
      const api = await startChat(page, 'customer')
      api.sendReply = () => reply
      await write(page, 'Hello')
      const alert = page.getByTestId('chat-message').getByRole('alert')
      await expect(alert).toContainText(copy)
      await expect(alert).not.toContainText('content too long')
      await expect(alert.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(retry ? 1 : 0)
      await expect(alert.getByRole('button', { name: 'Remove', exact: true })).toBeVisible()
    })
  }
})

test('a guest who opens /messages goes to sign in without any chat request', async ({ page }) => {
  const chatCalls: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/chat/')) chatCalls.push(request.url())
  })
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await page.goto('/messages')
  await expect(page).toHaveURL(/\/login\?next=%2Fmessages$/)
  expect(chatCalls).toEqual([])
})

test.describe('typing indicator', () => {
  test('a customer sees KRAL is typing for staff, never the real name, and it fades after about 4 seconds', async ({ page }) => {
    const api = await startChat(page, 'customer', { init: { messages: [HELLO] } })
    await expect(page.getByTestId('chat-message')).toHaveCount(1)
    await api.realtime.pushTyping(SAM)
    await expect(page.getByText('KRAL is typing…')).toBeVisible()
    await expect(page.getByText('Sam Staff is typing…')).toHaveCount(0)
    await expect(page.getByText('KRAL is typing…')).toHaveCount(0, { timeout: 7000 })
  })

  test('the sender never sees their own typing', async ({ page }) => {
    const api = await startChat(page, 'customer', { init: { messages: [HELLO] } })
    await expect(page.getByTestId('chat-message')).toHaveCount(1)
    await api.realtime.pushTyping(CUSTOMER)
    await api.realtime.pushTyping(SAM)
    await expect(page.getByText('KRAL is typing…')).toBeVisible()
    await expect(page.getByText(/Demo Shopper is typing/)).toHaveCount(0)
  })

  test('staff see the customer name', async ({ page }) => {
    const api = await startChat(page, 'staff', { init: { messages: [HELLO] } })
    await expect(page.getByTestId('chat-message')).toHaveCount(1)
    await api.realtime.pushTyping(CUSTOMER)
    await expect(page.getByText('Demo Shopper is typing…')).toBeVisible()
    await api.realtime.pushTyping(ANA)
    await expect(page.getByText('Ana Admin is typing…')).toBeVisible()
  })

  test('typing sends one call per 2.5 seconds, and none for an empty box', async ({ page }) => {
    const api = await startChat(page, 'customer', { path: inboxPath('customer'), init: { messages: [HELLO] } })
    await expect(page.getByTestId('chat-message')).toHaveCount(1)
    await composer(page).pressSequentially('hello there', { delay: 20 })
    await expect.poll(() => api.typings.length).toBe(1)
    await composer(page).fill('')
    await page.waitForTimeout(3000)
    expect(api.typings).toHaveLength(1)
    await composer(page).pressSequentially('a')
    await expect.poll(() => api.typings.length).toBe(2)
  })
})
