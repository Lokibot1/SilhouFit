import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../components/toast/useToast'
import { fetchConversation, fetchMessages, markConversationRead, sendMessage, type ChatMessage, type ChatRole, type Conversation, type MessageSender } from '../service/chatApi'
import { conversationTopic } from '../service/chatRealtime'
import { fetchMe } from '../service/fetchMe'
import type { RequestOptions } from '../service/simulateRequest'
import { useChatRealtime } from './useChatRealtime'
import { useCurrentUser } from './useCurrentUser'
import { useSection } from './useSection'

/** A message as the thread shows it: `pending` and `failed` ones exist only here, under a local id, until the server confirms them. */
export interface ThreadMessage extends ChatMessage {
  status?: 'pending' | 'failed'
}

interface Live {
  detail: Conversation
  messages: ThreadMessage[]
  hasMore: boolean
  selfId?: string
}

/** Joins messages by id, so a confirmed message and its Realtime echo are one. Oldest first. */
export function mergeMessages(current: ThreadMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}

/** The thread without the pending copy of each message the viewer sent that has now arrived (the echo came before the reply). */
function withoutEchoed(messages: ThreadMessage[], arrived: ChatMessage[], selfId?: string) {
  let result = messages
  for (const message of arrived) {
    const index = message.senderId === selfId ? result.findIndex((m) => m.status === 'pending' && m.content === message.content) : -1
    if (index >= 0) result = result.filter((_, n) => n !== index)
  }
  return result
}

/** One conversation: its detail and latest messages (a section of its own), the live feed with its polling fallback, and sending with an optimistic copy. */
export function useConversation(conversationId: string) {
  const toast = useToast()
  const user = useCurrentUser()
  const role: ChatRole = user?.role ?? 'customer'
  const [live, setLive] = useState<Live | null>(null)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const liveRef = useRef<Live | null>(null)
  const lost = useRef(false)
  useEffect(() => {
    liveRef.current = live
  })

  const load = useCallback(
    async ({ signal }: RequestOptions) => {
      const [detail, page, selfId] = await Promise.all([
        fetchConversation(conversationId, { signal }),
        fetchMessages(conversationId, undefined, { signal }),
        fetchMe({ signal }).then(
          (me) => me.id,
          () => undefined,
        ),
      ])
      return { detail, page, selfId }
    },
    [conversationId],
  )
  const section = useSection(load)

  const loaded = section.state.status === 'success'
  useEffect(() => {
    if (section.state.status === 'success') {
      const { detail, page, selfId } = section.state.data
      setLive({ detail, messages: page.messages, hasMore: page.hasMore, selfId })
      void markConversationRead(conversationId).catch(() => {})
    } else setLive(null)
  }, [section.state, conversationId])

  const selfSender = (old: Live): MessageSender => ({ id: old.selfId ?? '', firstName: '', lastName: '', fullName: user?.name ?? null, role, avatarUrl: user?.avatarUrl ?? null })

  /** Shows messages that are new to the thread, and marks it read when one of them is from someone else. */
  function receive(incoming: ChatMessage[]) {
    const old = liveRef.current
    if (!old) return
    const known = new Set(old.messages.map((message) => message.id))
    const arrived = incoming.filter((message) => !known.has(message.id))
    if (arrived.length === 0) return
    setLive((current) => current && { ...current, messages: mergeMessages(withoutEchoed(current.messages, arrived, current.selfId), arrived) })
    if (arrived.some((message) => message.senderId !== old.selfId)) void markConversationRead(conversationId).catch(() => {})
  }

  const sync = () => void fetchMessages(conversationId).then((page) => receive(page.messages), () => {})

  const connection = useChatRealtime({
    topic: conversationTopic(conversationId),
    enabled: loaded,
    onMessage: (message) => {
      if (message.conversationId === conversationId) receive([message])
    },
    onSync: sync,
  })

  useEffect(() => {
    if (connection === 'connected') lost.current = false
    else if (connection === 'reconnecting' && !lost.current) {
      lost.current = true
      toast.show({ kind: 'error', message: 'Connection lost. We are reconnecting; messages you send now may be delayed.' })
    }
  }, [connection, toast])

  async function deliver(id: string, content: string) {
    try {
      const sent = await sendMessage(conversationId, content)
      setLive((old) => old && { ...old, messages: mergeMessages(old.messages.filter((m) => m.id !== id), [sent]) })
    } catch {
      setLive((old) => old && { ...old, messages: old.messages.map((m) => (m.id === id ? { ...m, status: 'failed' } : m)) })
    }
  }

  function send(content: string) {
    if (!live) return
    const id = `pending-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const pending: ThreadMessage = { id, conversationId, senderId: live.selfId ?? '', content, createdAt: now, updatedAt: now, sender: selfSender(live), status: 'pending' }
    setLive((old) => old && { ...old, messages: mergeMessages(old.messages, [pending]) })
    return deliver(id, content)
  }

  /** Sends a failed message again. The API has no way to tell it from a new one, so a copy that did reach the server shows up twice. */
  function retrySend(id: string) {
    const failed = live?.messages.find((m) => m.id === id && m.status === 'failed')
    if (!failed) return
    setLive((old) => old && { ...old, messages: old.messages.map((m) => (m.id === id ? { ...m, status: 'pending' } : m)) })
    return deliver(id, failed.content)
  }

  const removeFailed = (id: string) => setLive((old) => old && { ...old, messages: old.messages.filter((m) => m.id !== id) })

  async function loadEarlier() {
    const oldest = live?.messages.find((m) => !m.status)
    if (!oldest || loadingEarlier) return
    setLoadingEarlier(true)
    try {
      const page = await fetchMessages(conversationId, oldest.createdAt)
      setLive((old) => old && { ...old, messages: mergeMessages(old.messages, page.messages), hasMore: page.hasMore })
    } catch {
      toast.show({ kind: 'error', message: 'We couldn’t load earlier messages. The connection may have dropped. Press Load earlier messages to try again.' })
    } finally {
      setLoadingEarlier(false)
    }
  }

  return {
    // A loaded answer is shown once it has been copied into `live`, so the skeleton stays up for that one render.
    section: { state: section.state.status === 'success' && !live ? ({ status: 'loading' } as const) : section.state, retry: section.retry },
    detail: live?.detail,
    messages: live?.messages ?? [],
    selfId: live?.selfId,
    hasMore: live?.hasMore ?? false,
    loadingEarlier,
    loadEarlier,
    connectionState: connection,
    sending: live?.messages.some((m) => m.status === 'pending') ?? false,
    send,
    retrySend,
    removeFailed,
  }
}
