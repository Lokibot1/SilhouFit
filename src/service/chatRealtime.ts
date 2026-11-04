import { toMessage, toTyping, type ChatMessage, type MessageSender } from './chatApi'
import { getSupabase } from './supabase'

/** The private Broadcast channels the API sends `message` on after it stores one. */
export const conversationTopic = (conversationId: string) => `chat:conversation:${conversationId}`
export const INBOX_TOPIC = 'chat:inbox'
export const customerTopic = (customerId: string) => `chat:customer:${customerId}`

interface Listener {
  onMessage: (message: ChatMessage) => void
  onStatus: (status: string) => void
  /** Someone is typing in this conversation. */
  onTyping?: (sender: MessageSender) => void
}

interface Shared {
  listeners: Set<Listener>
  status?: string
  stop: () => void
}

// One live channel per topic: supabase-js hands back the same channel for a topic, and it cannot take listeners once joined, so the staff
// inbox and the unread badge (both on the inbox topic) share one and each get every message and status.
const open = new Map<string, Shared>()
// removeChannel is asynchronous and the old channel stays registered under its topic until the server answers. A listener that comes back to
// the same topic meanwhile (the dock steps aside for the Messages page) would be handed that dying channel and never hear a message or a typing hint.
const closing = new Map<string, Promise<unknown>>()

function connect(topic: string, shared: Shared) {
  let stopped = false
  let stop = () => {}
  const emit = (status: string) => {
    shared.status = status
    shared.listeners.forEach((listener) => listener.onStatus(status))
  }
  void (async () => {
    try {
      await closing.get(topic)
      if (stopped) return
      const supabase = await getSupabase()
      const { data } = await supabase.auth.getSession()
      if (stopped) return
      if (data.session) await supabase.realtime.setAuth(data.session.access_token)
      if (stopped) return
      const channel = supabase
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'message' }, ({ payload }) => {
          try {
            const message = toMessage(payload)
            shared.listeners.forEach((listener) => listener.onMessage(message))
          } catch {
            // A payload that is not a message is skipped; the next resync fetches the real thing.
          }
        })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const sender = toTyping(payload)
          if (sender) shared.listeners.forEach((listener) => listener.onTyping?.(sender))
        })
        .subscribe((status) => !stopped && emit(status))
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED' && session) void supabase.realtime.setAuth(session.access_token)
      })
      stop = () => {
        listener.subscription.unsubscribe()
        closing.set(topic, supabase.removeChannel(channel).catch(() => {}))
      }
    } catch {
      if (!stopped) emit('CHANNEL_ERROR')
    }
  })()
  return () => {
    stopped = true
    stop()
  }
}

/**
 * Listens for the `message` broadcasts of one private channel (see the topic helpers; the API sends them, the database authorizes them with
 * RLS on realtime.messages). `onStatus` gets the channel status (SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED). The token is given to Realtime now
 * and whenever it refreshes. `onTyping` also gets the `typing` broadcasts. Returns the function that stops listening.
 */
export function subscribeToMessages(topic: string, onMessage: (message: ChatMessage) => void, onStatus: (status: string) => void, onTyping?: (sender: MessageSender) => void) {
  const listener: Listener = { onMessage, onStatus, onTyping }
  let shared = open.get(topic)
  if (!shared) {
    shared = { listeners: new Set(), stop: () => {} }
    shared.stop = connect(topic, shared)
    open.set(topic, shared)
  }
  const entry = shared
  entry.listeners.add(listener)
  if (entry.status) onStatus(entry.status)
  return () => {
    entry.listeners.delete(listener)
    if (entry.listeners.size === 0) {
      open.delete(topic)
      entry.stop()
    }
  }
}
