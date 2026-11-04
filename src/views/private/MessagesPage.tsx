import { Navigate } from 'react-router-dom'
import { ChatSkeleton } from '../../components/chat/ChatSkeleton'
import { ChatThread } from '../../components/chat/ChatThread'
import { SectionBody } from '../../components/staff/StaffSection'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useSection } from '../../hooks/useSection'
import { fetchMyConversation } from '../../service/chatApi'

const META_DESCRIPTION =
  'Message the SilhouFit team. Ask about sizing, orders, delivery or pickup and read their replies in the same conversation, as soon as they arrive.'

/** A customer's one conversation with the SilhouFit team. A guest goes to sign in before anything is requested. */
export function MessagesPage() {
  useDocumentTitle('Your messages — SilhouFit')
  useMetaDescription(META_DESCRIPTION)
  const user = useCurrentUser()

  if (!user) return <Navigate to="/login?next=%2Fmessages" replace />
  return <CustomerThread />
}

/** The thread: the conversation is opened (or created) first, then shown. */
function CustomerThread() {
  const section = useSection(fetchMyConversation)

  return (
    <div className="mx-auto flex h-svh max-w-3xl flex-col px-3 pt-[calc(5rem+env(safe-area-inset-top))] pb-3 sm:px-6 sm:pb-6">
      <h1 className="sr-only">Messages</h1>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-canvas-sub">
        <SectionBody section={section} what="your messages" skeleton={<ChatSkeleton />} errorClassName="p-4">
          {(conversation) => <ChatThread conversationId={conversation.id} />}
        </SectionBody>
      </div>
    </div>
  )
}
