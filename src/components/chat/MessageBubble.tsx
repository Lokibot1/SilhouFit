import type { ThreadMessage } from '../../hooks/useConversation'
import { CHAT_BRAND_NAME, ROLE_LABEL, displayName, sendFailureCopy } from '../../service/chatApi'
import { formatMessageTime } from '../../utils/format'
import { Avatar } from '../ui/Avatar'

const ACTION = 'font-ui min-h-11 cursor-pointer rounded-xl px-3 text-sm font-semibold underline underline-offset-2 hover:text-chrome-strong'

interface MessageBubbleProps {
  message: ThreadMessage
  /** Arrived after the thread showed: fades and settles in. */
  enter?: boolean
  /** Sent by the person looking at the thread: drawn on the right. */
  mine: boolean
  /** The viewer is staff, so they see the real sender; a customer sees every sender who is not a customer as KRAL. */
  staff?: boolean
  onRetry: (id: string) => void
  onRemove: (id: string) => void
}

export function MessageBubble({ message, enter = false, mine, staff = false, onRetry, onRemove }: MessageBubbleProps) {
  const { status } = message
  const { sender } = message
  const masked = !staff && !mine && sender?.role !== 'customer'
  const name = masked ? CHAT_BRAND_NAME : sender ? displayName(sender) : ''
  const label = masked || !sender ? '' : ROLE_LABEL[sender.role]
  return (
    <li data-testid="chat-message" data-status={status ?? 'sent'} className={`flex min-w-0 items-end gap-2 ${mine ? 'origin-bottom-right flex-row-reverse' : 'origin-bottom-left'} ${enter ? 'enter-message' : ''}`}>
      <Avatar name={name} src={masked ? undefined : (sender?.avatarUrl ?? undefined)} size="sm" />
      <div className={`flex min-w-0 max-w-[80%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {!mine && (
          <p className="font-ui mb-1 truncate px-1 text-sm text-fg-muted">
            <span className="font-semibold text-fg">{name}</span>
            {label && <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium">{label}</span>}
          </p>
        )}
        <div
          className={`max-w-full min-w-0 rounded-xl px-3 py-2 text-sm leading-6 [overflow-wrap:anywhere] whitespace-pre-wrap ${
            mine ? 'bg-fg text-canvas' : 'border border-line bg-canvas-sub text-fg'
          } transition-opacity duration-200 ${status === 'pending' ? 'opacity-70' : ''} ${status === 'failed' ? 'ring-2 ring-danger' : ''}`}
        >
          {message.content}
        </div>
        {status === 'failed' ? (
          <div role="alert" className="mt-1 flex flex-wrap items-center gap-x-1 px-1 text-sm text-danger">
            <span>{sendFailureCopy(message.failure ?? 'network')}</span>
            {message.failure !== 'validation' && (
              <button type="button" onClick={() => onRetry(message.id)} className={`${ACTION} text-fg`}>
                Retry
              </button>
            )}
            <button type="button" onClick={() => onRemove(message.id)} className={`${ACTION} text-fg`}>
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
