import { useState } from 'react'
import type { ThreadMessage } from '../../hooks/useConversation'
import { CHAT_BRAND_NAME, ROLE_LABEL, displayName, sendFailureCopy } from '../../service/chatApi'
import { formatMessageTime } from '../../utils/format'
import { Avatar } from '../ui/Avatar'
import { KralAvatar } from './KralAvatar'
import { Modal } from '../ui/Modal'
import { PhotoImg } from '../ui/PhotoImg'

const ACTION = 'font-ui min-h-11 cursor-pointer rounded-xl px-3 text-sm font-semibold underline underline-offset-2 hover:text-chrome-strong'

interface MessageBubbleProps {
  message: ThreadMessage
  /** Arrived after the thread showed: fades and settles in. */
  enter?: boolean
  /** Sent by the person looking at the thread: drawn on the right. */
  mine: boolean
  /** The viewer is staff, so they see the real sender; a customer sees every sender who is not a customer as KRAL. */
  staff?: boolean
  /** The sender cannot send (messaging blocked), so Retry would only fail again. */
  blocked?: boolean
  /** The dock's small window: smaller text and pictures. */
  compact?: boolean
  onRetry: (id: string) => void
  onRemove: (id: string) => void
}

export function MessageBubble({ message, enter = false, mine, staff = false, blocked = false, compact = false, onRetry, onRemove }: MessageBubbleProps) {
  const { status, progress } = message
  const { sender } = message
  const masked = !staff && !mine && sender?.role !== 'customer'
  const name = masked ? CHAT_BRAND_NAME : sender ? displayName(sender) : ''
  const [open, setOpen] = useState<number>()
  const { attachments } = message
  const photo = open === undefined ? undefined : attachments[open]
  const label = masked || !sender ? '' : ROLE_LABEL[sender.role]
  return (
    <li data-testid="chat-message" data-status={status ?? 'sent'} className={`flex min-w-0 items-end gap-2 ${mine ? 'origin-bottom-right flex-row-reverse' : 'origin-bottom-left'} ${enter ? 'enter-message' : ''}`}>
      {masked ? <KralAvatar size="sm" /> : <Avatar name={name} src={sender?.avatarUrl ?? undefined} size="sm" />}
      <div className={`flex min-w-0 max-w-[80%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {!mine && (
          <p className="font-ui mb-1 truncate px-1 text-sm text-fg-muted">
            <span className="font-semibold text-fg">{name}</span>
            {label && <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium">{label}</span>}
          </p>
        )}
        {attachments.length > 0 && (
          // Fixed square tiles, so nothing moves while the files load.
          <div className={`mb-1 grid ${compact ? 'w-44' : 'w-60'} max-w-full gap-1 transition-opacity duration-200 ${attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} ${status === 'pending' ? 'opacity-70' : ''}`}>
            {attachments.map((file, index) => {
              const description = `${file.type === 'IMAGE' ? 'Photo' : 'Video'} ${index + 1} of ${attachments.length} from ${name || 'sender'}`
              const tile = 'aspect-square min-h-11 min-w-11 overflow-hidden rounded-xl border border-line bg-canvas-sub'
              return file.type === 'IMAGE' ? (
                <button key={file.id || file.url} type="button" onClick={() => setOpen(index)} className={`${tile} cursor-pointer`}>
                  <PhotoImg src={file.url} alt={description} loading="lazy" className="size-full object-cover" />
                </button>
              ) : (
                <video key={file.id || file.url} src={`${file.url}#t=0.1`} controls preload="metadata" playsInline aria-label={description} className={`${tile} object-contain`} />
              )
            })}
          </div>
        )}
        {message.content && (
          <div
            className={`max-w-full min-w-0 rounded-xl px-3 py-2 text-base leading-6 [overflow-wrap:anywhere] whitespace-pre-wrap ${compact ? 'sm:text-xs sm:leading-5' : 'md:text-sm'} ${
              mine ? 'bg-fg text-canvas' : 'border border-line bg-canvas-sub text-fg'
            } transition-opacity duration-200 ${status === 'pending' ? 'opacity-70' : ''} ${status === 'failed' ? 'ring-2 ring-danger' : ''}`}
          >
            {message.content}
          </div>
        )}
        {status === 'failed' ? (
          <div role="alert" className="mt-1 flex flex-wrap items-center gap-x-1 px-1 text-sm text-danger">
            <span>{sendFailureCopy(message.failure ?? 'network', attachments.length > 0)}</span>
            {message.failure !== 'validation' && !blocked && (
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
            {status === 'pending' && progress !== undefined && progress < 100 ? (
              <span className="flex items-center gap-2">
                <span role="progressbar" aria-label="Uploading files" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="block h-1 w-24 overflow-hidden rounded-full bg-line">
                  <span className="block h-full origin-left bg-fg" style={{ transform: `scaleX(${progress / 100})` }} />
                </span>
                Uploading {progress}%
              </span>
            ) : status === 'pending' ? (
              'Sending…'
            ) : (
              <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
            )}
          </p>
        )}
      </div>
      <Modal open={!!photo} onClose={() => setOpen(undefined)} title={photo?.fileName || 'Photo'}>
        {photo && <PhotoImg src={photo.url} alt={photo.fileName || 'Photo'} className="max-h-[70vh] w-full rounded-xl object-contain" />}
      </Modal>
    </li>
  )
}
