import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageBubble } from '../../src/components/chat/MessageBubble'
import type { ThreadMessage } from '../../src/hooks/useConversation'
import { sendFailureCopy, type ChatErrorKind } from '../../src/service/chatApi'

const failed = (failure?: ChatErrorKind): ThreadMessage => ({
  id: 'pending-1',
  conversationId: 'c1',
  senderId: 'me',
  content: 'Hello',
  createdAt: '2025-11-04T01:00:00Z',
  updatedAt: '2025-11-04T01:00:00Z',
  sender: { id: 'me', firstName: 'Me', lastName: '', fullName: 'Me', role: 'customer', avatarUrl: null },
  status: 'failed',
  failure,
})

const show = (message: ThreadMessage) =>
  render(
    <ul>
      <MessageBubble message={message} mine onRetry={vi.fn()} onRemove={vi.fn()} />
    </ul>,
  )

describe('MessageBubble failed send', () => {
  it.each<ChatErrorKind>(['network', 'forbidden', 'rate-limit', 'server', 'not-found'])('says why for %s and offers Retry and Remove', (kind) => {
    show(failed(kind))
    expect(screen.getByRole('alert')).toHaveTextContent(sendFailureCopy(kind))
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('offers only Remove for a refused (400) message', () => {
    show(failed('validation'))
    expect(screen.getByRole('alert')).toHaveTextContent(sendFailureCopy('validation'))
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('falls back to the network copy when no reason is known', () => {
    show(failed())
    expect(screen.getByRole('alert')).toHaveTextContent(sendFailureCopy('network'))
  })
})
