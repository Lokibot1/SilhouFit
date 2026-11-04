import { motion } from 'motion/react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useInbox } from '../../../hooks/useInbox'
import { DURATION, EASE_OUT } from '../../../motion/tokens'
import { displayName } from '../../../service/chatApi'
import { openChat } from '../../../service/chatDock'
import { SectionBody } from '../../staff/StaffSection'
import { computePlace, LISTBOX_PANEL } from '../../ui/listbox'
import { InboxSkeleton } from '../ChatSkeleton'
import { Row } from '../InboxList'
import { SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { SegmentedTabs } from '../../ui/SegmentedTabs'

const PANEL_WIDTH = 352

type Tab = 'all' | 'unread' | 'read'

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
]

const NOTHING: Record<Exclude<Tab, 'all'>, string> = {
  unread: 'No unread conversations. Everything has been read. Choose All to see every conversation.',
  read: 'No read conversations. Open an unread conversation and it moves here. Choose All to see every conversation.',
}

interface DockInboxProps {
  area: string
  /** The button that opened it: clicks on it are not "outside", and Escape returns focus to it. */
  anchor: RefObject<HTMLButtonElement | null>
  onClose: (refocus: boolean) => void
}

/** The staff conversation list as a popover under the Messages button. Choosing a row opens that chat in the dock. */
export function DockInbox({ area, anchor, onClose }: DockInboxProps) {
  const inbox = useInbox('all', '')
  const [tab, setTab] = useState<Tab>('all')
  const rows = tab === 'all' ? inbox.conversations : inbox.conversations.filter((thread) => thread.hasUnreadMessages === (tab === 'unread'))
  const panel = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<ReturnType<typeof computePlace>>()

  useEffect(() => {
    const update = () => {
      const button = anchor.current!
      setPlace(computePlace(button, PANEL_WIDTH, PANEL_WIDTH - button.offsetWidth))
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose(true)
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) onClose(false)
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
  }, [anchor, onClose])

  if (!place) return null
  return createPortal(
    <motion.div
      ref={panel}
      role="dialog"
      aria-label="Conversations"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.state, ease: EASE_OUT }}
      style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight }}
      className={LISTBOX_PANEL}
    >
      {/* The shared tabs are 36px on a desktop pointer; touch targets here stay 44px at every width. */}
      <div className="shrink-0 border-b border-line p-2 [&_[role=tab]]:min-h-11">
        <SegmentedTabs label="Filter conversations" name="dock-inbox-filter" options={TABS} value={tab} onChange={setTab} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        <SectionBody section={inbox.section} what="conversations" skeleton={<InboxSkeleton />} errorClassName="p-2">
          {() =>
            rows.length === 0 ? (
              tab === 'all' ? (
                <p className="p-2 text-base text-fg-muted">No conversations yet. When a customer messages us, it shows up here.</p>
              ) : (
                <div className="grid justify-items-start gap-3 p-2">
                  <p className="text-base text-fg-muted">{NOTHING[tab]}</p>
                  <button type="button" onClick={() => setTab('all')} className={SECONDARY_BUTTON_SM}>
                    Show all
                  </button>
                </div>
              )
            ) : (
              <ul aria-label="Conversations" className="grid gap-1">
                {rows.map((thread) => (
                  <Row
                    key={thread.id}
                    thread={thread}
                    selected={false}
                    onSelect={() => {
                      openChat(thread.id, { name: (thread.customer && displayName(thread.customer)) || 'Customer', avatarUrl: thread.customer?.avatarUrl ?? undefined })
                      onClose(false)
                    }}
                  />
                ))}
              </ul>
            )
          }
        </SectionBody>
      </div>
      <Link to={`/${area}/messages`} onClick={() => onClose(false)} className="font-ui flex min-h-11 shrink-0 items-center justify-center border-t border-line px-3 text-sm font-semibold text-fg hover:bg-fg/5 hover:text-chrome-strong">
        Open full Messages page
      </Link>
    </motion.div>,
    document.body,
  )
}
