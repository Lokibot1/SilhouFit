import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DockInbox } from '../../src/components/chat/dock/DockInbox'
import { Row } from '../../src/components/chat/InboxList'
import type { Conversation } from '../../src/service/chatApi'
import { formatShortAgo } from '../../src/utils/format'

const inbox = vi.hoisted(() => ({ value: {} as unknown }))
vi.mock('../../src/hooks/useInbox', () => ({ useInbox: () => inbox.value }))
vi.mock('../../src/hooks/useSelfId', () => ({ useSelfId: () => 'staff-1' }))

const LONG = 'asdadasdasdasasdadasdasdasasdadasdasdasasdadasdasdasasdadasdasdas'
const thread = (id: string, name: string, content: string | null, extra: Partial<Conversation> = {}, senderId = 'user-1'): Conversation => ({
  id,
  customerId: 'user-1',
  customer: { id: 'user-1', email: `${name.split(' ')[0].toLowerCase()}@example.com`, firstName: name.split(' ')[0], lastName: name.split(' ')[1] ?? '', fullName: name, avatarUrl: null },
  lastMessageAt: content ? new Date().toISOString() : null,
  customerReadAt: null,
  staffReadAt: null,
  hasUnreadMessages: false,
  lastMessage: content ? { id: `m-${id}`, conversationId: id, senderId, content, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : null,
  createdAt: '2026-11-03T01:00:00Z',
  updatedAt: '2026-11-03T01:00:00Z',
  ...extra,
})

const show = (state: unknown, conversations: Conversation[] = []) => {
  const retry = vi.fn()
  inbox.value = { section: { state, retry }, conversations }
  const onClose = vi.fn()
  const anchor = { current: document.body.appendChild(document.createElement('button')) }
  render(
    <MemoryRouter>
      <DockInbox area="staff" anchor={anchor} onClose={onClose} />
    </MemoryRouter>,
  )
  return { onClose, retry }
}
const loaded = (conversations: Conversation[]) => show({ status: 'success', data: conversations }, conversations)

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe('formatShortAgo', () => {
  const now = new Date('2026-11-06T04:00:00Z')
  it('is short: now, minutes, hours, then the date', () => {
    expect(formatShortAgo('2026-11-06T03:59:50Z', now)).toBe('now')
    expect(formatShortAgo('2026-11-06T03:59:00Z', now)).toBe('1m')
    expect(formatShortAgo('2026-11-06T02:00:00Z', now)).toBe('2h')
    expect(formatShortAgo('2026-11-04T04:00:00Z', now)).toBe('Nov 4')
  })
})

describe('Row', () => {
  const row = (t: Conversation, selfId?: string) => (
    <ul>
      <Row thread={t} selfId={selfId} selected={false} onSelect={vi.fn()} />
    </ul>
  )

  it('truncates a long unbroken preview on one line and clips nothing sideways', () => {
    render(row(thread('c1', 'Demo Shopper', LONG)))
    const preview = screen.getByText(LONG)
    expect(preview).toHaveClass('truncate')
    expect(preview.parentElement).toHaveClass('min-w-0')
    expect(screen.getByTestId('inbox-row')).toHaveClass('min-w-0', 'overflow-hidden')
  })

  it('bolds the name and shows an unread dot only when unread', () => {
    const { rerender } = render(row(thread('c1', 'Demo Shopper', 'Hello', { hasUnreadMessages: true })))
    expect(screen.getByText('Demo Shopper')).toHaveClass('font-semibold')
    expect(screen.getByRole('img', { name: 'Unread' })).toBeInTheDocument()
    rerender(row(thread('c1', 'Demo Shopper', 'Hello')))
    expect(screen.getByText('Demo Shopper')).not.toHaveClass('font-semibold')
    expect(screen.queryByRole('img', { name: 'Unread' })).toBeNull()
  })

  it('prefixes You: for the signed-in user, adds the short time, and says No messages yet when empty', () => {
    const { rerender } = render(row(thread('c1', 'Demo Shopper', 'Sure', {}, 'staff-1'), 'staff-1'))
    expect(screen.getByText('You: Sure')).toBeInTheDocument()
    expect(screen.getByText(/· now/)).toBeInTheDocument()
    rerender(row(thread('c1', 'Demo Shopper', 'Sure'), 'staff-1'))
    expect(screen.queryByText(/You:/)).toBeNull()
    rerender(row(thread('c1', 'Demo Shopper', null)))
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
  })
})

describe('DockInbox', () => {
  it('shows a skeleton while loading', () => {
    show({ status: 'loading' })
    expect(screen.getByRole('status', { name: 'Loading conversations' })).toBeInTheDocument()
  })

  it('explains a failure and retries', () => {
    const { retry } = show({ status: 'error', kind: 'network' })
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }))
    expect(retry).toHaveBeenCalled()
  })

  it('has a titled panel with a labelled search, a Close button and the full-page link', () => {
    loaded([thread('c1', 'Demo Shopper', 'Hello')])
    const panel = screen.getByRole('dialog', { name: 'Conversations' })
    expect(within(panel).getByRole('heading', { name: 'Messages' })).toBeInTheDocument()
    expect(within(panel).getByRole('searchbox', { name: 'Search conversations' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Close conversations' })).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Open full Messages page' })).toHaveAttribute('href', '/staff/messages')
    expect(panel).toHaveFocus()
  })

  it('filters by the Unread and Read chips', () => {
    loaded([thread('c1', 'Ana One', 'a', { hasUnreadMessages: true }), thread('c2', 'Ben Two', 'b')])
    expect(screen.getAllByTestId('inbox-row')).toHaveLength(2)
    fireEvent.click(screen.getByRole('tab', { name: 'Unread' }))
    expect(screen.getAllByTestId('inbox-row')).toHaveLength(1)
    expect(screen.getByText('Ana One')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Read' }))
    expect(screen.getByText('Ben Two')).toBeInTheDocument()
    expect(screen.queryByText('Ana One')).toBeNull()
  })

  it('searches the loaded conversations after typing pauses, and clears from the empty state', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    loaded([thread('c1', 'Ana One', 'a'), thread('c2', 'Ben Two', LONG)])
    await user.type(screen.getByRole('searchbox', { name: 'Search conversations' }), 'ben')
    expect(screen.getAllByTestId('inbox-row')).toHaveLength(2)
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(screen.getAllByTestId('inbox-row')).toHaveLength(1)
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'zzz')
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(screen.getByText(/No conversations match/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(screen.getAllByTestId('inbox-row')).toHaveLength(2)
  })

  it('shows the empty state when there are no conversations', () => {
    loaded([])
    expect(screen.getByText(/No conversations yet/)).toBeInTheDocument()
  })

  it('Arrow keys walk from the search through the rows and back; Escape closes and returns focus', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onClose } = loaded([thread('c1', 'Ana One', 'a'), thread('c2', 'Ben Two', 'b')])
    screen.getByRole('searchbox').focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByTestId('inbox-row')[0]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByTestId('inbox-row')[1]).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(screen.getByRole('searchbox')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledWith(true)
  })
})
