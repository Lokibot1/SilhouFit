import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { useLivePoll } from '../hooks/useLivePoll'
import { getCachedOrders, loadAllOrders, onOrdersChanged, onOrdersMerged, pollOrders, type CustomerOrder } from '../service/ordersApi'
import { buildNotifications, isUnread, loadSeen, markSeen, onSeenChanged, relativeTime, saveSeen, unreadCount, type Notification, type Seen } from '../utils/notifications'
import { BellIcon } from './form/icons'
import { computePlace } from './ui/listbox'
import { KRAL_ICON_BUTTON, KRAL_ICON_COUNT } from './ui/kralIconButton'
import { Tooltip } from './ui/Tooltip'

const PANEL_WIDTH = 352
const FOCUSABLE = 'a, button:not(:disabled)'
const ROW = 'flex min-h-18 w-full items-start gap-3 px-3 py-3 text-kral-fg transition-colors duration-150 ease-out hover:bg-kral-fg/10 focus-visible:bg-kral-fg/10 motion-reduce:transition-none'
const TEXT_BUTTON = 'kral-focus font-kral-mono flex min-h-11 cursor-pointer items-center justify-center border border-kral-fg px-3 text-base tracking-[0.08em] uppercase text-kral-fg transition-colors duration-150 ease-out hover:bg-kral-fg hover:text-kral-bg disabled:cursor-not-allowed disabled:border-kral-rule disabled:text-kral-muted disabled:hover:bg-transparent disabled:hover:text-kral-muted motion-reduce:transition-none'

/** The customer navbar's bell: order updates built from their own orders, unread until the panel is closed. Mount it with `key={email}` so each account reads its own seen list. */
export function NotificationsBell({ email }: { email?: string }) {
  const panelId = useId()
  const reduced = useReducedMotion()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const controller = useRef<AbortController | null>(null)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<ReturnType<typeof computePlace>>()
  const [orders, setOrders] = useState<CustomerOrder[] | null>(getCachedOrders)
  const [failed, setFailed] = useState(false)
  const [seen, setSeen] = useState<Seen>(() => loadSeen(email))
  const entries = useMemo(() => buildNotifications(orders ?? []), [orders])
  const unread = unreadCount(entries, seen)
  const latest = useRef(entries)
  useEffect(() => {
    latest.current = entries
  })

  const load = useCallback((force: boolean) => {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    loadAllOrders({ signal: abort.signal, force }).then(
      (list) => {
        setOrders(list)
        setFailed(false)
      },
      (failure: unknown) => {
        if (!(failure instanceof DOMException && failure.name === 'AbortError')) setFailed(true)
      },
    )
  }, [])

  // The badge needs the orders before the panel opens; the shared cache means this is usually no request at all.
  useEffect(() => {
    load(false)
    const unsubscribe = onOrdersChanged(() => load(true))
    // A change found by polling lands in the shared cache; the badge and list follow it.
    const unmerge = onOrdersMerged(setOrders)
    return () => {
      unsubscribe()
      unmerge()
      controller.current?.abort()
    }
  }, [load])
  useLivePoll(pollOrders, { enabled: orders !== null })

  // The notifications page saves to the same list; follow it.
  useEffect(() => onSeenChanged(() => setSeen(loadSeen(email))), [email])

  const markAllRead = useCallback(() => {
    const next = markSeen(latest.current)
    setSeen(next)
    saveSeen(email, next)
  }, [email])

  function close(refocus: boolean) {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  // Closing, however it happens, marks what was shown as seen.
  useEffect(() => {
    if (!open) return
    return markAllRead
  }, [open, markAllRead])

  useEffect(() => {
    if (!open) return
    const update = () => {
      const button = buttonRef.current!
      setPlace(computePlace(button, PANEL_WIDTH, Math.min(PANEL_WIDTH, window.innerWidth - 16) - button.offsetWidth))
    }
    function onKeyDown(event: KeyboardEvent) {
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      const at = items.indexOf(document.activeElement as HTMLElement)
      if (event.key === 'Tab' && items.length) {
        // Tab walks the panel and wraps; Escape is the way out.
        if (at >= 0 && at !== (event.shiftKey ? 0 : items.length - 1)) return
        event.preventDefault()
        items[event.shiftKey ? items.length - 1 : 0].focus()
        return
      }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && at >= 0) {
        event.preventDefault()
        items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus()
        return
      }
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close(true)
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false)
    }
    update()
    window.addEventListener('resize', update)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('resize', update)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  // The panel mounts once its place is known, so focus moves in then.
  const placed = place !== undefined
  useEffect(() => {
    if (open && placed) panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
  }, [open, placed])

  function toggle() {
    if (open) return close(false)
    setOpen(true)
    // A look at the server's copy on every open, unless the first read is still on its way.
    if (orders || failed) load(true)
  }

  function retry() {
    setFailed(false)
    load(true)
  }

  const state = orders ? (entries.length ? 'list' : 'empty') : failed ? 'error' : 'loading'
  const top = place?.top
  const maxHeight = top === undefined ? `calc(100dvh - ${place?.bottom ?? 0}px - 0.5rem)` : `min(70dvh, calc(100dvh - ${top}px - 0.5rem))`

  return (
    <>
      <Tooltip label="Notifications">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          onClick={toggle}
          className={KRAL_ICON_BUTTON}
        >
          <BellIcon />
          {unread > 0 && (
            <span aria-hidden="true" className={KRAL_ICON_COUNT}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </Tooltip>
      {createPortal(
        <AnimatePresence>
          {open && place && (
            <motion.div
              ref={panelRef}
              id={panelId}
              role="group"
              aria-label="Notifications"
              initial={{ opacity: 0, y: reduced ? 0 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : -4 }}
              transition={{ duration: DURATION.state, ease: EASE_OUT }}
              style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight }}
              className="fixed z-[85] flex flex-col overflow-hidden border border-kral-rule bg-kral-bg text-kral-fg"
            >
              <div className="flex items-center justify-between gap-3 border-b border-kral-rule px-3 py-2">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">Notifications</h2>
                  <p className="font-kral-mono text-base text-kral-muted tabular-nums md:text-sm">{unread} unread</p>
                </div>
                <button type="button" onClick={markAllRead} disabled={unread === 0} className={TEXT_BUTTON}>
                  Mark all read
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {state === 'loading' && <Skeleton />}
                {state === 'error' && (
                  <div className="flex flex-col items-start gap-3 px-3 py-4">
                    <p className="text-base">We couldn&apos;t load your orders. Check your connection, then try again.</p>
                    <button type="button" onClick={retry} className={TEXT_BUTTON}>
                      Try again
                    </button>
                  </div>
                )}
                {state === 'empty' && (
                  <div className="flex flex-col items-start gap-3 px-3 py-4">
                    <div>
                      <p className="text-base font-semibold">No notifications yet</p>
                      <p className="text-base text-kral-muted">Updates on your orders show up here once you place one.</p>
                    </div>
                    <Link to="/shop" onClick={() => close(false)} className={TEXT_BUTTON}>
                      Continue shopping
                    </Link>
                  </div>
                )}
                {state === 'list' && (
                  <ul>
                    {entries.map((entry) => (
                      <li key={entry.id} className="border-b border-kral-rule last:border-b-0">
                        <Row entry={entry} unread={isUnread(entry, seen)} onDone={() => close(false)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Link
                to="/notifications"
                onClick={() => close(false)}
                className="kral-focus font-kral-mono flex min-h-11 items-center border-t border-kral-rule px-3 text-base tracking-[0.08em] uppercase transition-colors duration-150 ease-out hover:bg-kral-fg hover:text-kral-bg focus-visible:bg-kral-fg focus-visible:text-kral-bg motion-reduce:transition-none"
              >
                View all notifications
              </Link>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

function Row({ entry, unread, onDone }: { entry: Notification; unread: boolean; onDone: () => void }) {
  return (
    <Link to={`/orders/${entry.id}`} onClick={onDone} className={`kral-focus ${ROW}`}>
      {/* A square dot, not colour alone: present only while unread, with the same room kept when read. */}
      <span aria-hidden="true" className={`mt-2 size-2 shrink-0 ${unread ? 'bg-kral-fg' : ''}`} />
      <span className="min-w-0 flex-1">
        {unread && <span className="sr-only">Unread. </span>}
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-kral-mono min-w-0 truncate text-base tabular-nums">{entry.orderNumber}</span>
          <time dateTime={entry.at} className="font-kral-mono shrink-0 text-base text-kral-muted tabular-nums md:text-sm">
            {relativeTime(entry.at)}
          </time>
        </span>
        <span className={`block text-base ${unread ? 'font-semibold' : 'text-kral-muted'}`}>{entry.sentence}</span>
      </span>
    </Link>
  )
}

function Skeleton() {
  return (
    <div role="status" aria-label="Loading notifications" className="animate-pulse motion-reduce:animate-none">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex min-h-18 items-start gap-3 border-b border-kral-rule px-3 py-3 last:border-b-0">
          <span className="mt-2 size-2 shrink-0 bg-kral-fg/10" />
          <span className="min-w-0 flex-1">
            <span className="flex h-6 items-center">
              <span className="h-3 w-3/4 bg-kral-fg/10" />
            </span>
            <span className="flex h-6 items-center">
              <span className="h-3 w-1/2 bg-kral-fg/10" />
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}
