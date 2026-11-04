import type { ReactNode } from 'react'
import { useConversation } from '../../hooks/useConversation'
import { SectionBody } from '../staff/StaffSection'
import { ChatSkeleton } from './ChatSkeleton'
import { Composer } from './Composer'
import { ConnectionStatus } from './ConnectionStatus'
import { MessageList } from './MessageList'
import { TakeoverBanner } from './TakeoverBanner'

interface ChatThreadProps {
  conversationId: string
  /** Staff see who they are talking to and who handles the thread; a customer sees neither the banner nor the controls. */
  staff?: boolean
  /** Shown before the title, such as a back button. */
  leading?: ReactNode
}

/** One conversation in full: header, handler banner, connection status, messages and composer. Fills the height of its parent. */
export function ChatThread({ conversationId, staff = false, leading }: ChatThreadProps) {
  const chat = useConversation(conversationId)
  const { detail } = chat

  return (
    <SectionBody section={chat.section} what="this conversation" skeleton={<ChatSkeleton />} errorClassName="p-4">
      {() =>
        detail && (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-3">
              {leading}
              <div className="min-w-0">
                <h2 className="display truncate text-lg text-fg">
                  {/* TESTING: orderless chat, remove once orders exist */}
                  {detail.orderNo ? (
                    <>
                      Order <span className="tabular-nums">{detail.orderNo}</span>
                    </>
                  ) : (
                    'General chat'
                  )}
                </h2>
                <p className="truncate text-sm text-fg-muted">{staff ? detail.customer.name : 'KRAL will reply here'}</p>
              </div>
            </header>
            {staff && (
              <TakeoverBanner
                holder={chat.holder}
                selfId={chat.selfId}
                canSend={chat.canSend}
                canTakeOver={chat.canTakeOver}
                canRelease={chat.canRelease}
                acting={chat.acting}
                onTakeOver={chat.takeOver}
                onRelease={chat.release}
              />
            )}
            <ConnectionStatus connection={chat.connectionState} />
            <MessageList
              messages={chat.messages}
              selfId={chat.selfId}
              staff={staff}
              hasMore={chat.hasMore}
              loadingEarlier={chat.loadingEarlier}
              canSend={chat.canSend}
              onLoadEarlier={() => void chat.loadEarlier()}
              onRetry={(clientId) => void chat.retrySend(clientId)}
              onRemove={chat.removeFailed}
            />
            <Composer onSend={(body) => void chat.send(body)} sending={chat.sending} canSend={chat.canSend} />
          </div>
        )
      }
    </SectionBody>
  )
}
