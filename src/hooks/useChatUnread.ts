import { useEffect, useState } from 'react'
import { fetchConversations, fetchMyConversations } from '../service/chatApi'
import { getChatSocket } from '../service/chatSocket'
import { getSession } from '../service/session'
import { useCurrentUser } from './useCurrentUser'

/**
 * How many chat messages the signed-in user has not read, across their threads, kept current by the socket. The badge is a hint only:
 * when the list or the socket fails it shows nothing, and the Messages pages explain the failure themselves. `enabled` false does nothing, for a menu
 * that only some roles show.
 */
export function useChatUnread(enabled = true) {
  const user = useCurrentUser()
  const signedIn = user !== null
  const customer = !user?.role || user.role === 'customer'
  const [unread, setUnread] = useState(new Map<string, number>())

  useEffect(() => {
    // A dev account has no token, so there is nothing to ask or to connect to.
    if (!enabled || !signedIn || getSession()?.simulated) return
    const controller = new AbortController()
    const { signal } = controller
    let off = () => {}
    let timer: number | undefined
    const load = () => {
      const list = customer ? fetchMyConversations({ signal }) : fetchConversations({ limit: 50 }, { signal })
      list.then(
        (threads) => !signal.aborted && setUnread(new Map(threads.map((thread) => [thread.id, thread.unreadCount]))),
        () => {},
      )
    }
    // `conversation:updated` has no unread count, so each one asks for the list again, a moment later so a burst is one request.
    const refresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(load, 300)
    }
    load()
    getChatSocket().then(
      (socket) => {
        if (signal.aborted) return
        socket.on('conversation:updated', refresh)
        off = () => socket.off('conversation:updated', refresh)
      },
      () => {},
    )
    return () => {
      controller.abort()
      window.clearTimeout(timer)
      off()
    }
  }, [enabled, signedIn, customer])

  return [...unread.values()].reduce((sum, count) => sum + count, 0)
}
