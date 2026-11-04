import { useState } from 'react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useInbox, type InboxFilter } from '../../hooks/useInbox'
import { displayName, type Conversation } from '../../service/chatApi'
import { formatOrderTime } from '../../utils/format'
import { SearchIcon } from '../form/icons'
import { SectionBody } from '../staff/StaffSection'
import { SECONDARY_BUTTON_SM } from '../ui/buttonStyles'
import { Avatar } from '../ui/Avatar'
import { SegmentedTabs } from '../ui/SegmentedTabs'
import { InboxSkeleton } from './ChatSkeleton'

const FILTERS: readonly { value: InboxFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
]

const NOTHING: Record<InboxFilter, string> = {
  all: 'No conversations yet. When a customer messages us, it shows up here.',
  unread: 'Nothing is waiting for a reply. Choose All to see every conversation.',
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

function Row({ thread, selected, onSelect }: { thread: Conversation; selected: boolean; onSelect: (id: string) => void }) {
  const name = (thread.customer && displayName(thread.customer)) || 'Customer'
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(thread.id)}
        aria-current={selected ? 'true' : undefined}
        data-testid="inbox-row"
        className={`flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left ${selected ? 'bg-fg/10' : 'hover:bg-fg/5'}`}
      >
        <Avatar name={name} src={thread.customer?.avatarUrl ?? undefined} size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-base text-fg ${thread.hasUnreadMessages ? 'font-semibold' : ''}`}>{name}</span>
            {thread.lastMessageAt && <span className="font-ui shrink-0 text-xs text-fg-muted tabular-nums">{formatOrderTime(thread.lastMessageAt)}</span>}
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-fg-muted">{thread.lastMessage?.content ?? 'No messages yet'}</span>
            {thread.hasUnreadMessages && <span role="img" aria-label="Unread" className="size-2.5 shrink-0 rounded-full bg-fg" />}
          </span>
        </span>
      </button>
    </li>
  )
}

interface InboxListProps {
  selectedId?: string
  onSelect: (id: string) => void
}

/** Every conversation with a search and the All and Unread chips. The server searches the customer's name and email once typing pauses. */
export function InboxList({ selectedId, onSelect }: InboxListProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<InboxFilter>('all')
  const query = useDebouncedValue(search.trim(), 250)
  const inbox = useInbox(filter, query)

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
            placeholder="Search name or email"
            className="font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas pr-3 pl-10 text-base text-fg placeholder:text-fg-muted"
          />
        </label>
        {/* The shared tabs are 36px on a desktop pointer; touch targets here stay 44px at every width. */}
        <div className="[&_[role=tab]]:min-h-11">
          <SegmentedTabs label="Filter conversations" name="inbox-filter" options={FILTERS} value={filter} onChange={setFilter} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        <SectionBody section={inbox.section} what="conversations" skeleton={<InboxSkeleton />} errorClassName="p-2">
          {() =>
            inbox.conversations.length === 0 ? (
              <div className="grid justify-items-start gap-3 p-2">
                <p className="text-base text-fg-muted">{query ? `No conversation matches “${search.trim()}”. Check the spelling, or clear the search.` : NOTHING[filter]}</p>
                {query ? (
                  <button type="button" onClick={() => setSearch('')} className={SECONDARY_BUTTON_SM}>
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
              <ul aria-label="Conversations" className="grid gap-1">
                {inbox.conversations.map((thread) => (
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
