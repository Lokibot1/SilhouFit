import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ChatThread } from '../../components/chat/ChatThread'
import { InboxList } from '../../components/chat/InboxList'
import { ChevronLeftIcon, MessageIcon } from '../../components/form/icons'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'Answer customers who message SilhouFit. See every conversation and what is unread, search by customer name or email, then reply from the same shared inbox.'

/** Inbox and thread side by side from `lg`; below it the list and the thread take turns, and the thread has a back button. The open thread is `?c=` so Back and reloads work; the in-app back button steps back when the list is the previous entry, so it adds no duplicate. */
export function StaffMessagesPage() {
  useDocumentTitle('Messages — SilhouFit')
  useMetaDescription(META_DESCRIPTION)
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const selected = params.get('c') ?? undefined

  return (
    <>
      <h1 className="sr-only">Messages</h1>
      <div className="grid h-[calc(100svh-5.5rem)] overflow-hidden rounded-xl border border-line bg-canvas-sub shadow-sm lg:h-[calc(100svh-6.5rem)] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section aria-label="Conversations" className={`min-h-0 flex-col border-line lg:flex lg:border-r ${selected ? 'hidden' : 'flex'}`}>
          <InboxList selectedId={selected} onSelect={(id) => setParams({ c: id }, { state: { fromList: true } })} onClear={() => selected && setParams({}, { replace: true })} />
        </section>
        <section aria-label="Conversation" className={`min-h-0 min-w-0 flex-col lg:flex ${selected ? 'flex' : 'hidden'}`}>
          {selected ? (
            <ChatThread
              key={selected}
              conversationId={selected}
              staff
              leading={
                <button
                  type="button"
                  onClick={() => (location.state?.fromList ? navigate(-1) : setParams({}, { replace: true }))}
                  aria-label="Back to conversations"
                  className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-fg/10 lg:hidden"
                >
                  <ChevronLeftIcon size={20} />
                </button>
              }
            />
          ) : (
            <div className="grid flex-1 place-content-center justify-items-center gap-2 p-6 text-center">
              <span className="mb-2 flex size-16 items-center justify-center rounded-full bg-kral-red/10 text-kral-red-ink">
                <MessageIcon size={20} />
              </span>
              <h2 className="text-lg font-semibold text-fg">Select a conversation</h2>
              <p className="max-w-xs text-base text-fg-muted">Choose a conversation to read it and reply.</p>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
