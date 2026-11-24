import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/toast/useToast'
import { ProductListError } from '../service/fetchProductList'
import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead, onNotificationsChanged, type ServerNotification } from '../service/notificationsApi'
import { notificationTone } from '../utils/notifications'
import { playNotification } from '../utils/sound'
import { useLivePoll } from './useLivePoll'

interface Page {
  items: ServerNotification[]
  total: number
  hasNextPage: boolean
  page: number
}

const EMPTY: Page = { items: [], total: 0, hasNextPage: false, page: 1 }
const isAbort = (failure: unknown) => failure instanceof DOMException && failure.name === 'AbortError'

/**
 * The signed-in shopper's notifications from the server. The unread count is polled alone; the list is read only while `list` is on
 * (the page, or the bell while open) and again whenever the count changes. Marking read is optimistic and rolls back on failure.
 */
export function useNotifications({ enabled = true, list = true, announce }: { enabled?: boolean; list?: boolean; announce?: (n: ServerNotification) => string | null } = {}) {
  const toast = useToast()
  const navigate = useNavigate()
  const [count, setCount] = useState<number | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [shown, setShown] = useState<Page>(EMPTY)
  const [allTotal, setAllTotal] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<ProductListError | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const controller = useRef<AbortController | null>(null)
  // What the stable callbacks below read, so a listener bound when the panel opened still sees the current list.
  const live = useRef({ count, shown, unreadOnly, list, announce, navigate })
  useEffect(() => {
    live.current = { count, shown, unreadOnly, list, announce, navigate }
  })

  const load = useCallback((page: number, only: boolean) => {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    return fetchNotifications({ page, unreadOnly: only }, { signal: abort.signal }).then(
      (next) => {
        setShown((prev) => ({ ...next, page, items: page > 1 ? [...prev.items, ...next.items.filter((n) => !prev.items.some((p) => p.id === n.id))] : next.items }))
        if (!only) setAllTotal(next.total)
        setError(null)
        setStatus('ready')
      },
      (failure: unknown) => {
        if (isAbort(failure)) return
        setError(failure instanceof ProductListError ? failure : new ProductListError('server'))
        setStatus('error')
      },
    )
  }, [])

  /** Reads the count, and the first page again when the count moved (a new notification, or one read elsewhere). */
  const readCount = useCallback(
    async (signal?: AbortSignal) => {
      const next = await fetchUnreadCount({ signal })
      const { count: known, unreadOnly: only, list: listing, announce: announcer, navigate: go } = live.current
      live.current.count = next
      setCount(next)
      if (listing && known !== null && known !== next) void load(1, only)
      if (announcer && !listing && known !== null && next > known) {
        // The newest unread one is the story; the rest are only counted.
        const latest = await fetchNotifications({ page: 1, unreadOnly: true }, { signal }).then((page) => page.items[0], () => undefined)
        if (!latest) return
        const extra = next - known - 1
        const href = announcer(latest)
        toast.show({
          kind: 'info',
          tone: notificationTone(latest.type),
          title: latest.title,
          message: `${latest.body ?? ''}${extra > 0 ? `${latest.body ? ' ' : ''}and ${extra} more` : ''}`,
          action: href ? { label: 'View', onClick: () => go(href) } : undefined,
        })
        playNotification()
      }
    },
    [load, toast],
  )

  useEffect(() => {
    if (!enabled) return
    readCount().catch(() => {})
    return onNotificationsChanged(() => {
      readCount().catch(() => {})
      if (live.current.list) void load(1, live.current.unreadOnly)
    })
  }, [enabled, readCount, load])
  useLivePoll(readCount, { enabled })

  useEffect(() => {
    if (!enabled || !list) return
    void load(1, unreadOnly)
    return () => controller.current?.abort()
  }, [enabled, list, unreadOnly, load])

  const markRead = useCallback(
    async (id: string) => {
      const before = { ...live.current }
      if (!before.shown.items.some((n) => n.id === id && !n.readAt)) return
      const readAt = new Date().toISOString()
      setCount((n) => (n === null ? n : Math.max(0, n - 1)))
      setShown((prev) => ({ ...prev, items: prev.items.map((n) => (n.id === id ? { ...n, readAt } : n)) }))
      try {
        await markNotificationRead(id)
      } catch {
        setCount(before.count)
        setShown(before.shown)
        toast.show({ kind: 'error', message: "We couldn't mark that notification as read. Check your connection, then open it again." })
      }
    },
    [toast],
  )

  /** Resolves true when the server accepted it (or there was nothing to mark). */
  const markAllRead = useCallback(async () => {
    const before = { ...live.current }
    if (!before.count) return true
    const readAt = new Date().toISOString()
    live.current.count = 0
    setCount(0)
    // An unread-only list has nothing left to show once everything is read.
    setShown((prev) => (before.unreadOnly ? EMPTY : { ...prev, items: prev.items.map((n) => (n.readAt ? n : { ...n, readAt })) }))
    try {
      await markAllNotificationsRead()
      return true
    } catch {
      live.current.count = before.count
      setCount(before.count)
      setShown(before.shown)
      toast.show({ kind: 'error', message: "We couldn't mark your notifications as read. Check your connection, then try again." })
      return false
    }
  }, [toast])

  const loadMore = useCallback(() => {
    setLoadingMore(true)
    void load(live.current.shown.page + 1, live.current.unreadOnly).finally(() => setLoadingMore(false))
  }, [load])

  /** Reads the count and the first page again without the skeleton. */
  const refresh = useCallback(() => Promise.all([readCount().catch(() => {}), load(1, live.current.unreadOnly)]), [readCount, load])

  const retry = useCallback(() => {
    setStatus('loading')
    void load(1, live.current.unreadOnly)
  }, [load])

  return { count, items: shown.items, total: shown.total, allTotal, hasNextPage: shown.hasNextPage, status, error, loadingMore, unreadOnly, setUnreadOnly, markRead, markAllRead, loadMore, refresh, retry }
}
