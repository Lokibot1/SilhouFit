import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatError, displayName, previewText, toMessage, fetchConversation, fetchConversations, fetchMessages, fetchMyConversation, markConversationRead, sendFailureCopy, sendMessage, sendTyping, toTyping, type ChatErrorKind } from '../../src/service/chatApi'
import { clearSession, setSession } from '../../src/service/session'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }),
}))

const fetchMock = vi.fn()
const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }))

beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  clearSession()
})

const kindOf = async (call: Promise<unknown>) => {
  const error = await call.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ChatError)
  return (error as ChatError).kind
}

const sender = { id: 'u1', firstName: 'Ana', lastName: 'Cruz', fullName: 'Ana Cruz', role: 'staff', avatarUrl: null }
const message = (id: string, createdAt: string, extra: object = {}) => ({ id, conversationId: 'c1', senderId: 'u1', content: `content ${id}`, createdAt, updatedAt: createdAt, sender, ...extra })

const conversation = {
  id: 'c1',
  customerId: 'u9',
  customer: { id: 'u9', email: 'lia@example.com', firstName: 'Lia', lastName: 'Reyes', fullName: null, avatarUrl: null },
  lastMessageAt: '2026-11-04T01:00:00Z',
  customerReadAt: null,
  staffReadAt: null,
  hasUnreadMessages: true,
  lastMessage: message('m1', '2026-11-04T01:00:00Z'),
  createdAt: '2026-11-04T00:00:00Z',
  updatedAt: '2026-11-04T01:00:00Z',
}

describe('a rate limit', () => {
  it('keeps the Retry-After wait on the ChatError', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '7' } }))
    const error = await fetchMessages('c1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ChatError)
    expect((error as ChatError).retryAfterMs).toBe(7000)
  })
})

describe('fetchMessages', () => {
  it('asks for 50 before the cursor and keeps the API order, oldest first', async () => {
    reply({ data: [message('m1', '2026-11-04T01:00:00Z'), message('m2', '2026-11-04T02:00:00Z')], meta: { total: 9, limit: 50, hasMore: true } })
    const page = await fetchMessages('c1', '2026-11-04T03:00:00Z')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/chat/conversations/c1/messages?')
    expect(url).toContain('limit=50')
    expect(url).toContain('before=2026-11-04T03%3A00%3A00Z')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
    expect(page.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(page.messages[0]).toMatchObject({ content: 'content m1', sender: { role: 'staff', fullName: 'Ana Cruz' } })
    expect(page.hasMore).toBe(true)
  })

  it('reads hasMore as false when the API does not say true', async () => {
    reply({ data: [], meta: {} })
    expect((await fetchMessages('c1')).hasMore).toBe(false)
  })

  it('rejects a message with no content or a bad date as a server fault', async () => {
    reply({ data: [message('m1', 'not a date')], meta: {} })
    expect(await kindOf(fetchMessages('c1'))).toBe('server')
    reply({ data: [{ ...message('m1', '2026-11-04T01:00:00Z'), content: 5 }], meta: {} })
    expect(await kindOf(fetchMessages('c1'))).toBe('server')
  })

  it('rejects a body that is not a page', async () => {
    reply({ nope: true })
    expect(await kindOf(fetchMessages('c1'))).toBe('server')
  })
})

describe('conversations', () => {
  it("reads the customer's own conversation, with its unread flag and last message", async () => {
    reply(conversation)
    const thread = await fetchMyConversation()
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/chat\/my-conversation$/)
    expect(thread).toMatchObject({ id: 'c1', customerId: 'u9', hasUnreadMessages: true, lastMessage: { id: 'm1' } })
  })

  it('reads the messaging block of the customer, and null when the API sends none', async () => {
    reply(conversation)
    expect((await fetchMyConversation()).customer).toMatchObject({ messagingBlockedAt: null, messagingBlockedReason: null })
    reply({ ...conversation, customer: { ...conversation.customer, messagingBlockedAt: '2026-11-04T02:00:00Z', messagingBlockedReason: 'Spam' } })
    expect((await fetchMyConversation()).customer).toMatchObject({ messagingBlockedAt: '2026-11-04T02:00:00Z', messagingBlockedReason: 'Spam' })
  })

  it('builds a customer name from firstName and lastName, or uses fullName', async () => {
    reply(conversation)
    const thread = await fetchConversation('c1')
    expect(displayName(thread.customer!)).toBe('Lia Reyes')
    expect(displayName({ firstName: 'L', lastName: 'R', fullName: 'Lia Marie Reyes' })).toBe('Lia Marie Reyes')
  })

  it('lists a page with the total, sending only the filters that are on', async () => {
    reply({ data: [conversation], meta: { total: 7, page: 1, limit: 100, totalPages: 1 } })
    const page = await fetchConversations({ limit: 100, search: '', unreadOnly: true })
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/chat\/conversations\?limit=100&unreadOnly=true$/)
    expect(page.total).toBe(7)
    expect(page.conversations).toHaveLength(1)
  })

  it('sends the search text', async () => {
    reply({ data: [], meta: { total: 0 } })
    await fetchConversations({ search: 'lia reyes' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('search=lia+reyes')
  })

  it('treats a missing last message as none, and rejects a thread without an id', async () => {
    reply({ data: [{ ...conversation, lastMessage: null }], meta: {} })
    expect((await fetchConversations()).conversations[0].lastMessage).toBeNull()
    reply({ data: [{ customerId: 'u9' }] })
    expect(await kindOf(fetchConversations())).toBe('server')
  })
})

describe('sendMessage and markConversationRead', () => {
  it('posts the content and returns the stored message', async () => {
    reply(message('m1', '2026-11-04T01:00:00Z'), 201)
    const sent = await sendMessage('c1', 'Hello')
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/chat\/conversations\/c1\/messages$/)
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(fetchMock.mock.calls[0][1].body).toBe('{"content":"Hello"}')
    expect(sent.id).toBe('m1')
  })

  it('posts to /read and tells the page it was read', async () => {
    reply({ success: true })
    const heard = vi.fn()
    window.addEventListener('silhoufit:chat-read', heard)
    await markConversationRead('c1')
    window.removeEventListener('silhoufit:chat-read', heard)
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/chat\/conversations\/c1\/read$/)
    expect(heard).toHaveBeenCalledOnce()
  })
})

describe('error kinds', () => {
  const cases: [number, ChatErrorKind][] = [
    [401, 'forbidden'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [429, 'rate-limit'],
    [500, 'server'],
  ]
  it.each(cases)('maps HTTP %i to %s', async (status, kind) => {
    reply({ message: 'no' }, status)
    expect(await kindOf(fetchConversation('c1'))).toBe(kind)
  })

  it('maps a failed request to network', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'))
    expect(await kindOf(fetchConversation('c1'))).toBe('network')
  })

  it('keeps the server message as the detail', async () => {
    reply({ message: ['content must be shorter than or equal to 2000 characters'] }, 400)
    const error = (await sendMessage('c1', 'x').catch((e: unknown) => e)) as ChatError
    expect(error).toMatchObject({ kind: 'validation', detail: 'content must be shorter than or equal to 2000 characters' })
  })

  it('refuses a saved dev account without calling the server', async () => {
    setSession({ name: 'Dev', email: 'dev@example.com', simulated: true })
    expect(await kindOf(fetchConversation('c1'))).toBe('simulated')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sendFailureCopy', () => {
  it.each<[ChatErrorKind, string]>([
    ['network', "Not sent. We couldn't reach the server, so check your connection and press Retry."],
    ['validation', 'Not sent. The message was refused as invalid (it may be empty or over 2,000 characters). Edit it and send a new one.'],
    ['forbidden', 'Not sent. Your messaging may be blocked, or your sign-in expired. Sign in again, then retry; if it keeps failing, contact support.'],
    ['rate-limit', "Not sent. You're sending too fast. Wait a moment, then press Retry."],
    ['server', 'Not sent. Something went wrong on our side. Press Retry in a minute.'],
    ['simulated', 'Not sent. Something went wrong on our side. Press Retry in a minute.'],
    ['not-found', 'Not sent. This conversation is no longer available. Reload the page.'],
    ['conflict', 'Not sent. This conversation is no longer available. Reload the page.'],
  ])('%s', (kind, copy) => {
    expect(sendFailureCopy(kind)).toBe(copy)
  })
})

describe('message attachments', () => {
  const att = { id: 'a1', url: 'https://x/a.png', type: 'IMAGE', mimeType: 'image/png', fileName: 'a.png', sizeBytes: 10, displayOrder: 0, createdAt: '2026-11-04T01:00:00Z' }
  const base = message('m1', '2026-11-04T01:00:00Z')

  it('parses attachments, and tolerates missing, malformed or bad entries', () => {
    expect(toMessage({ ...base, attachments: [att] }).attachments).toEqual([att])
    expect(toMessage(base).attachments).toEqual([])
    expect(toMessage({ ...base, attachments: 'nope' }).attachments).toEqual([])
    expect(toMessage({ ...base, attachments: [null, { ...att, url: '' }, { ...att, type: 'AUDIO' }, att] }).attachments).toEqual([att])
  })

  it('previews the text, else photos, a video or a mix', () => {
    const preview = (types: string[]) => previewText({ content: '', attachments: types.map((type) => ({ ...att, type })) as never })
    expect(previewText({ content: 'Hi', attachments: [att] as never })).toBe('Hi')
    expect(preview(['IMAGE'])).toBe('Sent a photo')
    expect(preview(['IMAGE', 'IMAGE'])).toBe('Sent 2 photos')
    expect(preview(['VIDEO'])).toBe('Sent a video')
    expect(preview(['IMAGE', 'VIDEO'])).toBe('Sent 2 attachments')
    expect(preview([])).toBe('')
  })
})

describe('typing', () => {
  it('posts to the typing endpoint with no body, and swallows a failure', async () => {
    reply({}, 500)
    sendTyping('c1')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toContain('/chat/conversations/c1/typing')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' })
  })

  it('reads the sender of a typing payload and refuses anything else', () => {
    expect(toTyping({ conversationId: 'c1', sender })).toMatchObject({ id: 'u1', role: 'staff' })
    expect(toTyping({ conversationId: 'c1' })).toBeUndefined()
    expect(toTyping(null)).toBeUndefined()
  })
})
