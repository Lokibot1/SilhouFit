import { useCallback, useEffect, useState } from 'react'
import { fetchConversations, fetchMyConversation } from '../service/chatApi'
import { customerTopic, INBOX_TOPIC } from '../service/chatRealtime'
import { getSession } from '../service/session'
import { useChatRefresh } from './useChatRealtime'
import { useCurrentUser } from './useCurrentUser'

/**
 * How many conversations wait for the signed-in user to read: a customer has one thread, so 0 or 1; staff count the threads with an unread
 * customer message. Kept current by Realtime broadcasts and the polling fallback. The badge is a hint only: when a request fails it keeps the last
 * number, and the Messages pages explain the failure themselves. `enabled` false does nothing, for a menu that only some roles show.
 */
export function useChatUnread(enabled = true) {
  const user = useCurrentUser()
  const signedIn = user !== null
  const customer = !user?.role || user.role === 'customer'
  const [unread, setUnread] = useState(0)
  // A customer's channel is named by their id, which the first answer of their thread carries.
  const [customerId, setCustomerId] = useState<string>()
  // A dev account has no token, so there is nothing to ask or to listen to.
  const active = enabled && signedIn && !getSession()?.simulated

  const refresh = useCallback(() => {
    const count = customer
      ? fetchMyConversation().then((thread) => {
          setCustomerId(thread.customerId)
          return thread.hasUnreadMessages ? 1 : 0
        })
      : fetchConversations({ unreadOnly: true, limit: 1 }).then((page) => page.total)
    count.then(setUnread, () => {})
  }, [customer])
  useChatRefresh(customer ? customerId && customerTopic(customerId) : INBOX_TOPIC, refresh, active)
  // The first count: the channel's first SUBSCRIBED asks too, but not when Realtime is slow to answer.
  useEffect(() => {
    if (active) refresh()
  }, [active, refresh])

  return active ? unread : 0
}
