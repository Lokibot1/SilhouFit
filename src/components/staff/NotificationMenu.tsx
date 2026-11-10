import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSection } from '../../hooks/useSection'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { fetchStaffNotifications, NOTIFICATIONS_SAMPLE_DATA, type NotificationKind, type StaffNotification } from '../../service/fetchStaffNotifications'
import { formatOrderTime } from '../../utils/format'
import { AlertIcon, BagIcon, BellIcon } from '../form/icons'
import { useToast } from '../toast/useToast'
import { computePlace, LISTBOX_LIST, LISTBOX_PANEL } from '../ui/listbox'
import { Tooltip } from '../ui/Tooltip'
import { SectionBody } from './StaffSection'

const PANEL_WIDTH = 320
// One row's height, shared by the list and its skeleton so the panel does not resize when the data arrives.
const ROW = 'flex h-[4.5rem] items-center gap-3 px-3'
const SKELETON_ROWS = 5

// Same colours as the inventory table's stock badge: sold out is a filled red mark, low stock an amber ring and tint.
const ICON_CHIP: Record<NotificationKind, string> = {
  out: 'bg-(--row-out) text-white',
  low: 'border-2 border-warning bg-warning/15 text-warning',
  order: 'bg-fg/10 text-fg',
}

/** The icon's corner carries the unread dot, so the icons line up with the header's left edge. */
function NotificationIcon({ kind, unread }: { kind: NotificationKind; unread: boolean }) {
  const Icon = kind === 'order' ? BagIcon : AlertIcon
  return (
    <span aria-hidden="true" className="relative shrink-0">
      <span className={`flex size-9 items-center justify-center rounded-full ${ICON_CHIP[kind]}`}>
        <Icon size={20} />
      </span>
      {unread && <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-(--row-out) ring-2 ring-canvas-raised" />}
    </span>
  )
}

function NotificationsSkeleton() {
  return (
    <ul role="status" aria-label="Loading notifications" className="animate-pulse divide-y divide-line">
      {Array.from({ length: SKELETON_ROWS }, (_, n) => (
        <li key={n} className={ROW}>
          <span className="size-9 shrink-0 rounded-full bg-line" />
          <div className="min-w-0 flex-1">
            <div className="h-5 w-4/5 rounded-xl bg-line" />
            <div className="mt-1 h-4 w-1/3 rounded-xl bg-line" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * The bell in the staff top bar: a button with an unread badge that opens a panel of notifications.
 * Marking all as read is kept in this component until the API has an endpoint for it.
 */
export function NotificationMenu() {
  const toast = useToast()
  const section = useSection(fetchStaffNotifications)
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<ReturnType<typeof computePlace>>()
  const [allRead, setAllRead] = useState(false)

  const items = section.state.status === 'success' ? section.state.data : undefined
  const isUnread = (item: StaffNotification) => !allRead && !item.read
  const unread = items?.filter(isUnread).length ?? 0

  function close(refocus: boolean) {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    // Inset by the panel's overhang so its right edge lines up with the bell and it opens toward the left.
    const update = () => {
      const button = buttonRef.current!
      setPlace(computePlace(button, PANEL_WIDTH, PANEL_WIDTH - button.offsetWidth))
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Tab') {
        // Tab walks the panel's buttons; past the last (or before the first) it returns to the bell instead of dropping focus.
        const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
        const at = buttons.indexOf(document.activeElement as HTMLElement)
        if (at >= 0 && at !== (event.shiftKey ? 0 : buttons.length - 1)) return
        event.preventDefault()
        close(true)
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

  // The panel mounts once its place is known, so focus moves in then (to the panel itself while it has no buttons).
  const placed = place !== undefined
  useEffect(() => {
    if (open && placed) (panelRef.current?.querySelector<HTMLElement>('button') ?? panelRef.current)?.focus()
  }, [open, placed])

  function markAllRead() {
    if (unread === 0) return
    setAllRead(true)
    toast.show({ kind: 'success', message: 'All notifications marked as read' })
  }

  return (
    <>
      <Tooltip label="Notifications">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          onClick={() => setOpen((isOpen) => !isOpen)}
          className="relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-fg/10"
        >
          <BellIcon />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="font-ui absolute top-0.5 right-0.5 h-5 min-w-5 rounded-full bg-chrome-strong px-1 text-center text-xs leading-5 font-semibold tabular-nums text-canvas-sub"
            >
              {unread > 9 ? '9+' : unread}
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
              tabIndex={-1}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: DURATION.state, ease: EASE_OUT }}
              style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight }}
              className={`${LISTBOX_PANEL} outline-none`}
            >
              <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-line-strong px-3">
                <p className="text-base font-semibold text-fg">Notifications</p>
                {items && items.length > 0 && (
                  <button
                    type="button"
                    aria-disabled={unread === 0}
                    onClick={markAllRead}
                    className="font-ui -mr-2 min-h-9 cursor-pointer rounded-xl px-2 text-sm font-semibold text-fg hover:bg-fg/10 pointer-coarse:min-h-11 aria-disabled:cursor-default aria-disabled:text-fg-muted aria-disabled:hover:bg-transparent"
                  >
                    Mark all as read
                  </button>
                )}
              </div>
              <div className={LISTBOX_LIST}>
                <SectionBody section={section} what="notifications" skeleton={<NotificationsSkeleton />} errorClassName="px-3 py-3">
                  {(list) =>
                    list.length === 0 ? (
                      <div className="px-3 py-4">
                        <p className="text-base font-semibold text-fg">You&apos;re all caught up</p>
                        <p className="mt-1 text-sm text-fg-muted">Low stock alerts and new orders show here as they happen.</p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-line">
                        {list.map((item) => (
                          <li key={item.id} className={ROW}>
                            <NotificationIcon kind={item.kind} unread={isUnread(item)} />
                            <div className="min-w-0 flex-1">
                              <p className={`line-clamp-2 text-sm leading-5 ${isUnread(item) ? 'font-semibold text-fg' : 'text-fg-muted'}`}>{item.message}</p>
                              <p className="mt-1 text-xs leading-4 text-fg-muted">
                                <time dateTime={item.createdAt} className="tabular-nums">
                                  {formatOrderTime(item.createdAt)}
                                </time>
                                {isUnread(item) && <span className="ml-2 font-semibold text-fg">New</span>}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )
                  }
                </SectionBody>
              </div>
              {NOTIFICATIONS_SAMPLE_DATA && <p className="shrink-0 border-t border-line-strong px-3 py-2 text-xs text-fg-muted">Sample data</p>}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
