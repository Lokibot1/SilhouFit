import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { MessagesListSkeleton, THREAD_ROW } from '../../components/chat/ChatSkeleton'
import { UnreadBadge } from '../../components/chat/InboxList'
import { MessageIcon, SpinnerIcon } from '../../components/form/icons'
import { SectionBody } from '../../components/staff/StaffSection'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { Tooltip } from '../../components/ui/Tooltip'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useSection } from '../../hooks/useSection'
import { ChatError, fetchMyConversations, openConversation } from '../../service/chatApi'
import { formatOrderTime } from '../../utils/format'

const META_DESCRIPTION = 'Your conversations with the SilhouFit team, one for each order you asked about. Open one to read the latest reply or to write to us again at any time.'

// TESTING: orderless chat, remove once orders exist
/** Opens the customer's general thread (the server returns the existing one if there is one), then goes to it. */
function MessageStaffButton({ className }: { className: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [opening, setOpening] = useState(false)

  async function start() {
    setOpening(true)
    try {
      const conversation = await openConversation()
      navigate(`/messages/${conversation.id}`)
    } catch (failure) {
      const why =
        failure instanceof ChatError && failure.kind === 'simulated'
          ? 'Chat needs a real signed-in account. Sign out, then sign in with a real account.'
          : 'The server did not open the conversation. Check your connection, then press Message staff to try again.'
      toast.show({ kind: 'error', message: `We couldn’t start a conversation. ${why}` })
      setOpening(false)
    }
  }

  return (
    <Tooltip label="Start or reopen your chat with SilhouFit staff">
      <button type="button" onClick={() => void start()} disabled={opening} aria-busy={opening} className={`${className} gap-2`}>
        {opening ? <SpinnerIcon /> : <MessageIcon size={16} />}
        Message staff
      </button>
    </Tooltip>
  )
}

/** A customer's conversations, one per order, newest first. */
export function MessagesPage() {
  useDocumentTitle('Your messages — SilhouFit')
  useMetaDescription(META_DESCRIPTION)
  const user = useCurrentUser()
  const section = useSection(fetchMyConversations)

  if (!user) return <Navigate to="/login?next=%2Fmessages" replace />

  return (
    <div className="mx-auto max-w-2xl px-6 pt-28 pb-24">
      <h1 className="display text-3xl text-fg sm:text-4xl">Messages</h1>
      <div className="mt-6">
        <SectionBody section={section} what="your messages" skeleton={<MessagesListSkeleton />}>
          {(threads) =>
            threads.length === 0 ? (
              <div className="grid justify-items-start gap-4">
                <p className="text-base text-fg-muted">
                  No conversations yet. Choose Message staff to ask us anything, or use Message staff on an order confirmation page to ask about that order.
                </p>
                <MessageStaffButton className={PRIMARY_BUTTON} />
                <Link to="/shop" className={SECONDARY_BUTTON}>
                  Back to shop
                </Link>
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="justify-self-start">
                  <MessageStaffButton className={SECONDARY_BUTTON} />
                </div>
                <ul className="grid gap-3">
                  {[...threads]
                    .sort((a, b) => Date.parse(b.lastMessageAt ?? '') - Date.parse(a.lastMessageAt ?? '') || 0)
                    .map((thread) => (
                      <li key={thread.id}>
                        <Link to={`/messages/${thread.id}`} className={`${THREAD_ROW} hover:bg-fg/5`}>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className={`text-base text-fg tabular-nums ${thread.unreadCount > 0 ? 'font-semibold' : ''}`}>
                                {thread.orderNo ? `Order ${thread.orderNo}` : 'General chat'}
                              </span>
                              {thread.lastMessageAt && <span className="font-ui shrink-0 text-xs text-fg-muted tabular-nums">{formatOrderTime(thread.lastMessageAt)}</span>}
                            </span>
                            <span className="block truncate text-sm text-fg-muted">{thread.lastMessage ?? 'No messages yet'}</span>
                          </span>
                          <UnreadBadge count={thread.unreadCount} />
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            )
          }
        </SectionBody>
      </div>
    </div>
  )
}
