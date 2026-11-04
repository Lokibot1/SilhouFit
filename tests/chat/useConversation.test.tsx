import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConversation } from '../../src/hooks/useConversation'
import { ChatError, fetchConversation, fetchMessages, sendMessage, type ChatMessage, type ConversationDetail } from '../../src/service/chatApi'
import { clearSession, setSession } from '../../src/service/session'

vi.mock('../../src/service/chatApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/chatApi')>()),
  fetchConversation: vi.fn(),
  fetchMessages: vi.fn(),
  sendMessage: vi.fn(),
  markConversationRead: vi.fn().mockResolvedValue(undefined),
  takeOverConversation: vi.fn(),
  releaseConversation: vi.fn(),
}))
vi.mock('../../src/service/fetchMe', () => ({ fetchMe: vi.fn().mockResolvedValue({ id: 'me' }) }))

const toast = { show: vi.fn(), dismiss: vi.fn() }
vi.mock('../../src/components/toast/useToast', () => ({ useToast: () => toast }))

type Handler = (...args: unknown[]) => void
const handlers = new Map<string, Set<Handler>>()
const socket = {
  connected: true,
  emit: vi.fn(),
  on(event: string, handler: Handler) {
    handlers.set(event, (handlers.get(event) ?? new Set()).add(handler))
    return socket
  },
  off(event: string, handler: Handler) {
    handlers.get(event)?.delete(handler)
    return socket
  },
}
const fire = (event: string, ...args: unknown[]) => act(() => handlers.get(event)?.forEach((handler) => handler(...args)))
vi.mock('../../src/service/chatSocket', () => ({ getChatSocket: async () => socket }))

const message = (id: string, createdAt: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  conversationId: 'c1',
  senderId: 'staff-1',
  senderName: 'Ana Cruz',
  senderRole: 'staff',
  body: `body ${id}`,
  clientId: `client-${id}`,
  createdAt,
  ...extra,
})

const detail: ConversationDetail = {
  id: 'c1',
  orderNo: 'SF-261104-ABCD',
  customer: { id: 'u9', name: 'Lia Reyes' },
  lastMessage: null,
  lastMessageAt: null,
  unreadCount: 0,
  holder: null,
  canSend: true,
  canTakeOver: false,
  canRelease: false,
}

const page = (...messages: ChatMessage[]) => ({ messages, hasMore: false, nextCursor: null })

async function setup() {
  const hook = renderHook(() => useConversation('c1'))
  await waitFor(() => expect(hook.result.current.detail).toBeDefined())
  await waitFor(() => expect(socket.emit).toHaveBeenCalledWith('conversation:join', { conversationId: 'c1' }, expect.any(Function)))
  return hook
}

const sentWith = (call: number) => vi.mocked(sendMessage).mock.calls[call]

beforeEach(() => {
  handlers.clear()
  socket.connected = true
  vi.mocked(fetchConversation).mockResolvedValue(detail)
  vi.mocked(fetchMessages).mockResolvedValue(page(message('m1', '2025-11-04T01:00:00Z')))
})
afterEach(() => {
  vi.clearAllMocks()
  clearSession()
})

describe('useConversation', () => {
  it('loads the thread, joins its room and leaves it on unmount', async () => {
    const { result, unmount } = await setup()
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1'])
    expect(result.current.canSend).toBe(true)
    unmount()
    expect(socket.emit).toHaveBeenCalledWith('conversation:leave', { conversationId: 'c1' })
    expect(handlers.get('message:new')?.size).toBe(0)
  })

  it('shows a sent message at once as pending, then replaces it with the stored one', async () => {
    const { result } = await setup()
    let finish!: (sent: ChatMessage) => void
    vi.mocked(sendMessage).mockReturnValue(new Promise((resolve) => (finish = resolve)))

    act(() => void result.current.send('Hello'))
    expect(result.current.messages.at(-1)).toMatchObject({ body: 'Hello', status: 'pending' })
    expect(result.current.sending).toBe(true)

    const clientId = sentWith(0)[2]
    expect(clientId).toMatch(/^[0-9a-f-]{36}$/)
    await act(async () => finish(message('m2', '2025-11-04T02:00:00Z', { senderId: 'me', body: 'Hello', clientId })))
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages.at(-1)).toMatchObject({ id: 'm2' })
    expect(result.current.messages.at(-1)).not.toHaveProperty('status')
    expect(result.current.sending).toBe(false)
  })

  it('shows a message once when the socket echo arrives before the reply', async () => {
    const { result } = await setup()
    let finish!: (sent: ChatMessage) => void
    vi.mocked(sendMessage).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    act(() => void result.current.send('Hello'))
    const clientId = sentWith(0)[2]
    const stored = message('m2', '2025-11-04T02:00:00Z', { senderId: 'me', body: 'Hello', clientId })

    fire('message:new', stored)
    expect(result.current.messages.filter((m) => m.body === 'Hello')).toHaveLength(1)
    await act(async () => finish(stored))
    fire('message:new', stored)
    expect(result.current.messages.filter((m) => m.body === 'Hello')).toHaveLength(1)
    expect(result.current.messages).toHaveLength(2)
  })

  it('marks a failed send, and Retry sends again with the same client id', async () => {
    const { result } = await setup()
    vi.mocked(sendMessage).mockRejectedValueOnce(new ChatError('network'))
    await act(async () => void result.current.send('Hello'))
    expect(result.current.messages.at(-1)).toMatchObject({ body: 'Hello', status: 'failed' })

    const clientId = sentWith(0)[2]
    vi.mocked(sendMessage).mockResolvedValueOnce(message('m2', '2025-11-04T02:00:00Z', { senderId: 'me', body: 'Hello', clientId }))
    await act(async () => void result.current.retrySend(clientId))
    expect(sentWith(1)[2]).toBe(clientId)
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages.at(-1)?.status).toBeUndefined()
  })

  it('removes a failed message', async () => {
    const { result } = await setup()
    vi.mocked(sendMessage).mockRejectedValueOnce(new ChatError('server'))
    await act(async () => void result.current.send('Hello'))
    act(() => result.current.removeFailed(sentWith(0)[2]))
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1'])
  })

  it('turns read-only and drops the message when the server answers 403', async () => {
    const { result } = await setup()
    vi.mocked(sendMessage).mockRejectedValueOnce(new ChatError('forbidden'))
    await act(async () => void result.current.send('Hello'))
    expect(result.current.canSend).toBe(false)
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1'])
    expect(toast.show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', message: expect.stringContaining('no longer reply') }))
  })

  it('stops a staff member replying when an admin takes over, and restores it on release', async () => {
    setSession({ name: 'Sam Staff', email: 'sam@example.com', role: 'staff' })
    const { result } = await setup()
    expect(result.current.canSend).toBe(true)

    fire('conversation:takeover', { conversationId: 'c1', holder: { id: 'a1', name: 'Bo Admin', role: 'admin' } })
    expect(result.current.holder).toEqual({ id: 'a1', name: 'Bo Admin', role: 'admin' })
    expect(result.current.canSend).toBe(false)

    fire('conversation:release', { conversationId: 'c1', holder: null })
    expect(result.current.holder).toBeNull()
    expect(result.current.canSend).toBe(true)
  })

  it('never locks a customer out when staff take over', async () => {
    const { result } = await setup()
    fire('conversation:takeover', { conversationId: 'c1', holder: { id: 'a1', name: 'Bo Admin', role: 'admin' } })
    expect(result.current.holder?.name).toBe('Bo Admin')
    expect(result.current.canSend).toBe(true)
  })

  it('ignores events for another conversation', async () => {
    setSession({ name: 'Sam Staff', email: 'sam@example.com', role: 'staff' })
    const { result } = await setup()
    fire('conversation:takeover', { conversationId: 'other', holder: { id: 'a1', name: 'Bo Admin', role: 'admin' } })
    fire('message:new', message('x', '2025-11-04T05:00:00Z', { conversationId: 'other' }))
    expect(result.current.holder).toBeNull()
    expect(result.current.messages).toHaveLength(1)
  })

  it('shows a banner state and a toast on a drop, then fetches what was missed on reconnect and merges it', async () => {
    const { result } = await setup()
    fire('disconnect')
    expect(result.current.connectionState).toBe('reconnecting')
    expect(toast.show).toHaveBeenCalledTimes(1)
    fire('connect_error')
    expect(toast.show).toHaveBeenCalledTimes(1)

    vi.mocked(fetchMessages).mockResolvedValue(page(message('m1', '2025-11-04T01:00:00Z'), message('m0', '2025-11-04T00:30:00Z'), message('m3', '2025-11-04T03:00:00Z')))
    fire('connect')
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['m0', 'm1', 'm3']))
    expect(result.current.connectionState).toBe('connected')
  })

  it('loads earlier messages before the cursor', async () => {
    vi.mocked(fetchMessages).mockResolvedValueOnce({ messages: [message('m2', '2025-11-04T02:00:00Z')], hasMore: true, nextCursor: '2025-11-04T02:00:00Z' })
    const { result } = await setup()
    expect(result.current.hasMore).toBe(true)

    vi.mocked(fetchMessages).mockResolvedValue({ messages: [message('m1', '2025-11-04T01:00:00Z')], hasMore: false, nextCursor: null })
    await act(async () => result.current.loadEarlier())
    expect(vi.mocked(fetchMessages)).toHaveBeenLastCalledWith('c1', '2025-11-04T02:00:00Z')
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(result.current.hasMore).toBe(false)
  })
})
