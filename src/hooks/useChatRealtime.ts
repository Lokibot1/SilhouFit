import { useCallback, useEffect, useRef, useState } from 'react'
import { SIMULATED_AUTH } from '../config/accountPolicy'
import { CHAT_READ_EVENT, type ChatMessage } from '../service/chatApi'
import { subscribeToMessages } from '../service/chatRealtime'
import { getSession } from '../service/session'

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting'

/** While the channel is not SUBSCRIBED, the newest messages are fetched this often instead. */
export const POLL_MS = 5000
/** While it is SUBSCRIBED, this often too, so a broadcast that never arrived is picked up anyway. */
export const SAFETY_POLL_MS = 30000

const REFRESH_DELAY_MS = 300

interface RealtimeOptions {
  /** The private Broadcast channel to listen on; undefined opens nothing, e.g. before a customer's id is known. */
  topic?: string
  /** False opens nothing, for a badge that only some roles show. */
  enabled?: boolean
  /** A new message was broadcast. */
  onMessage: (message: ChatMessage) => void
  /** Ask the server for what may have been missed: on every (re)SUBSCRIBED, every SAFETY_POLL_MS while it is up and every POLL_MS while the channel is down. */
  onSync: () => void
}

/**
 * The live feed of new messages with a polling fallback, so chat still works when Realtime does not deliver. `connection` is
 * 'reconnecting' only after the channel reports an error or closes; it stays 'connecting' before the first answer. A dev account has no token,
 * so it opens no channel and polls nothing (every request would be refused anyway).
 */
export function useChatRealtime({ topic, enabled = true, onMessage, onSync }: RealtimeOptions) {
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const latest = useRef({ onMessage, onSync })
  useEffect(() => {
    latest.current = { onMessage, onSync }
  })

  useEffect(() => {
    if (!topic || !enabled || (SIMULATED_AUTH && getSession()?.simulated)) return
    let timer: number | undefined
    let every = 0
    const pollEvery = (ms: number) => {
      if (every === ms) return
      window.clearInterval(timer)
      every = ms
      timer = window.setInterval(() => latest.current.onSync(), ms)
    }
    pollEvery(POLL_MS)
    const unsubscribe = subscribeToMessages(
      topic,
      (message) => latest.current.onMessage(message),
      (status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('connected')
          pollEvery(SAFETY_POLL_MS)
          latest.current.onSync()
        } else {
          setConnection('reconnecting')
          pollEvery(POLL_MS)
        }
      },
    )
    return () => {
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [topic, enabled])

  return connection
}

/**
 * For a list that only needs to know that something changed (the inbox, the unread badge): every new message, resync and read
 * asks `refresh` again after a short pause, so a burst is one request.
 */
export function useChatRefresh(topic: string | undefined, refresh: () => void, enabled = true) {
  const latest = useRef(refresh)
  useEffect(() => {
    latest.current = refresh
  })
  const timer = useRef<number>(undefined)
  const schedule = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => latest.current(), REFRESH_DELAY_MS)
  }, [])
  useEffect(() => {
    window.addEventListener(CHAT_READ_EVENT, schedule)
    return () => {
      window.removeEventListener(CHAT_READ_EVENT, schedule)
      window.clearTimeout(timer.current)
    }
  }, [schedule])
  return useChatRealtime({ topic, enabled, onMessage: schedule, onSync: schedule })
}
