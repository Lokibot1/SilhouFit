import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchConversations, type ConversationSummary } from '../service/chatApi'
import { getChatSocket } from '../service/chatSocket'
import type { RequestOptions } from '../service/simulateRequest'
import { useSection } from './useSection'

export type InboxFilter = 'all' | 'mine' | 'taken'

const REFRESH_DELAY_MS = 300

/**
 * The staff inbox for one filter: the first 100 threads. `conversation:updated` carries no unread count or order number, so each one (and each
 * reconnect) quietly asks for the list again instead of patching it; the list on screen stays until the new one arrives.
 */
export function useInbox(filter: InboxFilter) {
  const fetcher = useCallback(
    (options: RequestOptions) => fetchConversations({ limit: 50, mine: filter === 'mine', takenOver: filter === 'taken' }, options),
    [filter],
  )
  const section = useSection(fetcher)
  const [latest, setLatest] = useState<{ for: typeof fetcher; threads: ConversationSummary[] }>()
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    let cancelled = false
    let off = () => {}
    let timer: number | undefined
    const refresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const current = fetcherRef.current
        current({}).then(
          (threads) => !cancelled && setLatest({ for: current, threads }),
          () => {},
        )
      }, REFRESH_DELAY_MS)
    }
    getChatSocket().then(
      (socket) => {
        if (cancelled) return
        let wasConnected = socket.connected
        const onConnect = () => {
          if (wasConnected) refresh()
          wasConnected = true
        }
        socket.on('conversation:updated', refresh)
        socket.on('connect', onConnect)
        off = () => {
          socket.off('conversation:updated', refresh)
          socket.off('connect', onConnect)
        }
      },
      () => {},
    )
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      off()
    }
  }, [])

  // The quiet answer replaces the first one only for the filter it was asked for.
  const fresh = latest?.for === fetcher ? latest.threads : undefined
  const conversations = section.state.status === 'success' ? (fresh ?? section.state.data) : []
  return { section, conversations }
}
