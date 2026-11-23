import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageBubble } from '../../src/components/chat/MessageBubble'
import type { ThreadMessage } from '../../src/hooks/useConversation'
import { sendFailureCopy, type ChatErrorKind } from '../../src/service/chatApi'

const failed = (failure?: ChatErrorKind): ThreadMessage => ({
  id: 'pending-1',
  conversationId: 'c1',
  senderId: 'me',
  content: 'Hello',
  attachments: [],
  createdAt: '2025-11-04T01:00:00Z',
  updatedAt: '2025-11-04T01:00:00Z',
  sender: { id: 'me', firstName: 'Me', lastName: '', fullName: 'Me', role: 'customer', avatarUrl: null },
  status: 'failed',
  failure,
})

const show = (message: ThreadMessage, blocked = false) =>
  render(
    <ul>
      <MessageBubble message={message} mine blocked={blocked} onRetry={vi.fn()} onRemove={vi.fn()} />
    </ul>,
  )

describe('MessageBubble failed send', () => {
  it.each<ChatErrorKind>(['network', 'forbidden', 'rate-limit', 'server', 'not-found'])('says why for %s and offers Retry and Remove', (kind) => {
    show(failed(kind))
    expect(screen.getByRole('alert')).toHaveTextContent(sendFailureCopy(kind))
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('offers only Remove once messaging is blocked', () => {
    show(failed('network'), true)
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
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

describe('MessageBubble long text', () => {
  it('wraps a long unbroken word inside the bubble, which never exceeds 80% of the row', () => {
    const word = 'x'.repeat(300)
    show({ ...failed(), status: undefined, content: word })
    const bubble = screen.getByText(word)
    expect(bubble.className).toContain('[overflow-wrap:anywhere]')
    expect(bubble).toHaveClass('max-w-full', 'min-w-0', 'text-base', 'md:text-sm')
    expect(bubble.parentElement).toHaveClass('min-w-0', 'max-w-[80%]')
    expect(screen.getByTestId('chat-message')).toHaveClass('min-w-0', 'flex-row-reverse')
  })
})

describe('MessageBubble avatar', () => {
  const sent = { ...failed(), status: undefined }
  const staffSender = { id: 'st', firstName: 'Ana', lastName: 'Cruz', fullName: 'Ana Cruz', role: 'staff' as const, avatarUrl: null }

  it('shows no avatar on the viewer’s own message', () => {
    show(sent)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows the KRAL logo on a staff message to a customer', () => {
    render(
      <ul>
        <MessageBubble message={{ ...sent, senderId: 'st', sender: staffSender }} mine={false} onRetry={vi.fn()} onRemove={vi.fn()} />
      </ul>,
    )
    expect(screen.getByRole('img', { name: 'KRAL' })).toHaveAttribute('src', '/favicon.svg')
  })

  it('shows the customer’s avatar on their message to staff', () => {
    render(
      <ul>
        <MessageBubble message={sent} mine={false} staff onRetry={vi.fn()} onRemove={vi.fn()} />
      </ul>,
    )
    expect(screen.getByRole('img', { name: 'Me' })).toBeInTheDocument()
  })
})

describe('MessageBubble read receipt', () => {
  const sent = { ...failed(), status: undefined }
  const seen = { name: 'KRAL', avatar: <img src="/favicon.svg" alt="KRAL" /> }

  it('labels the tiny avatar under a read message', () => {
    render(
      <ul>
        <MessageBubble message={sent} mine seen={seen} onRetry={vi.fn()} onRemove={vi.fn()} />
      </ul>,
    )
    expect(screen.getByRole('img', { name: 'Seen by KRAL' })).toBeInTheDocument()
  })

  it('shows nothing when it has not been read', () => {
    show(sent)
    expect(screen.queryByRole('img', { name: /Seen by/ })).toBeNull()
  })
})

describe('MessageBubble attachments', () => {
  const photo = (n: number) => ({ id: `a${n}`, url: `https://cdn.example.com/p${n}.png`, type: 'IMAGE' as const, mimeType: 'image/png', fileName: `p${n}.png`, sizeBytes: 10, displayOrder: n, createdAt: '' })
  const withFiles = (content: string, count: number): ThreadMessage => ({ ...failed(), status: undefined, content, attachments: Array.from({ length: count }, (_, n) => photo(n)) })

  it('draws no empty bubble for an attachment-only message', () => {
    const { container } = render(
      <ul>
        <MessageBubble message={withFiles('', 1)} mine onRetry={vi.fn()} onRemove={vi.fn()} />
      </ul>,
    )
    expect(container.querySelector('.whitespace-pre-wrap')).toBeNull()
  })

  beforeEach(() => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })))
  afterEach(() => vi.unstubAllGlobals())

  it('describes each photo and opens it in a lightbox that Escape closes, returning focus', async () => {
    render(
      <ul>
        <MessageBubble message={withFiles('', 2)} mine onRetry={vi.fn()} onRemove={vi.fn()} />
      </ul>,
    )
    expect(screen.getByAltText('Photo 2 of 2 from Me')).toHaveAttribute('loading', 'lazy')
    const tile = screen.getAllByRole('button')[0]
    await userEvent.click(tile)
    expect(await screen.findByRole('dialog', { name: 'p0.png' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(tile).toHaveFocus()
  })

  it('falls back to a placeholder tile when a photo fails to load', () => {
    render(
      <ul>
        <MessageBubble message={withFiles('', 1)} mine onRetry={vi.fn()} onRemove={vi.fn()} />
      </ul>,
    )
    fireEvent.error(screen.getByAltText('Photo 1 of 1 from Me'))
    expect(screen.getByRole('img', { name: /photo unavailable/ })).toBeInTheDocument()
  })
})
