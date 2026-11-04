import { useState } from 'react'
import type { InboxFilter, useInbox } from '../../hooks/useInbox'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { ROLE_LABEL, type ConversationSummary } from '../../service/chatApi'
import { formatOrderTime } from '../../utils/format'
import { SearchIcon } from '../form/icons'
import { SectionBody } from '../staff/StaffSection'
import { SECONDARY_BUTTON_SM } from '../ui/buttonStyles'
import { Avatar } from '../ui/Avatar'
import { SegmentedTabs } from '../ui/SegmentedTabs'
import { InboxSkeleton } from './ChatSkeleton'

const FILTERS: readonly { value: InboxFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'taken', label: 'Taken over' },
]

const NOTHING: Record<InboxFilter, string> = {
  all: 'No conversations yet. When a customer messages about an order, it shows up here.',
  mine: 'Nothing is assigned to you. Choose All to see every conversation.',
  taken: 'No admin is handling a conversation right now. Choose All to see every conversation.',
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

function Row({ thread, selected, onSelect }: { thread: ConversationSummary; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(thread.id)}
        aria-current={selected ? 'true' : undefined}
        data-testid="inbox-row"
        className={`flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left ${selected ? 'bg-fg/10' : 'hover:bg-fg/5'}`}
      >
        <Avatar name={thread.customer.name} src={thread.customer.avatarUrl} size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-base text-fg ${thread.unreadCount > 0 ? 'font-semibold' : ''}`}>{thread.customer.name || 'Customer'}</span>
            {thread.lastMessageAt && <span className="font-ui shrink-0 text-xs text-fg-muted tabular-nums">{formatOrderTime(thread.lastMessageAt)}</span>}
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-fg-muted">
              {/* TESTING: orderless chat, remove once orders exist */}
              <span className="tabular-nums">{thread.orderNo ?? 'General chat'}</span>
              {thread.lastMessage && ` · ${thread.lastMessage}`}
            </span>
            <UnreadBadge count={thread.unreadCount} />
          </span>
          {thread.holder && (
            <span className="block truncate text-xs text-fg-muted">
              Handled by {thread.holder.name} ({ROLE_LABEL[thread.holder.role]})
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

interface InboxListProps {
  inbox: ReturnType<typeof useInbox>
  filter: InboxFilter
  onFilter: (filter: InboxFilter) => void
  selectedId?: string
  onSelect: (id: string) => void
}

/** Every conversation with a search and the All, Mine and Taken over chips. Search narrows the loaded threads by name, order number or preview. */
export function InboxList({ inbox, filter, onFilter, selectedId, onSelect }: InboxListProps) {
  const [search, setSearch] = useState('')
  const query = useDebouncedValue(search.trim().toLowerCase(), 250)
  const shown = inbox.conversations.filter((thread) => `${thread.customer.name} ${thread.orderNo ?? 'General chat'} ${thread.lastMessage ?? ''}`.toLowerCase().includes(query))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-3 border-b border-line p-3">
        <label className="relative block">
          <span className="sr-only">Search conversations</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or order number"
            className="font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas pr-3 pl-10 text-base text-fg placeholder:text-fg-muted"
          />
        </label>
        {/* The shared tabs are 36px on a desktop pointer; touch targets here stay 44px at every width. */}
        <div className="[&_[role=tab]]:min-h-11">
          <SegmentedTabs label="Filter conversations" name="inbox-filter" options={FILTERS} value={filter} onChange={onFilter} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        <SectionBody section={inbox.section} what="conversations" skeleton={<InboxSkeleton />} errorClassName="p-2">
          {() =>
            shown.length === 0 ? (
              <div className="grid justify-items-start gap-3 p-2">
                <p className="text-base text-fg-muted">{query ? `No conversation matches “${search.trim()}”. Check the spelling, or clear the search.` : NOTHING[filter]}</p>
                {query ? (
                  <button type="button" onClick={() => setSearch('')} className={SECONDARY_BUTTON_SM}>
                    Clear search
                  </button>
                ) : (
                  filter !== 'all' && (
                    <button type="button" onClick={() => onFilter('all')} className={SECONDARY_BUTTON_SM}>
                      Show all
                    </button>
                  )
                )}
              </div>
            ) : (
              <ul aria-label="Conversations" className="grid gap-1">
                {shown.map((thread) => (
                  <Row key={thread.id} thread={thread} selected={thread.id === selectedId} onSelect={onSelect} />
                ))}
              </ul>
            )
          }
        </SectionBody>
      </div>
    </div>
  )
}
