import { HelpAnswersList } from '../../components/admin/chatbot/HelpAnswersList'
import { SampleDataBadge } from '../../components/ui/SampleDataBadge'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'Manage the answers behind the SilhouFit Help chat: add a question, write the answer customers see, set its topic and link, publish it or keep a draft.'

/** The questions and answers the "KRAL Help" chat on the storefront can give. Customers only ever see the published ones. */
export function ChatbotPage() {
  useDocumentTitle('Help Chatbot — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  return (
    <div className="grid gap-3">
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-2xl text-fg sm:text-3xl">Help Chatbot</h1>
          <p className="mt-1 text-xs text-fg-muted">Questions and answers the Help chat gives customers</p>
        </div>
        <SampleDataBadge reason="Answers are saved in this browser until the help backend is connected." />
      </header>
      <HelpAnswersList />
    </div>
  )
}
