import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageList } from '../../src/components/chat/MessageList'
import type { ThreadMessage } from '../../src/hooks/useConversation'

const message = (id: string, createdAt: string, extra: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id,
  conversationId: 'c1',
  senderId: 'staff-1',
  senderName: 'Ana Cruz',
  senderRole: 'staff',
  body: `body ${id}`,
  clientId: id,
  createdAt,
  ...extra,
})

function setup(messages: ThreadMessage[], props: Partial<Parameters<typeof MessageList>[0]> = {}) {
  const handlers = { onLoadEarlier: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn() }
  render(<MessageList messages={messages} selfId="me" hasMore={false} loadingEarlier={false} canSend {...handlers} {...props} />)
  return handlers
}

describe('MessageList', () => {
  it('shows times in 12-hour form on Manila time', () => {
    // 07:45 UTC is 3:45 PM in Manila; 16:05 UTC is 12:05 AM the next day.
    setup([message('m1', '2025-11-03T07:45:00Z'), message('m2', '2025-11-03T16:05:00Z')])
    const [first, second] = screen.getAllByText(/\d:\d\d\s?[AP]M/)
    expect(first).toHaveTextContent(/^3:45\s?PM$/)
    expect(second).toHaveTextContent(/^12:05\s?AM$/)
  })

  it('is a polite live log with a separator for each day', () => {
    setup([message('m1', '2025-11-03T07:45:00Z'), message('m2', '2025-11-03T08:00:00Z'), message('m3', '2025-11-04T08:00:00Z')])
    const log = screen.getByRole('log', { name: 'Messages' })
    expect(log).toHaveAttribute('aria-live', 'polite')
    expect(within(log).getAllByRole('separator')).toHaveLength(2)
    expect(within(log).getByText('Nov 3, 2025')).toBeInTheDocument()
  })

  it('shows the empty state, pointing to the composer only when the viewer can write', () => {
    setup([])
    expect(screen.getByText(/No messages yet\. Write the first message below\./)).toBeInTheDocument()
  })

  it('explains an empty thread to a viewer who cannot write', () => {
    setup([], { canSend: false })
    expect(screen.getByText(/No messages yet\. Messages will show here/)).toBeInTheDocument()
  })

  it('offers Load earlier messages only when there are more', () => {
    const { onLoadEarlier } = setup([message('m1', '2025-11-03T07:45:00Z')], { hasMore: true })
    screen.getByRole('button', { name: 'Load earlier messages' }).click()
    expect(onLoadEarlier).toHaveBeenCalledOnce()
  })

  it('shows every non-customer sender to a customer as KRAL, without a name or role label', () => {
    setup([message('m1', '2025-11-03T07:45:00Z', { senderRole: 'admin', senderName: 'Bo Admin' }), message('m2', '2025-11-03T07:46:00Z', { senderRole: 'staff', senderName: 'Ana Cruz' })])
    expect(screen.getAllByText('KRAL')).toHaveLength(2)
    expect(screen.queryByText('Bo Admin')).not.toBeInTheDocument()
    expect(screen.queryByText('Ana Cruz')).not.toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
    expect(screen.queryByText('Staff')).not.toBeInTheDocument()
  })

  it('labels a sender with their role, and a failed message offers Retry and Remove', () => {
    const { onRetry, onRemove } = setup([message('m1', '2025-11-03T07:45:00Z', { senderRole: 'admin', senderName: 'Bo Admin' }), message('m2', '2025-11-03T07:46:00Z', { senderId: 'me', status: 'failed' })], { staff: true })
    expect(screen.getByText('Bo Admin')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Retry' }).click()
    screen.getByRole('button', { name: 'Remove' }).click()
    expect(onRetry).toHaveBeenCalledWith('m2')
    expect(onRemove).toHaveBeenCalledWith('m2')
  })
})
