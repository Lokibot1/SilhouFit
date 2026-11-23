import { useState, type CSSProperties, type ReactNode } from 'react'
import { useConversation } from '../../hooks/useConversation'
import { CHAT_BRAND_NAME, displayName } from '../../service/chatApi'
import { Avatar } from '../ui/Avatar'
import { formatPlacedAt } from '../../utils/format'
import { Tooltip } from '../ui/Tooltip'
import { SectionBody } from '../staff/StaffSection'
import { ChatSkeleton } from './ChatSkeleton'
import { Composer } from './Composer'
import { KralAvatar } from './KralAvatar'
import { ConnectionStatus } from './ConnectionStatus'
import { MessageList } from './MessageList'

interface ChatThreadProps {
  conversationId: string
  /** Staff see who they are talking to and the real sender names; a customer sees KRAL. */
  staff?: boolean
  /** Shown before the title, such as a back button. */
  leading?: ReactNode
  /** Inside a dock box, which has its own header: drops this one and focuses the message box. */
  compact?: boolean
  /** Passed to the composer; the dock turns it off because it reads the offset itself. */
  publishOffset?: boolean
}

/** The "is typing" line. Its height is always reserved; it fades and slides in and out, and keeps the last name while it fades. Only the live region is read out. */
function TypingLine({ name }: { name?: string }) {
  const [shown, setShown] = useState(name)
  if (name && name !== shown) setShown(name)
  return (
    <div className="min-h-4 shrink-0 px-3 text-xs leading-4 text-fg-muted">
      <p role="status" aria-live="polite" className="sr-only">
        {name && `${name} is typing`}
      </p>
      <p
        aria-hidden="true"
        className={`flex items-center gap-1.5 transition-[opacity,translate] duration-200 ease-out ${name ? 'opacity-100' : 'opacity-0 motion-safe:translate-y-1'}`}
      >
        {shown} is typing
        <span className="flex gap-0.5">
          {[0, 1, 2].map((dot) => (
            <span key={dot} style={{ '--i': dot } as CSSProperties} className="typing-dot size-1 rounded-full bg-fg-muted opacity-60" />
          ))}
        </span>
      </p>
    </div>
  )
}

/** One conversation in full: header, connection status, messages and composer. Fills the height of its parent. */
export function ChatThread({ conversationId, staff = false, leading, compact = false, publishOffset = true }: ChatThreadProps) {
  const chat = useConversation(conversationId)
  const { detail } = chat
  const blockedAt = detail?.customer?.messagingBlockedAt
  const customerName = detail?.customer ? displayName(detail.customer) : 'Customer'
  const other = staff
    ? { name: customerName, avatar: <Avatar name={customerName} src={detail?.customer?.avatarUrl ?? undefined} size="xs" /> }
    : { name: CHAT_BRAND_NAME, avatar: <KralAvatar size="xs" /> }

  return (
    <SectionBody section={chat.section} what="this conversation" skeleton={<ChatSkeleton compact={compact} />} errorClassName="p-4">
      {() =>
        detail && (
          <div className="flex min-h-0 flex-1 flex-col">
            {!compact && (
              <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-3">
                {leading}
                <div className="min-w-0">
                  <h2 className="display truncate text-lg text-fg">{staff ? (detail.customer ? displayName(detail.customer) : 'Customer') : CHAT_BRAND_NAME}</h2>
                  <p className="truncate text-sm text-fg-muted">{staff ? detail.customer?.email : 'We reply here as soon as we can'}</p>
                </div>
              </header>
            )}
            <ConnectionStatus connection={chat.connectionState} />
            <MessageList
              messages={chat.messages}
              selfId={chat.selfId}
              staff={staff}
              blocked={!staff && !!blockedAt}
              compact={compact}
              otherReadAt={staff ? detail.customerReadAt : detail.staffReadAt}
              other={other}
              hasMore={chat.hasMore}
              loadingEarlier={chat.loadingEarlier}
              onLoadEarlier={() => void chat.loadEarlier()}
              onRetry={(id) => void chat.retrySend(id)}
              onRemove={chat.removeFailed}
            />
            <TypingLine name={chat.typingName} />
            {staff && blockedAt && (
              <p className="font-ui shrink-0 border-t border-line bg-canvas-sub px-3 py-2 text-sm break-words text-fg-muted">
                <span className="mr-2 inline-flex h-6 items-center gap-1.5 rounded-full border border-line-strong px-2 whitespace-nowrap text-fg">
                  <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
                  Messaging blocked
                </span>
                <time dateTime={blockedAt}>{formatPlacedAt(blockedAt)}</time>
                . They can't send messages; you can still reply.
                {detail.customer?.messagingBlockedReason && (
                  <Tooltip label={detail.customer.messagingBlockedReason} wrap className="mt-1 w-full">
                    <span tabIndex={0} className="line-clamp-2 min-w-0 rounded-sm break-words">
                      Reason: {detail.customer.messagingBlockedReason}
                    </span>
                  </Tooltip>
                )}
              </p>
            )}
            <Composer
              disabledReason={!staff && blockedAt ? `Your messaging is blocked, so you can't send messages. You can still read replies.${detail.customer?.messagingBlockedReason ? ` Reason: ${detail.customer.messagingBlockedReason}` : ''}` : undefined}
              onSend={(body, files) => void chat.send(body, files)}
              attachments
              sending={chat.sending}
              onTyping={chat.notifyTyping}
              focusOnMount={compact}
              publishOffset={publishOffset}
            />
          </div>
        )
      }
    </SectionBody>
  )
}
