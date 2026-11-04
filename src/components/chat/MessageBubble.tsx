import type { ThreadMessage } from '../../hooks/useConversation'
import { CHAT_BRAND_NAME, ROLE_LABEL } from '../../service/chatApi'
import { formatMessageTime } from '../../utils/format'
import { Avatar } from '../ui/Avatar'

const ACTION = 'font-ui min-h-11 cursor-pointer rounded-xl px-3 text-sm font-semibold underline underline-offset-2 hover:text-chrome-strong'

interface MessageBubbleProps {
  message: ThreadMessage
  /** Sent by the person looking at the thread: drawn on the right. */
  mine: boolean
  /** The viewer is staff, so they see the real sender; a customer sees every non-customer sender as KRAL. */
  staff?: boolean
  onRetry: (clientId: string) => void
  onRemove: (clientId: string) => void
}

export function MessageBubble({ message, mine, staff = false, onRetry, onRemove }: MessageBubbleProps) {
  const { status } = message
  const masked = !staff && !mine && message.senderRole !== 'customer'
  const name = masked ? CHAT_BRAND_NAME : message.senderName
  const label = masked ? '' : ROLE_LABEL[message.senderRole]
  return (
    <li data-testid="chat-message" data-status={status ?? 'sent'} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
      <Avatar name={name} size="sm" />
      <div className={`flex min-w-0 max-w-[85%] flex-col sm:max-w-[75%] ${mine ? 'items-end' : 'items-start'}`}>
        {!mine && (
          <p className="font-ui mb-1 truncate px-1 text-sm text-fg-muted">
            <span className="font-semibold text-fg">{name}</span>
            {label && <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium">{label}</span>}
          </p>
        )}
        <div
          className={`max-w-full rounded-xl px-3 py-2 text-base leading-6 break-words whitespace-pre-wrap ${
            mine ? 'bg-fg text-canvas' : 'border border-line bg-canvas-sub text-fg'
          } ${status === 'pending' ? 'opacity-70' : ''} ${status === 'failed' ? 'ring-2 ring-danger' : ''}`}
        >
          {message.body}
        </div>
        {status === 'failed' ? (
          <div role="alert" className="mt-1 flex flex-wrap items-center gap-x-1 px-1 text-sm text-danger">
            <span>Not sent. The connection dropped before the server answered.</span>
            <button type="button" onClick={() => onRetry(message.clientId)} className={`${ACTION} text-fg`}>
              Retry
            </button>
            <button type="button" onClick={() => onRemove(message.clientId)} className={`${ACTION} text-fg`}>
              Remove
            </button>
          </div>
        ) : (
          <p className="font-ui mt-1 px-1 text-xs text-fg-muted tabular-nums">
            {status === 'pending' ? 'Sending…' : <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>}
          </p>
        )}
      </div>
    </li>
  )
}
