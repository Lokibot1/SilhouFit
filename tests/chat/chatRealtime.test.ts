import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeToMessages } from '../../src/service/chatRealtime'

// A fake Supabase channel that records what was subscribed to, so the test can play the server.
const fake = vi.hoisted(() => ({
  handlers: {} as Record<string, (message: { payload: unknown }) => void>,
  channels: 0,
  removed: 0,
}))
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
    realtime: { setAuth: async () => {} },
    channel: () => {
      fake.channels += 1
      const channel = {
        on: (_type: string, { event }: { event: string }, handler: (message: { payload: unknown }) => void) => {
          fake.handlers[event] = handler
          return channel
        },
        subscribe: () => channel,
      }
      return channel
    },
    removeChannel: () => void (fake.removed += 1),
  }),
}))

const stops: Array<() => void> = []
afterEach(() => {
  stops.splice(0).forEach((stop) => stop())
  fake.handlers = {}
  fake.channels = 0
  fake.removed = 0
})

const staff = { id: 's1', firstName: 'Ana', lastName: 'Cruz', fullName: 'Ana Cruz', role: 'staff', avatarUrl: null }
const message = { id: 'm1', conversationId: 'c1', senderId: 's1', content: 'Hi', createdAt: '2025-11-04T01:00:00Z', updatedAt: '2025-11-04T01:00:00Z' }

describe('subscribeToMessages typing', () => {
  it('gives a typing broadcast to listeners that ask for it, and leaves message-only listeners alone', async () => {
    const onMessage = vi.fn()
    const onTyping = vi.fn()
    const messageOnly = vi.fn()
    stops.push(subscribeToMessages('chat:conversation:c1', onMessage, () => {}, onTyping))
    stops.push(subscribeToMessages('chat:conversation:c1', messageOnly, () => {}))
    await vi.waitFor(() => expect(fake.handlers.typing).toBeDefined())
    expect(fake.channels).toBe(1)

    fake.handlers.typing({ payload: { conversationId: 'c1', sender: staff } })
    expect(onTyping).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', role: 'staff' }))
    expect(onMessage).not.toHaveBeenCalled()
    expect(messageOnly).not.toHaveBeenCalled()

    fake.handlers.message({ payload: message })
    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(messageOnly).toHaveBeenCalledTimes(1)
    expect(onTyping).toHaveBeenCalledTimes(1)
  })

  it('skips a typing payload that has no sender, and closes the channel after the last listener', async () => {
    const onTyping = vi.fn()
    const stop = subscribeToMessages('chat:conversation:c2', () => {}, () => {}, onTyping)
    await vi.waitFor(() => expect(fake.handlers.typing).toBeDefined())
    fake.handlers.typing({ payload: { conversationId: 'c2' } })
    expect(onTyping).not.toHaveBeenCalled()
    stop()
    expect(fake.removed).toBe(1)
  })
})
