import { Fragment, useLayoutEffect, useRef } from 'react'
import type { ThreadMessage } from '../../hooks/useConversation'
import { formatChatDay, manilaDay } from '../../utils/format'
import { SpinnerIcon } from '../form/icons'
import { SECONDARY_BUTTON_SM } from '../ui/buttonStyles'
import { MessageBubble } from './MessageBubble'

/** How far from the bottom (px) still counts as reading the latest message. */
const NEAR_BOTTOM = 96

interface MessageListProps {
  messages: ThreadMessage[]
  selfId?: string
  /** The viewer is staff: real sender names and roles instead of KRAL. */
  staff?: boolean
  hasMore: boolean
  loadingEarlier: boolean
  /** Whether the viewer can write, so the empty state can point to the composer. */
  canSend: boolean
  onLoadEarlier: () => void
  onRetry: (clientId: string) => void
  onRemove: (clientId: string) => void
}

/** The thread: oldest at the top, a date separator per day. It follows new messages only while the reader is near the bottom. */
export function MessageList({ messages, selfId, staff, hasMore, loadingEarlier, canSend, onLoadEarlier, onRetry, onRemove }: MessageListProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const previous = useRef({ first: '', height: 0 })

  useLayoutEffect(() => {
    const element = scroller.current!
    const first = messages[0]?.clientId ?? ''
    const last = messages[messages.length - 1]
    if (previous.current.first && first !== previous.current.first) {
      // Earlier messages were added above: keep what the reader was looking at in place.
      element.scrollTop += element.scrollHeight - previous.current.height
    } else if (nearBottom.current || (last && last.senderId === selfId)) {
      element.scrollTop = element.scrollHeight
    }
    previous.current = { first, height: element.scrollHeight }
  }, [messages, selfId])

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget
        nearBottom.current = scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM
      }}
      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 sm:px-4"
    >
      {hasMore && (
        <div className="mb-4 flex justify-center">
          <button type="button" onClick={onLoadEarlier} disabled={loadingEarlier} aria-busy={loadingEarlier} className={SECONDARY_BUTTON_SM}>
            {loadingEarlier && <SpinnerIcon />}
            Load earlier messages
          </button>
        </div>
      )}
      <div role="log" aria-live="polite" aria-label="Messages">
        <ol className="grid gap-3">
        {messages.map((message, index) => (
          <Fragment key={message.clientId || message.id}>
            {(index === 0 || manilaDay(message.createdAt) !== manilaDay(messages[index - 1].createdAt)) && (
              <li role="separator" className="font-ui py-1 text-center text-sm text-fg-muted">
                {formatChatDay(message.createdAt)}
              </li>
            )}
            <MessageBubble message={message} mine={message.senderId === selfId} staff={staff} onRetry={onRetry} onRemove={onRemove} />
          </Fragment>
        ))}
        </ol>
      </div>
      {messages.length === 0 && (
        <p className="py-10 text-center text-base text-fg-muted">
          No messages yet. {canSend ? 'Write the first message below.' : 'Messages will show here when someone writes.'}
        </p>
      )}
    </div>
  )
}
