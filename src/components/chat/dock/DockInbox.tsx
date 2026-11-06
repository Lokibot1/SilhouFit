import { motion } from 'motion/react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import { useInbox } from '../../../hooks/useInbox'
import { useSelfId } from '../../../hooks/useSelfId'
import { DURATION, EASE_OUT } from '../../../motion/tokens'
import { displayName } from '../../../service/chatApi'
import { openChat } from '../../../service/chatDock'
import { SearchIcon, XIcon } from '../../form/icons'
import { SectionBody } from '../../staff/StaffSection'
import { computePlace, LISTBOX_PANEL } from '../../ui/listbox'
import { InboxSkeleton } from '../ChatSkeleton'
import { Tooltip } from '../../ui/Tooltip'
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
  const [search, setSearch] = useState('')
  const query = useDebouncedValue(search.trim().toLowerCase(), 200)
  const selfId = useSelfId()
  const searchField = useRef<HTMLInputElement>(null)
  const rows = inbox.conversations
    .filter((thread) => tab === 'all' || thread.hasUnreadMessages === (tab === 'unread'))
    .filter((thread) => {
      if (!query) return true
      const who = thread.customer ? `${displayName(thread.customer)} ${thread.customer.email}` : 'Customer'
      return `${who} ${thread.lastMessage?.content ?? ''}`.toLowerCase().includes(query)
    })
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

  // Keyboard users land in the panel (Tab reaches Close, then the search); a phone's keyboard does not pop up.
  const placed = !!place
  useEffect(() => {
    if (placed) panel.current?.focus()
  }, [placed])

  /** Arrow Down and Up walk from the search through the rows; Up from the first row returns to the search. */
  function onArrows(event: ReactKeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = [searchField.current!, ...panel.current!.querySelectorAll<HTMLElement>('[data-testid="inbox-row"]')]
    const next = items.indexOf(document.activeElement as HTMLElement) + (event.key === 'ArrowDown' ? 1 : -1)
    if (next < 0 || next >= items.length || !items.includes(document.activeElement as HTMLElement)) return
    event.preventDefault()
    items[next].focus()
  }

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
      tabIndex={-1}
      onKeyDown={onArrows}
      className={`${LISTBOX_PANEL} outline-none`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 pt-1 pr-1 pl-4">
        <h2 className="display text-lg text-fg">Messages</h2>
        <Tooltip label="Close">
          <button type="button" onClick={() => onClose(true)} aria-label="Close conversations" className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-fg/10">
            <XIcon />
          </button>
        </Tooltip>
      </div>
      <div className="shrink-0 px-2 pb-2">
        <label className="relative block">
          <span className="sr-only">Search conversations</span>
          <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          {/* 16px on a phone so iOS does not zoom in on focus. */}
          <input
            ref={searchField}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations"
            className="font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas pr-3 pl-9 text-base text-fg placeholder:text-fg-muted sm:text-sm"
          />
        </label>
      </div>
      {/* Compact tabs: 28px on a desktop pointer, 44px on touch and small screens. */}
      <div className="shrink-0 border-b border-line px-2 pb-2">
        <SegmentedTabs compact label="Filter conversations" name="dock-inbox-filter" options={TABS} value={tab} onChange={setTab} />
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-2">
        <SectionBody section={inbox.section} what="conversations" skeleton={<InboxSkeleton />} errorClassName="p-2">
          {() =>
            rows.length === 0 ? (
              query ? (
                <div className="grid justify-items-start gap-3 p-2">
                  <p className="text-sm text-fg-muted">No conversations match “{search.trim()}”. Check the spelling, or clear the search.</p>
                  <button type="button" onClick={() => setSearch('')} className={SECONDARY_BUTTON_SM}>
                    Clear search
                  </button>
                </div>
              ) : tab === 'all' ? (
                <p className="p-2 text-sm text-fg-muted">No conversations yet. When a customer messages us, it shows up here.</p>
              ) : (
                <div className="grid justify-items-start gap-3 p-2">
                  <p className="text-sm text-fg-muted">{NOTHING[tab]}</p>
                  <button type="button" onClick={() => setTab('all')} className={SECONDARY_BUTTON_SM}>
                    Show all
                  </button>
                </div>
              )
            ) : (
              <ul aria-label="Conversations" className="grid grid-cols-[minmax(0,1fr)] gap-1">
                {rows.map((thread) => (
                  <Row
                    key={thread.id}
                    thread={thread}
                    selected={false}
                    selfId={selfId}
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
