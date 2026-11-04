import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatError, fetchConversation, fetchConversations, fetchMessages, fetchMyConversations, openConversation, sendMessage, type ChatErrorKind } from '../../src/service/chatApi'
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

const message = (id: string, createdAt: string, extra: object = {}) => ({
  id,
  conversationId: 'c1',
  senderId: 'u1',
  senderName: 'Ana Cruz',
  senderRole: 'staff',
  body: `body ${id}`,
  clientId: `client-${id}`,
  createdAt,
  ...extra,
})

const summary = { id: 'c1', orderNo: 'SF-261104-ABCD', customer: { id: 'u9', firstName: 'Lia', lastName: 'Reyes' }, lastMessage: 'Hi', lastMessageAt: '2026-11-04T01:00:00Z', unreadCount: 2, holder: null }

describe('fetchMessages', () => {
  it('asks for 30 before the cursor and returns the page oldest first', async () => {
    reply({ data: [message('m2', '2026-11-04T02:00:00Z'), message('m1', '2026-11-04T01:00:00Z')], meta: { hasMore: true, nextCursor: '2026-11-04T01:00:00Z' } })
    const page = await fetchMessages('c1', '2026-11-04T03:00:00Z')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/conversations/c1/messages?')
    expect(url).toContain('limit=30')
    expect(url).toContain('before=2026-11-04T03%3A00%3A00Z')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
    expect(page.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(page).toMatchObject({ hasMore: true, nextCursor: '2026-11-04T01:00:00Z' })
  })

  it('rejects a message with no body or a bad date as a server fault', async () => {
    reply({ data: [message('m1', 'not a date')], meta: {} })
    expect(await kindOf(fetchMessages('c1'))).toBe('server')
    reply({ data: [{ ...message('m1', '2026-11-04T01:00:00Z'), body: 5 }], meta: {} })
    expect(await kindOf(fetchMessages('c1'))).toBe('server')
  })

  it('rejects a body that is not a page', async () => {
    reply({ nope: true })
    expect(await kindOf(fetchMessages('c1'))).toBe('server')
  })
})

describe('conversations', () => {
  it('builds the customer name from firstName and lastName', async () => {
    reply([summary])
    const [thread] = await fetchMyConversations()
    expect(thread.customer.name).toBe('Lia Reyes')
  })

  it('reads a detail and keeps only explicit rights as true', async () => {
    reply({ ...summary, canSend: true, canTakeOver: 'yes', holder: { id: 'a1', name: 'Bo Admin', role: 'admin' } })
    const detail = await fetchConversation('c1')
    expect(detail).toMatchObject({ canSend: true, canTakeOver: false, canRelease: false, holder: { name: 'Bo Admin', role: 'admin' } })
  })

  it('accepts a preview sent as an object and drops a holder with an unknown role', async () => {
    reply({ data: [{ ...summary, lastMessage: { body: 'From object' }, holder: { id: 'a1', name: 'X', role: 'wizard' } }] })
    const [thread] = await fetchConversations()
    expect(thread).toMatchObject({ lastMessage: 'From object', holder: null })
  })

  it('sends only the filters that are on', async () => {
    reply({ data: [] })
    await fetchConversations({ limit: 100, mine: false, takenOver: true })
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/conversations\?limit=100&takenOver=true$/)
  })

  // TESTING: orderless chat, remove once orders exist (a thread without an order number is valid now; restore the old title)
  it('rejects a thread without an id', async () => {
    reply({ data: [{ orderNo: 'SF-1' }] })
    expect(await kindOf(fetchConversations())).toBe('server')
  })

  it('lists a customer\'s own threads from a bare array or a data wrapper', async () => {
    reply([summary])
    expect(await fetchMyConversations()).toHaveLength(1)
    reply({ data: [summary] })
    expect(await fetchMyConversations()).toHaveLength(1)
  })

  it('opens a thread with the order number', async () => {
    reply(summary, 201)
    const thread = await openConversation('SF-261104-ABCD')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(fetchMock.mock.calls[0][1].body).toBe('{"orderNo":"SF-261104-ABCD"}')
    expect(thread.id).toBe('c1')
  })

  // TESTING: orderless chat, remove once orders exist
  it('opens the general thread with an empty body and tolerates a null orderNo', async () => {
    reply({ ...summary, orderNo: null }, 201)
    const thread = await openConversation()
    expect(fetchMock.mock.calls[0][1].body).toBe('{}')
    expect(thread.orderNo).toBeNull()
  })
})

describe('sendMessage', () => {
  it('posts the body with its client id and returns the stored message', async () => {
    reply(message('m1', '2026-11-04T01:00:00Z'), 201)
    const sent = await sendMessage('c1', 'Hello', 'client-m1')
    expect(fetchMock.mock.calls[0][1].body).toBe('{"body":"Hello","clientId":"client-m1"}')
    expect(sent.clientId).toBe('client-m1')
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
    reply({ message: ['Body is too long'] }, 400)
    const error = (await sendMessage('c1', 'x', 'k').catch((e: unknown) => e)) as ChatError
    expect(error).toMatchObject({ kind: 'validation', detail: 'Body is too long' })
  })

  it('refuses a saved dev account without calling the server', async () => {
    setSession({ name: 'Dev', email: 'dev@example.com', simulated: true })
    expect(await kindOf(fetchConversation('c1'))).toBe('simulated')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
