import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POLL_MS, SAFETY_POLL_MS } from '../../src/hooks/useChatRealtime'
import { TYPING_MS, TYPING_SEND_MS, useConversation } from '../../src/hooks/useConversation'
import { ChatError, fetchConversation, fetchMessages, markConversationRead, sendMessage, sendTyping, type ChatMessage, type Conversation, type MessageSender } from '../../src/service/chatApi'
import { clearSession, setSession } from '../../src/service/session'
import { AvatarUploadError, deleteAvatar, uploadAvatar } from '../../src/service/uploadAvatar'

vi.mock('../../src/service/chatApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/chatApi')>()),
  fetchConversation: vi.fn(),
  fetchMessages: vi.fn(),
  sendMessage: vi.fn(),
  sendTyping: vi.fn(),
  markConversationRead: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../src/service/uploadAvatar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/uploadAvatar')>()),
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../src/utils/chatAttachments', () => ({ compressImage: vi.fn(async (file: File) => file) }))
vi.mock('../../src/service/fetchMe', () => ({ fetchMe: vi.fn().mockResolvedValue({ id: 'me' }) }))

const toast = { show: vi.fn(), dismiss: vi.fn() }
vi.mock('../../src/components/toast/useToast', () => ({ useToast: () => toast }))

// The Realtime channel: the test plays the server by calling what the hook handed to subscribeToMessages.
const channel = vi.hoisted(() => ({
  open: undefined as undefined | { topic: string; onMessage: (message: ChatMessage) => void; onStatus: (status: string) => void; onTyping?: (sender: MessageSender) => void },
  unsubscribe: vi.fn(),
}))
vi.mock('../../src/service/chatRealtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/chatRealtime')>()),
  subscribeToMessages: (topic: string, onMessage: (message: ChatMessage) => void, onStatus: (status: string) => void, onTyping?: (sender: MessageSender) => void) => {
    channel.open = { topic, onMessage, onStatus, onTyping }
    return channel.unsubscribe
  },
}))
const status = (value: string) => act(() => channel.open!.onStatus(value))
const typing = (who: MessageSender) => act(() => channel.open!.onTyping!(who))
const insert = (broadcast: ChatMessage) => act(() => channel.open!.onMessage(broadcast))

const sender = (role: MessageSender['role'], id: string, fullName: string): MessageSender => ({ id, firstName: '', lastName: '', fullName, role, avatarUrl: null })
const STAFF = sender('staff', 'staff-1', 'Ana Cruz')

const message = (id: string, createdAt: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  conversationId: 'c1',
  senderId: 'staff-1',
  content: `content ${id}`,
  attachments: [],
  createdAt,
  updatedAt: createdAt,
  sender: STAFF,
  ...extra,
})
const detail: Conversation = {
  id: 'c1',
  customerId: 'u9',
  customer: { id: 'u9', email: 'lia@example.com', firstName: 'Lia', lastName: 'Reyes', fullName: 'Lia Reyes', avatarUrl: null, messagingBlockedAt: null, messagingBlockedReason: null },
  lastMessageAt: null,
  customerReadAt: null,
  staffReadAt: null,
  hasUnreadMessages: false,
  lastMessage: null,
  createdAt: '2025-11-04T00:00:00Z',
  updatedAt: '2025-11-04T00:00:00Z',
}

const page = (...messages: ChatMessage[]) => ({ messages, hasMore: false })

async function setup() {
  const hook = renderHook(() => useConversation('c1'))
  await waitFor(() => expect(hook.result.current.detail).toBeDefined())
  await waitFor(() => expect(channel.open).toBeDefined())
  return hook
}

beforeEach(() => {
  channel.open = undefined
  vi.mocked(fetchConversation).mockResolvedValue(detail)
  vi.mocked(fetchMessages).mockResolvedValue(page(message('m1', '2025-11-04T01:00:00Z')))
})
afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  clearSession()
})

describe('useConversation', () => {
  it('loads the thread oldest first, listens to its own channel and stops on unmount', async () => {
    vi.mocked(fetchMessages).mockResolvedValue(page(message('m1', '2025-11-04T01:00:00Z'), message('m2', '2025-11-04T02:00:00Z')))
    const { result, unmount } = await setup()
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(channel.open).toMatchObject({ topic: 'chat:conversation:c1' })
    expect(markConversationRead).toHaveBeenCalledWith('c1')
    unmount()
    expect(channel.unsubscribe).toHaveBeenCalled()
  })

  it('opens no channel for a saved dev account', async () => {
    setSession({ name: 'Dev', email: 'dev@example.com', simulated: true })
    const { result } = renderHook(() => useConversation('c1'))
    await waitFor(() => expect(result.current.detail).toBeDefined())
    expect(channel.open).toBeUndefined()
    expect(result.current.connectionState).toBe('connecting')
  })

  it('shows a sent message at once as pending under a local id, then replaces it with the stored one', async () => {
    const { result } = await setup()
    let finish!: (sent: ChatMessage) => void
    vi.mocked(sendMessage).mockReturnValue(new Promise((resolve) => (finish = resolve)))

    act(() => void result.current.send('Hello'))
    expect(result.current.messages.at(-1)).toMatchObject({ content: 'Hello', status: 'pending', id: expect.stringMatching(/^pending-/) })
    expect(result.current.sending).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith('c1', 'Hello')

    await act(async () => finish(message('m2', '2025-11-04T02:00:00Z', { senderId: 'me', content: 'Hello' })))
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(result.current.messages.at(-1)).not.toHaveProperty('status')
    expect(result.current.sending).toBe(false)
  })

  it('shows a message once when the Realtime echo arrives before the reply, and again after it', async () => {
    const { result } = await setup()
    let finish!: (sent: ChatMessage) => void
    vi.mocked(sendMessage).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    act(() => void result.current.send('Hello'))

    const echo = message('m2', '2025-11-04T02:00:00Z', { senderId: 'me', content: 'Hello', sender: sender('customer', 'me', 'Me') })
    insert(echo)
    expect(result.current.messages.filter((m) => m.content === 'Hello')).toHaveLength(1)
    await act(async () => finish(echo))
    insert(echo)
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('shows a broadcast message with the sender it carries, and marks the thread read', async () => {
    const { result } = await setup()
    vi.mocked(markConversationRead).mockClear()
    insert(message('m2', '2025-11-04T02:00:00Z', { sender: sender('admin', 'adm-1', 'Bo Admin'), senderId: 'adm-1' }))
    expect(result.current.messages.at(-1)).toMatchObject({ id: 'm2', sender: { role: 'admin', fullName: 'Bo Admin' } })
    expect(markConversationRead).toHaveBeenCalledWith('c1')
  })

  it('shows a broadcast once however often it arrives, and does not mark read for an own message', async () => {
    const { result } = await setup()
    vi.mocked(markConversationRead).mockClear()
    const mine = message('m3', '2025-11-04T03:00:00Z', { senderId: 'me', content: 'Mine', sender: sender('customer', 'me', 'Me') })
    insert(mine)
    insert(mine)
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm3'])
    expect(markConversationRead).not.toHaveBeenCalled()
  })

  it('ignores a broadcast for another conversation', async () => {
    const { result } = await setup()
    insert(message('x', '2025-11-04T05:00:00Z', { conversationId: 'other' }))
    expect(result.current.messages).toHaveLength(1)
  })

  it('marks a failed send, and Retry sends it again under the same local id', async () => {
    const { result } = await setup()
    vi.mocked(sendMessage).mockRejectedValueOnce(new ChatError('network'))
    await act(async () => void result.current.send('Hello'))
    const failed = result.current.messages.at(-1)!
    expect(failed).toMatchObject({ content: 'Hello', status: 'failed' })

    vi.mocked(sendMessage).mockResolvedValueOnce(message('m2', '2025-11-04T02:00:00Z', { senderId: 'me', content: 'Hello' }))
    await act(async () => void result.current.retrySend(failed.id))
    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(result.current.messages.at(-1)?.status).toBeUndefined()
  })

  it('removes a failed message', async () => {
    const { result } = await setup()
    vi.mocked(sendMessage).mockRejectedValueOnce(new ChatError('server'))
    await act(async () => void result.current.send('Hello'))
    act(() => result.current.removeFailed(result.current.messages.at(-1)!.id))
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1'])
  })

  it('shows a banner state and one toast when the channel errors, then fetches what was missed once it is subscribed again', async () => {
    const { result } = await setup()
    await status('SUBSCRIBED')
    expect(result.current.connectionState).toBe('connected')
    await status('CHANNEL_ERROR')
    expect(result.current.connectionState).toBe('reconnecting')
    await status('CLOSED')
    expect(toast.show).toHaveBeenCalledTimes(1)

    vi.mocked(fetchMessages).mockResolvedValue(page(message('m1', '2025-11-04T01:00:00Z'), message('m0', '2025-11-04T00:30:00Z'), message('m3', '2025-11-04T03:00:00Z')))
    await status('SUBSCRIBED')
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['m0', 'm1', 'm3']))
    expect(result.current.connectionState).toBe('connected')
  })

  it('polls the newest messages every 5 seconds while the channel is not subscribed, and stops once it is', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = await setup()
    expect(result.current.connectionState).toBe('connecting')
    vi.mocked(fetchMessages).mockClear()
    vi.mocked(fetchMessages).mockResolvedValue(page(message('m1', '2025-11-04T01:00:00Z'), message('m2', '2025-11-04T02:00:00Z')))

    await act(async () => void vi.advanceTimersByTime(POLL_MS))
    expect(fetchMessages).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2']))

    await status('SUBSCRIBED')
    vi.mocked(fetchMessages).mockClear()
    await act(async () => void vi.advanceTimersByTime(POLL_MS * 3))
    expect(fetchMessages).not.toHaveBeenCalled()
  })

  it('fetches the newest messages every 30 seconds while subscribed, so a missed broadcast self-heals', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = await setup()
    await status('SUBSCRIBED')
    vi.mocked(fetchMessages).mockClear()
    vi.mocked(fetchMessages).mockResolvedValue(page(message('m1', '2025-11-04T01:00:00Z'), message('m2', '2025-11-04T02:00:00Z')))

    await act(async () => void vi.advanceTimersByTime(SAFETY_POLL_MS - 1))
    expect(fetchMessages).not.toHaveBeenCalled()
    await act(async () => void vi.advanceTimersByTime(1))
    expect(fetchMessages).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2']))
  })

  it('loads earlier messages before the oldest one', async () => {
    vi.mocked(fetchMessages).mockResolvedValueOnce({ messages: [message('m2', '2025-11-04T02:00:00Z')], hasMore: true })
    const { result } = await setup()
    expect(result.current.hasMore).toBe(true)

    vi.mocked(fetchMessages).mockResolvedValue({ messages: [message('m1', '2025-11-04T01:00:00Z')], hasMore: false })
    await act(async () => result.current.loadEarlier())
    expect(vi.mocked(fetchMessages)).toHaveBeenLastCalledWith('c1', '2025-11-04T02:00:00Z')
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(result.current.hasMore).toBe(false)
  })

  it('stores why a send failed, and clears it on Retry', async () => {
    const { result } = await setup()
    vi.mocked(sendMessage).mockRejectedValueOnce(new ChatError('rate-limit'))
    await act(async () => void result.current.send('Hello'))
    const failed = result.current.messages.at(-1)!
    expect(failed).toMatchObject({ status: 'failed', failure: 'rate-limit' })

    vi.mocked(sendMessage).mockRejectedValueOnce(new TypeError('failed'))
    await act(async () => void result.current.retrySend(failed.id))
    expect(result.current.messages.at(-1)).toMatchObject({ status: 'failed', failure: 'network' })

    let finish!: (sent: ChatMessage) => void
    vi.mocked(sendMessage).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    act(() => void result.current.retrySend(failed.id))
    expect(result.current.messages.at(-1)).toMatchObject({ status: 'pending', failure: undefined })
    await act(async () => finish(message('m2', '2025-11-04T02:00:00Z', { senderId: 'me', content: 'Hello' })))
  })

  it('refreshes the detail after a forbidden send, so a block that started mid-thread shows, and ignores a failed refresh', async () => {
    const { result } = await setup()
    const blocked = { ...detail, customer: { ...detail.customer!, messagingBlockedAt: '2025-11-05T00:00:00Z', messagingBlockedReason: 'Spam' } }
    vi.mocked(sendMessage).mockRejectedValueOnce(new ChatError('forbidden'))
    vi.mocked(fetchConversation).mockResolvedValueOnce(blocked)
    await act(async () => void result.current.send('Hello'))
    expect(result.current.detail?.customer?.messagingBlockedAt).toBe('2025-11-05T00:00:00Z')

    vi.mocked(sendMessage).mockRejectedValueOnce(new ChatError('forbidden'))
    vi.mocked(fetchConversation).mockRejectedValueOnce(new TypeError('failed'))
    await act(async () => void result.current.send('Again'))
    expect(result.current.messages.at(-1)).toMatchObject({ status: 'failed', failure: 'forbidden' })
  })

  describe('typing', () => {
    const CUSTOMER = sender('customer', 'u9', 'Lia Reyes')

    it('shows another sender as typing, never the viewer, and lets it expire after 4 seconds', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      setSession({ name: 'Sam', email: 's@example.com', role: 'staff' })
      const { result } = await setup()
      await typing(sender('staff', 'me', 'Me'))
      expect(result.current.typingName).toBeUndefined()

      await typing(CUSTOMER)
      expect(result.current.typingName).toBe('Lia Reyes')
      await act(async () => void vi.advanceTimersByTime(TYPING_MS - 1))
      expect(result.current.typingName).toBe('Lia Reyes')
      await typing(CUSTOMER) // typing again restarts the 4 seconds
      await act(async () => void vi.advanceTimersByTime(TYPING_MS - 1))
      expect(result.current.typingName).toBe('Lia Reyes')
      await act(async () => void vi.advanceTimersByTime(1))
      expect(result.current.typingName).toBeUndefined()
    })

    it('stops when a message from that sender arrives, but not for one from someone else', async () => {
      const { result } = await setup()
      await typing(STAFF)
      insert(message('m2', '2025-11-04T02:00:00Z', { senderId: 'u9', sender: CUSTOMER }))
      expect(result.current.typingName).toBe('KRAL')
      insert(message('m3', '2025-11-04T03:00:00Z'))
      expect(result.current.typingName).toBeUndefined()
    })

    it('shows a customer KRAL for every non-customer sender, and staff the real name', async () => {
      const customerView = await setup()
      await typing(STAFF)
      expect(customerView.result.current.typingName).toBe('KRAL')
      customerView.unmount()

      setSession({ name: 'Sam', email: 's@example.com', role: 'staff' })
      channel.open = undefined
      const staffView = await setup()
      await typing(CUSTOMER)
      expect(staffView.result.current.typingName).toBe('Lia Reyes')
      await typing(STAFF)
      expect(staffView.result.current.typingName).toBe('Ana Cruz')
    })

    it('sends at most one typing call per 2.5 seconds', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const { result } = await setup()
      act(() => result.current.notifyTyping())
      act(() => result.current.notifyTyping())
      expect(sendTyping).toHaveBeenCalledTimes(1)
      expect(sendTyping).toHaveBeenCalledWith('c1')
      await act(async () => void vi.advanceTimersByTime(TYPING_SEND_MS))
      act(() => result.current.notifyTyping())
      expect(sendTyping).toHaveBeenCalledTimes(2)
    })
  })
})

describe('useConversation attachments', () => {
  const photo = (name = 'a.png') => new File(['x'], name, { type: 'image/png' })
  const url = (name: string) => `https://x/storage/v1/object/public/attachments/me/${name}`
  beforeEach(() => {
    let n = 0
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => `blob:p${n++}`), revokeObjectURL: vi.fn() }))
    vi.mocked(uploadAvatar).mockImplementation(async (file, _id, onProgress) => {
      onProgress(100)
      return url(file.name)
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows a pending bubble with local previews, uploads to the attachments bucket, then sends the four fields', async () => {
    const { result } = await setup()
    let finish!: (sent: ChatMessage) => void
    vi.mocked(sendMessage).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    act(() => void result.current.send('', [photo('a.png'), photo('b.png')]))
    expect(result.current.messages.at(-1)).toMatchObject({ status: 'pending', content: '', attachments: [{ url: 'blob:p0', type: 'IMAGE' }, { url: 'blob:p1' }] })
    await waitFor(() => expect(sendMessage).toHaveBeenCalled())
    expect(uploadAvatar).toHaveBeenCalledWith(expect.any(File), 'me', expect.any(Function), undefined, 'attachments')
    expect(sendMessage).toHaveBeenCalledWith('c1', '', [
      { url: url('a.png'), fileName: 'a.png', mimeType: 'image/png', sizeBytes: 1 },
      { url: url('b.png'), fileName: 'b.png', mimeType: 'image/png', sizeBytes: 1 },
    ])
    await act(async () => finish(message('m2', '2025-11-04T02:00:00Z', { senderId: 'me', content: '' })))
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:p0')
  })

  it('reports aggregate upload progress on the pending bubble', async () => {
    const { result } = await setup()
    let report!: (percent: number) => void
    vi.mocked(uploadAvatar).mockImplementation((_f, _id, onProgress) => {
      report = onProgress
      return new Promise(() => {})
    })
    act(() => void result.current.send('', [photo('a.png'), photo('b.png')]))
    await waitFor(() => expect(report).toBeDefined())
    act(() => report(50))
    expect(result.current.messages.at(-1)?.progress).toBe(25)
  })

  it('pairs an echo with its pending copy by text and attachment count when the text is empty', async () => {
    const { result } = await setup()
    vi.mocked(uploadAvatar).mockReturnValue(new Promise(() => {}))
    act(() => void result.current.send('', [photo()]))
    const echo = message('m2', '2025-11-04T02:00:00Z', { senderId: 'me', content: '', attachments: [{ id: 'x', url: url('a.png'), type: 'IMAGE', mimeType: 'image/png', fileName: 'a.png', sizeBytes: 1, displayOrder: 0, createdAt: '' }] })
    insert(echo)
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('retries without uploading again, after the send failed on the network', async () => {
    const { result } = await setup()
    vi.mocked(sendMessage).mockRejectedValueOnce(new ChatError('network'))
    await act(async () => void result.current.send('', [photo()]))
    const failed = result.current.messages.at(-1)!
    expect(failed.status).toBe('failed')
    expect(uploadAvatar).toHaveBeenCalledTimes(1)
    expect(deleteAvatar).not.toHaveBeenCalled()
    vi.mocked(sendMessage).mockResolvedValue(message('m2', '2025-11-04T02:00:00Z', { senderId: 'me', content: '' }))
    await act(async () => void result.current.retrySend(failed.id))
    expect(uploadAvatar).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })

  it('deletes the uploads when the server refuses the message, and releases the previews on Remove', async () => {
    const { result } = await setup()
    vi.mocked(sendMessage).mockRejectedValueOnce(new ChatError('validation'))
    await act(async () => void result.current.send('', [photo()]))
    expect(result.current.messages.at(-1)).toMatchObject({ status: 'failed', failure: 'validation' })
    expect(deleteAvatar).toHaveBeenCalledWith(url('a.png'), 'me', 'attachments')
    act(() => result.current.removeFailed(result.current.messages.at(-1)!.id))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:p0')
  })

  it('maps an upload that was refused to a validation failure without sending', async () => {
    const { result } = await setup()
    vi.mocked(uploadAvatar).mockRejectedValue(new AvatarUploadError('invalid'))
    await act(async () => void result.current.send('', [photo()]))
    expect(result.current.messages.at(-1)).toMatchObject({ status: 'failed', failure: 'validation' })
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
