import { SIMULATED_AUTH } from '../config/accountPolicy'
import { toNotification, type ServerNotification } from './notificationsApi'
import { getSession } from './session'
import { getSupabase } from './supabase'

interface Listener {
  onNotification: (notification: ServerNotification) => void
  onStatus: (status: string) => void
}

interface Shared {
  listeners: Set<Listener>
  status?: string
  stop: () => void
}

// One live channel for the signed-in user: supabase-js hands back the same channel for a topic and it cannot take listeners once joined, so the
// bell and the Notifications page share one that closes when the last of them leaves.
let open: Shared | undefined
// removeChannel is asynchronous and the old channel stays registered under its topic until the server answers; a listener that comes back
// meanwhile would be handed that dying channel and never hear a notification.
let closing: Promise<unknown> | undefined

function connect(shared: Shared) {
  let stopped = false
  let stop = () => {}
  const emit = (status: string) => {
    shared.status = status
    shared.listeners.forEach((listener) => listener.onStatus(status))
  }
  void (async () => {
    try {
      await closing
      if (stopped) return
      const supabase = await getSupabase()
      const { data } = await supabase.auth.getSession()
      if (stopped) return
      if (!data.session) return emit('CHANNEL_ERROR')
      await supabase.realtime.setAuth(data.session.access_token)
      if (stopped) return
      const channel = supabase
        .channel(`notifications:user:${data.session.user.id}`, { config: { private: true } })
        .on('broadcast', { event: 'notification.created' }, ({ payload }) => {
          const notification = toNotification(payload)
          if (notification) shared.listeners.forEach((listener) => listener.onNotification(notification))
        })
        .subscribe((status) => !stopped && emit(status))
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED' && session) void supabase.realtime.setAuth(session.access_token)
      })
      stop = () => {
        listener.subscription.unsubscribe()
        closing = supabase.removeChannel(channel).catch(() => {})
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
 * Listens for the `notification.created` broadcasts the API sends on the signed-in user's private channel (authorized by RLS on
 * realtime.messages). `onStatus` gets the channel status (SUBSCRIBED on every join and rejoin, CHANNEL_ERROR, TIMED_OUT, CLOSED). A dev
 * account has no token, so it opens nothing. Returns the function that stops listening.
 */
export function subscribeToNotifications(onNotification: (notification: ServerNotification) => void, onStatus: (status: string) => void) {
  if (SIMULATED_AUTH && getSession()?.simulated) return () => {}
  const listener: Listener = { onNotification, onStatus }
  if (!open) {
    open = { listeners: new Set(), stop: () => {} }
    open.stop = connect(open)
  }
  const entry = open
  entry.listeners.add(listener)
  if (entry.status) onStatus(entry.status)
  return () => {
    entry.listeners.delete(listener)
    if (entry.listeners.size === 0) {
      if (open === entry) open = undefined
      entry.stop()
    }
  }
}
