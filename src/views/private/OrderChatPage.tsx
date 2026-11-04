import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { ChatThread } from '../../components/chat/ChatThread'
import { ChevronLeftIcon } from '../../components/form/icons'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'Message the SilhouFit team about your order. Ask about sizing, delivery or pickup and read their replies in the same conversation, as soon as they arrive.'

/** A customer's conversation with staff about one order. */
export function OrderChatPage() {
  useDocumentTitle('Order conversation — SilhouFit')
  useMetaDescription(META_DESCRIPTION)
  const { conversationId = '' } = useParams()
  const { pathname } = useLocation()
  const user = useCurrentUser()

  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />

  return (
    <div className="mx-auto flex h-svh max-w-3xl flex-col px-3 pt-[calc(5rem+env(safe-area-inset-top))] pb-3 sm:px-6 sm:pb-6">
      <h1 className="sr-only">Order conversation</h1>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-canvas-sub">
        <ChatThread
          conversationId={conversationId}
          leading={
            <Link to="/messages" aria-label="Back to messages" className="flex size-11 shrink-0 items-center justify-center rounded-xl text-fg hover:bg-fg/10">
              <ChevronLeftIcon size={20} />
            </Link>
          }
        />
      </div>
    </div>
  )
}
