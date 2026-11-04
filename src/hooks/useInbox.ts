import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchConversations, type Conversation } from '../service/chatApi'
import { INBOX_TOPIC } from '../service/chatRealtime'
import type { RequestOptions } from '../service/simulateRequest'
import { useChatRefresh } from './useChatRealtime'
import { useSection } from './useSection'

export type InboxFilter = 'all' | 'unread'

/**
 * The staff inbox for one filter and search: the first 100 threads. A new message (and each resync) quietly asks for the list again instead
 * of patching it; the list on screen stays until the new one arrives. The search is done by the server.
 */
export function useInbox(filter: InboxFilter, search: string) {
  const fetcher = useCallback(
    async (options: RequestOptions) => (await fetchConversations({ limit: 100, search, unreadOnly: filter === 'unread' }, options)).conversations,
    [filter, search],
  )
  const section = useSection(fetcher)
  const [latest, setLatest] = useState<{ for: typeof fetcher; threads: Conversation[] }>()
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const refresh = useCallback(() => {
    const current = fetcherRef.current
    current({}).then(
      (threads) => setLatest({ for: current, threads }),
      () => {},
    )
  }, [])
  useChatRefresh(INBOX_TOPIC, refresh)

  // The quiet answer replaces the first one only for the filter and search it was asked for.
  const fresh = latest?.for === fetcher ? latest.threads : undefined
  const conversations = section.state.status === 'success' ? (fresh ?? section.state.data) : []
  return { section, conversations }
}
