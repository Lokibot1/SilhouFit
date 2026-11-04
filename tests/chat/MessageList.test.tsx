import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageList } from '../../src/components/chat/MessageList'
import type { ThreadMessage } from '../../src/hooks/useConversation'
import type { MessageSender } from '../../src/service/chatApi'

const sender = (role: MessageSender['role'], fullName: string): MessageSender => ({ id: `${role}-1`, firstName: '', lastName: '', fullName, role, avatarUrl: null })

const message = (id: string, createdAt: string, extra: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id,
  conversationId: 'c1',
  senderId: 'staff-1',
  content: `content ${id}`,
  createdAt,
  updatedAt: createdAt,
  sender: sender('staff', 'Ana Cruz'),
  ...extra,
})

function setup(messages: ThreadMessage[], props: Partial<Parameters<typeof MessageList>[0]> = {}) {
  const handlers = { onLoadEarlier: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn() }
  render(<MessageList messages={messages} selfId="me" hasMore={false} loadingEarlier={false} {...handlers} {...props} />)
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

  it('lists messages in the order given, oldest first, in a polite live log with a separator for each day', () => {
    setup([message('m1', '2025-11-03T07:45:00Z'), message('m2', '2025-11-03T08:00:00Z'), message('m3', '2025-11-04T08:00:00Z')])
    const log = screen.getByRole('log', { name: 'Messages' })
    expect(log).toHaveAttribute('aria-live', 'polite')
    expect(within(log).getAllByRole('separator')).toHaveLength(2)
    expect(within(log).getByText('Nov 3, 2025')).toBeInTheDocument()
    expect(screen.getAllByTestId('chat-message').map((li) => li.textContent)).toEqual([expect.stringContaining('content m1'), expect.stringContaining('content m2'), expect.stringContaining('content m3')])
  })

  it('shows the empty state, pointing to the composer', () => {
    setup([])
    expect(screen.getByText(/No messages yet\. Write the first message below\./)).toBeInTheDocument()
  })

  it('offers Load earlier messages only when there are more', () => {
    const { onLoadEarlier } = setup([message('m1', '2025-11-03T07:45:00Z')], { hasMore: true })
    screen.getByRole('button', { name: 'Load earlier messages' }).click()
    expect(onLoadEarlier).toHaveBeenCalledOnce()
  })

  it('hides the button when there are no earlier messages', () => {
    setup([message('m1', '2025-11-03T07:45:00Z')])
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument()
  })

  it('shows every sender who is not a customer to a customer as KRAL, without a name or role label', () => {
    setup([message('m1', '2025-11-03T07:45:00Z', { sender: sender('admin', 'Bo Admin') }), message('m2', '2025-11-03T07:46:00Z', { sender: sender('staff', 'Ana Cruz') })])
    expect(screen.getAllByText('KRAL')).toHaveLength(2)
    expect(screen.queryByText('Bo Admin')).not.toBeInTheDocument()
    expect(screen.queryByText('Ana Cruz')).not.toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
    expect(screen.queryByText('Staff')).not.toBeInTheDocument()
  })

  it("shows a customer's own message without a sender name, and another customer's under their own name", () => {
    setup([
      message('m1', '2025-11-03T07:45:00Z', { senderId: 'me', sender: sender('customer', 'Lia Reyes') }),
      message('m2', '2025-11-03T07:46:00Z', { senderId: 'u2', sender: sender('customer', 'Mia Tan') }),
    ])
    const [mine, other] = screen.getAllByTestId('chat-message')
    expect(mine).not.toHaveTextContent('Lia Reyes')
    expect(other).toHaveTextContent('Mia Tan')
    expect(other).not.toHaveTextContent('KRAL')
  })

  it('shows a message with no known sender to a customer as KRAL', () => {
    setup([message('m1', '2025-11-03T07:45:00Z', { sender: undefined })])
    expect(screen.getByText('KRAL')).toBeInTheDocument()
  })

  it('shows real names and role labels to staff, and a failed message offers Retry and Remove', () => {
    const { onRetry, onRemove } = setup([message('m1', '2025-11-03T07:45:00Z', { sender: sender('admin', 'Bo Admin') }), message('m2', '2025-11-03T07:46:00Z', { senderId: 'me', status: 'failed' })], { staff: true })
    expect(screen.getByText('Bo Admin')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Retry' }).click()
    screen.getByRole('button', { name: 'Remove' }).click()
    expect(onRetry).toHaveBeenCalledWith('m2')
    expect(onRemove).toHaveBeenCalledWith('m2')
  })
})
