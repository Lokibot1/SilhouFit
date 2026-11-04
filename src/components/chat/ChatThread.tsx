import { useState, type CSSProperties, type ReactNode } from 'react'
import { useConversation } from '../../hooks/useConversation'
import { CHAT_BRAND_NAME, displayName } from '../../service/chatApi'
import { SectionBody } from '../staff/StaffSection'
import { ChatSkeleton } from './ChatSkeleton'
import { Composer } from './Composer'
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
    <div className="min-h-6 shrink-0 px-3 text-sm text-fg-muted">
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
              hasMore={chat.hasMore}
              loadingEarlier={chat.loadingEarlier}
              onLoadEarlier={() => void chat.loadEarlier()}
              onRetry={(id) => void chat.retrySend(id)}
              onRemove={chat.removeFailed}
            />
            <TypingLine name={chat.typingName} />
            <Composer onSend={(body) => void chat.send(body)} sending={chat.sending} onTyping={chat.notifyTyping} focusOnMount={compact} publishOffset={publishOffset} />
          </div>
        )
      }
    </SectionBody>
  )
}
