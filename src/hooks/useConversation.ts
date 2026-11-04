import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../components/toast/useToast'
import {
  ChatError,
  fetchConversation,
  fetchMessages,
  markConversationRead,
  releaseConversation,
  sendMessage,
  takeOverConversation,
  toHolder,
  toMessage,
  type ChatHolder,
  type ChatMessage,
  type ChatRole,
  type ConversationDetail,
} from '../service/chatApi'
import { getChatSocket } from '../service/chatSocket'
import { fetchMe } from '../service/fetchMe'
import type { RequestOptions } from '../service/simulateRequest'
import { useCurrentUser } from './useCurrentUser'
import { useSection } from './useSection'

/** A message as the thread shows it: `pending` and `failed` ones exist only here until the server confirms them. */
export interface ThreadMessage extends ChatMessage {
  status?: 'pending' | 'failed'
}

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting'

interface Live {
  detail: ConversationDetail
  messages: ThreadMessage[]
  hasMore: boolean
  cursor: string | null
  selfId?: string
}

const RANK: Record<ChatRole, number> = { customer: 0, staff: 1, admin: 2, superadmin: 3 }

const keyOf = (message: ChatMessage) => message.clientId || message.id

/** Joins messages by client id (or id), so a confirmed message replaces its pending copy and an echo is not shown twice. Oldest first. */
export function mergeMessages(current: ThreadMessage[], incoming: ChatMessage[]) {
  const byKey = new Map(current.map((message) => [keyOf(message), message]))
  for (const message of incoming) byKey.set(keyOf(message), message)
  return [...byKey.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}

/** What the caller may do once `holder` holds the thread: the server's own answer comes with the next fetch. A customer is never locked out by staff taking over. */
function withHolder(detail: ConversationDetail, holder: ChatHolder | null, selfId: string | undefined, role: ChatRole): ConversationDetail {
  if (role === 'customer') return { ...detail, holder }
  const mine = holder?.id === selfId
  const outranked = holder !== null && !mine && RANK[holder.role] > RANK[role]
  const manager = RANK[role] >= RANK.admin
  return {
    ...detail,
    holder,
    canSend: !outranked,
    canTakeOver: manager && !mine,
    canRelease: manager && holder !== null && (mine || !outranked),
  }
}

/** One conversation: its detail and latest messages (a section of its own), the live socket room, and sending with an optimistic copy. */
export function useConversation(conversationId: string) {
  const toast = useToast()
  const user = useCurrentUser()
  const role: ChatRole = user?.role ?? 'customer'
  const [live, setLive] = useState<Live | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [acting, setActing] = useState(false)
  const lost = useRef(false)

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
      setLive({ detail, messages: page.messages, hasMore: page.hasMore, cursor: page.nextCursor, selfId })
      void markConversationRead(conversationId).catch(() => {})
    } else setLive(null)
  }, [section.state, conversationId])

  const selfId = live?.selfId
  useEffect(() => {
    if (!loaded) return
    let cancelled = false
    let cleanup = () => {}
    const onLost = () => {
      setConnection('reconnecting')
      if (lost.current) return
      lost.current = true
      toast.show({ kind: 'error', message: 'Connection lost. We are reconnecting; messages you send now may be delayed.' })
    }
    getChatSocket().then(
      (socket) => {
        if (cancelled) return
        // Every (re)connect: join the room again and fetch what was missed, newest page first.
        const resync = () => {
          setConnection('connected')
          lost.current = false
          socket.emit('conversation:join', { conversationId }, (ack?: { ok?: boolean }) => {
            if (ack?.ok === false) toast.show({ kind: 'error', message: 'Live updates are off for this conversation. New messages show after you reload.' })
          })
          void Promise.all([fetchMessages(conversationId), fetchConversation(conversationId)]).then(
            ([page, detail]) => !cancelled && setLive((old) => old && { ...old, detail, messages: mergeMessages(old.messages, page.messages) }),
            () => {},
          )
        }
        const onMessage = (value: unknown) => {
          let message: ChatMessage
          try {
            message = toMessage(value)
          } catch {
            return
          }
          if (message.conversationId !== conversationId) return
          setLive((old) => old && { ...old, messages: mergeMessages(old.messages, [message]) })
          if (message.senderId !== selfId) void markConversationRead(conversationId).catch(() => {})
        }
        const onHolder = (value: unknown) => {
          const event = value as { conversationId?: unknown; holder?: unknown } | null
          if (event?.conversationId !== conversationId) return
          setLive((old) => old && { ...old, detail: withHolder(old.detail, toHolder(event.holder), old.selfId, role) })
        }
        socket.on('connect', resync)
        socket.on('disconnect', onLost)
        socket.on('connect_error', onLost)
        socket.on('message:new', onMessage)
        socket.on('conversation:takeover', onHolder)
        socket.on('conversation:release', onHolder)
        if (socket.connected) resync()
        cleanup = () => {
          socket.emit('conversation:leave', { conversationId })
          socket.off('connect', resync)
          socket.off('disconnect', onLost)
          socket.off('connect_error', onLost)
          socket.off('message:new', onMessage)
          socket.off('conversation:takeover', onHolder)
          socket.off('conversation:release', onHolder)
        }
      },
      onLost,
    )
    return () => {
      cancelled = true
      cleanup()
    }
    // selfId and role only matter inside handlers and do not change for a loaded thread.
  }, [conversationId, loaded])

  async function deliver(clientId: string, body: string) {
    try {
      const sent = await sendMessage(conversationId, body, clientId)
      setLive((old) => old && { ...old, messages: mergeMessages(old.messages, [sent]) })
    } catch (failure) {
      if (failure instanceof ChatError && failure.kind === 'forbidden') {
        toast.show({ kind: 'error', message: failure.detail ?? 'You can no longer reply here. A higher role is handling this conversation, so your message was not sent.' })
        setLive((old) => old && { ...old, detail: { ...old.detail, canSend: false }, messages: old.messages.filter((m) => m.clientId !== clientId) })
        return
      }
      setLive((old) => old && { ...old, messages: old.messages.map((m) => (m.clientId === clientId ? { ...m, status: 'failed' } : m)) })
    }
  }

  function send(body: string) {
    if (!live) return
    const clientId = crypto.randomUUID()
    const pending: ThreadMessage = { id: clientId, conversationId, senderId: live.selfId ?? '', senderName: user?.name ?? 'You', senderRole: role, body, clientId, createdAt: new Date().toISOString(), status: 'pending' }
    setLive((old) => old && { ...old, messages: mergeMessages(old.messages, [pending]) })
    return deliver(clientId, body)
  }

  /** Sends a failed message again with the same client id, so a copy that did reach the server is not stored twice. */
  function retrySend(clientId: string) {
    const failed = live?.messages.find((m) => m.clientId === clientId && m.status === 'failed')
    if (!failed) return
    setLive((old) => old && { ...old, messages: old.messages.map((m) => (m.clientId === clientId ? { ...m, status: 'pending' } : m)) })
    return deliver(clientId, failed.body)
  }

  const removeFailed = (clientId: string) => setLive((old) => old && { ...old, messages: old.messages.filter((m) => m.clientId !== clientId) })

  async function loadEarlier() {
    if (!live?.cursor || loadingEarlier) return
    setLoadingEarlier(true)
    try {
      const page = await fetchMessages(conversationId, live.cursor)
      setLive((old) => old && { ...old, messages: mergeMessages(old.messages, page.messages), hasMore: page.hasMore, cursor: page.nextCursor })
    } catch {
      toast.show({ kind: 'error', message: 'We couldn’t load earlier messages. The connection may have dropped. Press Load earlier messages to try again.' })
    } finally {
      setLoadingEarlier(false)
    }
  }

  /** Runs a take over or release, then asks the server for the caller's rights again instead of guessing them. */
  async function change(action: () => Promise<void>, done: string, failed: string) {
    setActing(true)
    try {
      await action()
      const detail = await fetchConversation(conversationId)
      setLive((old) => old && { ...old, detail })
      toast.show({ kind: 'success', message: done })
    } catch (failure) {
      const why = failure instanceof ChatError && failure.detail ? failure.detail : 'The server did not accept the change. Reload the conversation, then try again.'
      toast.show({ kind: 'error', message: `${failed} ${why}` })
    } finally {
      setActing(false)
    }
  }

  const takeOver = () => change(() => takeOverConversation(conversationId), 'You are now handling this conversation.', 'We couldn’t take over this conversation.')
  const release = () => change(() => releaseConversation(conversationId), 'Conversation released to the shared pool.', 'We couldn’t release this conversation.')

  const detail = live?.detail
  return {
    // A loaded answer is shown once it has been copied into `live`, so the skeleton stays up for that one render.
    section: { state: section.state.status === 'success' && !live ? ({ status: 'loading' } as const) : section.state, retry: section.retry },
    detail,
    messages: live?.messages ?? [],
    selfId,
    hasMore: live?.hasMore ?? false,
    loadingEarlier,
    loadEarlier,
    holder: detail?.holder ?? null,
    canSend: detail?.canSend ?? false,
    canTakeOver: detail?.canTakeOver ?? false,
    canRelease: detail?.canRelease ?? false,
    connectionState: connection,
    sending: live?.messages.some((m) => m.status === 'pending') ?? false,
    send,
    retrySend,
    removeFailed,
    takeOver,
    release,
    acting,
  }
}
