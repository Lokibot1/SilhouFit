import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { useNotifications } from '../hooks/useNotifications'
import { notificationHref, type ServerNotification } from '../service/notificationsApi'
import { failureCopy, relativeTime } from '../utils/notifications'
import { BellIcon } from './form/icons'
import { RetryButton } from './notifications/RetryButton'
import { computePlace } from './ui/listbox'
import { KRAL_ICON_BUTTON, KRAL_ICON_COUNT } from './ui/kralIconButton'
import { Tooltip } from './ui/Tooltip'

const PANEL_WIDTH = 352
/** Below the md breakpoint the panel is narrower and shorter, so it covers less of a small screen. */
const PANEL_WIDTH_SMALL = 288
const panelWidth = () => (window.innerWidth < 768 ? PANEL_WIDTH_SMALL : PANEL_WIDTH)
const FOCUSABLE = 'a, button:not(:disabled)'
const ROW = 'flex min-h-18 w-full items-start gap-3 px-3 py-3 text-kral-fg transition-colors duration-150 ease-out hover:bg-kral-fg/10 focus-visible:bg-kral-fg/10 motion-reduce:transition-none'
const TEXT_BUTTON = 'kral-focus font-kral-mono relative flex min-h-9 cursor-pointer after:absolute after:-inset-y-1 after:inset-x-0 after:content-[""] items-center justify-center border border-kral-fg px-3 text-xs tracking-[0.08em] uppercase text-kral-fg transition-colors duration-150 ease-out hover:bg-kral-fg hover:text-kral-bg disabled:cursor-not-allowed disabled:border-kral-rule disabled:text-kral-muted disabled:hover:bg-transparent disabled:hover:text-kral-muted motion-reduce:transition-none'

/** The customer navbar's bell: the server's notifications, unread until the panel is closed. Mount it with `key={email}` so each account starts from its own state. */
export function NotificationsBell() {
  const panelId = useId()
  const reduced = useReducedMotion()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<ReturnType<typeof computePlace>>()
  // The badge only needs the count; the list is read while the panel is open.
  const { count, items, status, error, retry, markAllRead } = useNotifications({ list: open, announce: notificationHref })
  const unread = count ?? 0

  // Closing, however it happens, marks what was shown as read.
  function close(refocus: boolean) {
    setOpen(false)
    void markAllRead()
    if (refocus) buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const update = () => {
      const button = buttonRef.current!
      const width = panelWidth()
      setPlace(computePlace(button, width, Math.min(width, window.innerWidth - 16) - button.offsetWidth))
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
  }

  const state = status === 'error' && items.length === 0 ? 'error' : status === 'loading' ? 'loading' : items.length ? 'list' : 'empty'
  const top = place?.top
  const maxHeight = top === undefined ? `calc(100dvh - ${place?.bottom ?? 0}px - 0.5rem)` : `min(${window.innerWidth < 768 ? 55 : 70}dvh, calc(100dvh - ${top}px - 0.5rem))`

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
          className={`${KRAL_ICON_BUTTON} min-w-11 shrink-0`}
        >
          <BellIcon />
          {count !== null && unread > 0 && (
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
                  <h2 className="text-sm font-semibold">Notifications</h2>
                  <p className="font-kral-mono text-xs text-kral-muted tabular-nums">{unread} unread</p>
                </div>
                <button type="button" onClick={() => void markAllRead()} disabled={unread === 0} className={TEXT_BUTTON}>
                  Mark all read
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {state === 'loading' && <Skeleton />}
                {state === 'error' && (
                  <div className="flex flex-col items-start gap-3 px-3 py-4">
                    <p className="text-sm">{failureCopy(error)}</p>
                    <RetryButton error={error} onRetry={retry} className={TEXT_BUTTON} />
                  </div>
                )}
                {state === 'empty' && (
                  <div className="flex flex-col items-start gap-3 px-3 py-4">
                    <div>
                      <p className="text-sm font-semibold">No notifications yet</p>
                      <p className="text-sm text-kral-muted">Order, payment and delivery updates show here.</p>
                    </div>
                    <Link to="/shop" onClick={() => close(false)} className={TEXT_BUTTON}>
                      Continue shopping
                    </Link>
                  </div>
                )}
                {state === 'list' && (
                  <ul>
                    {items.map((entry) => (
                      <li key={entry.id} className="border-b border-kral-rule last:border-b-0">
                        <Row entry={entry} onDone={() => close(false)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Link
                to="/notifications"
                onClick={() => close(false)}
                className="kral-focus font-kral-mono flex min-h-11 items-center border-t border-kral-rule px-3 text-xs tracking-[0.08em] uppercase transition-colors duration-150 ease-out hover:bg-kral-fg hover:text-kral-bg focus-visible:bg-kral-fg focus-visible:text-kral-bg motion-reduce:transition-none"
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

function Row({ entry, onDone }: { entry: ServerNotification; onDone: () => void }) {
  const unread = !entry.readAt
  const href = notificationHref(entry)
  const content = (
    <>
      {/* A square dot, not colour alone: present only while unread, with the same room kept when read. */}
      <span aria-hidden="true" className={`mt-2 size-2 shrink-0 ${unread ? 'bg-kral-fg' : ''}`} />
      <span className="min-w-0 flex-1">
        {unread && <span className="sr-only">Unread. </span>}
        <span className="flex items-baseline justify-between gap-3">
          <span className={`min-w-0 text-sm ${unread ? 'font-semibold' : 'text-kral-muted'}`}>{entry.title}</span>
          <time dateTime={entry.createdAt} className="font-kral-mono shrink-0 text-xs text-kral-muted tabular-nums">
            {relativeTime(entry.createdAt)}
          </time>
        </span>
        {entry.body && <span className="block text-sm break-words text-kral-muted">{entry.body}</span>}
      </span>
    </>
  )
  // A notification that names no order or chat has nowhere to go: a plain row, closed with the panel.
  return href ? (
    <Link to={href} onClick={onDone} className={`kral-focus ${ROW}`}>
      {content}
    </Link>
  ) : (
    <div className={ROW}>{content}</div>
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
