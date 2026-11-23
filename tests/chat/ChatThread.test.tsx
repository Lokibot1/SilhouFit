import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ChatThread } from '../../src/components/chat/ChatThread'
import { useConversation } from '../../src/hooks/useConversation'

vi.mock('../../src/hooks/useConversation')
vi.mock('../../src/components/chat/MessageList', () => ({ MessageList: () => null }))

function blockedWith(reason: string | null) {
  vi.mocked(useConversation).mockReturnValue({
    detail: { customer: { id: 'c1', firstName: 'Lia', lastName: 'Reyes', messagingBlockedAt: '2025-11-05T00:00:00Z', messagingBlockedReason: reason } },
    section: { state: { status: 'success', data: null }, retry: vi.fn() },
    messages: [],
    sending: false,
  } as unknown as ReturnType<typeof useConversation>)
  render(
    <MemoryRouter>
      <ChatThread conversationId="c1" />
    </MemoryRouter>,
  )
  return document.getElementById('chat-composer-note')!.textContent
}

describe('ChatThread blocked notice', () => {
  it('ends the reason with a period before the next sentence', () => {
    expect(blockedWith(' Spam or repeated messages ')).toContain('Reason: Spam or repeated messages. Think this is a mistake? Contact us.')
  })

  it('keeps a reason that already ends in punctuation as it is', () => {
    expect(blockedWith('Rude!')).toContain('Reason: Rude! Think this is a mistake?')
  })

  it('skips the reason when there is none', () => {
    const note = blockedWith(null)
    expect(note).not.toContain('Reason')
    expect(note).toContain('replies. Think this is a mistake? Contact us.')
    expect(screen.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', '/contact')
  })
})
