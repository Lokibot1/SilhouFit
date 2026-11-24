import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeToNotifications } from '../../src/service/notificationsRealtime'
import { apiNotification } from '../fixtures/notifications'

// A fake Supabase client that records what was subscribed to, so the test can play the server.
const fake = vi.hoisted(() => ({
  topics: [] as string[],
  config: undefined as unknown,
  events: [] as string[],
  handler: undefined as ((message: { payload: unknown }) => void) | undefined,
  status: undefined as ((status: string) => void) | undefined,
  token: undefined as string | undefined,
  removed: 0,
}))
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok', user: { id: 'u1' } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
    realtime: { setAuth: async (token: string) => void (fake.token = token) },
    channel: (topic: string, config: unknown) => {
      fake.topics.push(topic)
      fake.config = config
      const channel = {
        on: (_type: string, { event }: { event: string }, handler: (message: { payload: unknown }) => void) => {
          fake.events.push(event)
          fake.handler = handler
          return channel
        },
        subscribe: (status: (status: string) => void) => {
          fake.status = status
          return channel
        },
      }
      return channel
    },
    removeChannel: async () => void (fake.removed += 1),
  }),
}))

const stops: Array<() => void> = []
afterEach(() => {
  stops.splice(0).forEach((stop) => stop())
  Object.assign(fake, { topics: [], config: undefined, events: [], handler: undefined, status: undefined, token: undefined, removed: 0 })
})

describe('subscribeToNotifications', () => {
  it('joins the private channel of the signed-in user once for every subscriber, and hands each one the notification and the status', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const onStatus = vi.fn()
    stops.push(subscribeToNotifications(first, onStatus))
    stops.push(subscribeToNotifications(second, () => {}))
    await vi.waitFor(() => expect(fake.handler).toBeDefined())
    expect(fake.topics).toEqual(['notifications:user:u1'])
    expect(fake.config).toEqual({ config: { private: true } })
    expect(fake.events).toEqual(['notification.created'])
    expect(fake.token).toBe('tok')

    fake.status?.('SUBSCRIBED')
    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED')
    const sent = apiNotification(1)
    fake.handler?.({ payload: sent })
    expect(first).toHaveBeenCalledWith(expect.objectContaining({ id: sent.id }))
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('ignores a payload that is not a notification', async () => {
    const onNotification = vi.fn()
    stops.push(subscribeToNotifications(onNotification, () => {}))
    await vi.waitFor(() => expect(fake.handler).toBeDefined())
    fake.handler?.({ payload: { nope: true } })
    expect(onNotification).not.toHaveBeenCalled()
  })

  it('closes the channel only when the last subscriber leaves', async () => {
    const stopA = subscribeToNotifications(() => {}, () => {})
    const stopB = subscribeToNotifications(() => {}, () => {})
    await vi.waitFor(() => expect(fake.handler).toBeDefined())
    stopA()
    expect(fake.removed).toBe(0)
    stopB()
    expect(fake.removed).toBe(1)
  })
})
