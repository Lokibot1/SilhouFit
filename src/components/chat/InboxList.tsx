import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useChatUnread } from '../../hooks/useChatUnread'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useInbox, type InboxFilter } from '../../hooks/useInbox'
import { useSelfId } from '../../hooks/useSelfId'
import { displayName, previewText, type Conversation } from '../../service/chatApi'
import { formatShortAgo, manilaDay } from '../../utils/format'
import { CheckIcon, SearchIcon } from '../form/icons'
import { SectionBody } from '../staff/StaffSection'
import { SECONDARY_BUTTON_SM } from '../ui/buttonStyles'
import { Avatar } from '../ui/Avatar'
import { InboxSkeleton } from './ChatSkeleton'

const FILTERS: readonly { value: InboxFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
]

const NOTHING: Record<InboxFilter, string> = {
  all: 'No conversations yet. When a customer messages us, it shows up here.',
  unread: 'You’re all caught up. Choose All to see every conversation.',
}

/** "21h" today, "Yesterday", then "Nov 23". */
function rowTime(iso: string) {
  const short = formatShortAgo(iso)
  if (short === 'now' || /\d[mh]$/.test(short)) return short
  return manilaDay(iso) === manilaDay(new Date(Date.now() - 86_400_000).toISOString()) ? 'Yesterday' : short
}

/** The unread count as a pill that does not rely on its colour. */
export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      aria-label={`${count} unread`}
      className="font-ui flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-fg px-1.5 text-xs font-semibold text-canvas tabular-nums"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function Row({ thread, selected, selfId, onSelect }: { thread: Conversation; selected: boolean; selfId?: string; onSelect: (id: string) => void }) {
  const name = (thread.customer && displayName(thread.customer)) || 'Customer'
  const unread = thread.hasUnreadMessages
  const mine = !!selfId && thread.lastMessage?.senderId === selfId
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onSelect(thread.id)}
        aria-current={selected ? 'true' : undefined}
        data-testid="inbox-row"
        className={`relative flex min-h-16 w-full min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-xl px-3 py-2 text-left transition-colors duration-150 ${selected ? 'bg-kral-red/10' : 'hover:bg-fg/5'}`}
      >
        {selected && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-kral-red" />}
        <Avatar name={name} src={thread.customer?.avatarUrl ?? undefined} size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate text-sm text-fg ${unread ? 'font-semibold' : 'font-medium'}`}>{name}</span>
            {thread.lastMessageAt && (
              <time dateTime={thread.lastMessageAt} className={`font-ui shrink-0 text-xs tabular-nums ${unread ? 'font-semibold text-kral-red-ink' : 'text-fg-muted'}`}>
                {rowTime(thread.lastMessageAt)}
              </time>
            )}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className={`min-w-0 flex-1 truncate text-xs ${unread ? 'font-medium text-fg' : 'text-fg-muted'}`}>
              {mine && 'You: '}
              {thread.lastMessage ? previewText(thread.lastMessage) : 'No messages yet'}
            </span>
            {unread && <span role="img" aria-label="Unread" className="size-2.5 shrink-0 rounded-full bg-kral-red" />}
          </span>
        </span>
      </button>
    </li>
  )
}

interface InboxListProps {
  selectedId?: string
  onSelect: (id: string) => void
  /** Esc in the list closes the open conversation. */
  onClear?: () => void
}

/** Every conversation with a search and the All and Unread tabs. The server searches the customer's name and email once typing pauses. */
export function InboxList({ selectedId, onSelect, onClear }: InboxListProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<InboxFilter>('all')
  const query = useDebouncedValue(search.trim(), 250)
  const inbox = useInbox(filter, query)
  const selfId = useSelfId()
  const unreadTotal = useChatUnread()
  const searchInput = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  // "/" jumps to the search, unless the user is already typing somewhere.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || target.closest('input, textarea, select, [contenteditable]')) return
      event.preventDefault()
      searchInput.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function onListKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClear?.()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const rows = Array.from(list.current?.querySelectorAll<HTMLElement>('[data-testid="inbox-row"]') ?? [])
    const at = rows.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'ArrowDown' ? Math.min(at + 1, rows.length - 1) : Math.max(at - 1, 0)
    if (rows[next]) {
      event.preventDefault()
      rows[next].focus()
    }
  }

  function onTabKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next = FILTERS[(FILTERS.findIndex((f) => f.value === filter) + 1) % FILTERS.length].value
    setFilter(next)
    document.getElementById(`inbox-filter-tab-${next}`)?.focus()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-2 border-b border-line px-3 pt-3">
        <h2 className="text-lg font-semibold text-fg">Messages</h2>
        <label className="relative block">
          <span className="sr-only">Search conversations</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          <input
            ref={searchInput}
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or email"
            className="font-ui min-h-9 w-full rounded-lg border border-line bg-canvas pr-10 pl-10 text-sm text-fg placeholder:text-fg-muted max-md:min-h-11 max-md:text-base pointer-coarse:min-h-11"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-lg leading-none text-fg-muted hover:text-fg">
              <span aria-hidden="true">×</span>
            </button>
          ) : (
            <kbd aria-hidden="true" className="font-ui pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-xs text-fg-muted md:block">
              /
            </kbd>
          )}
        </label>
        <div role="tablist" aria-label="Filter conversations" onKeyDown={onTabKeyDown} className="font-ui -mb-px flex gap-1">
          {FILTERS.map((option) => {
            const active = option.value === filter
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                id={`inbox-filter-tab-${option.value}`}
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setFilter(option.value)}
                className={`inline-flex h-8 cursor-pointer items-center gap-1.5 border-b-2 px-3 text-[13px] transition-colors duration-150 max-md:h-11 pointer-coarse:h-11 ${active ? 'border-kral-red font-medium text-fg' : 'border-transparent text-fg-muted hover:text-fg'}`}
              >
                {option.label}
                {option.value === 'unread' && unreadTotal > 0 && (
                  <span aria-label={`${unreadTotal} unread`} className="rounded-full bg-kral-red/10 px-1.5 text-xs font-semibold text-kral-red-ink tabular-nums">
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div ref={list} onKeyDown={onListKeyDown} className="thin-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-2">
        <SectionBody section={inbox.section} what="conversations" skeleton={<InboxSkeleton />} errorClassName="p-2">
          {() =>
            inbox.conversations.length === 0 ? (
              <div className="grid justify-items-center gap-3 p-6 text-center">
                {!query && filter === 'unread' && <CheckIcon size={20} className="text-success" />}
                <p className="text-sm text-fg-muted">{query ? `No conversations match “${search.trim()}”.` : NOTHING[filter]}</p>
                {query ? (
                  <button type="button" onClick={() => setSearch('')} className="cursor-pointer text-sm font-medium text-kral-red-ink underline underline-offset-4">
                    Clear search
                  </button>
                ) : (
                  filter !== 'all' && (
                    <button type="button" onClick={() => setFilter('all')} className={SECONDARY_BUTTON_SM}>
                      Show all
                    </button>
                  )
                )}
              </div>
            ) : (
              <ul aria-label="Conversations" className="grid grid-cols-[minmax(0,1fr)] gap-1">
                {inbox.conversations.map((thread) => (
                  <Row key={thread.id} thread={thread} selected={thread.id === selectedId} selfId={selfId} onSelect={onSelect} />
                ))}
              </ul>
            )
          }
        </SectionBody>
      </div>
    </div>
  )
}
