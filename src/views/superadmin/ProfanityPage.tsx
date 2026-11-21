import { useState } from 'react'
import { OffensesTab } from '../../components/admin/profanity/OffensesTab'
import { WordsTab } from '../../components/admin/profanity/WordsTab'
import { SegmentedTabs } from '../../components/ui/SegmentedTabs'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'Manage the words SilhouFit hides in customer chat messages and reviews, add, edit, archive or restore a word, and see each offense with the matched words.'

type Tab = 'words' | 'offenses'
const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'words', label: 'Words' },
  { value: 'offenses', label: 'Offenses' },
]

/** The profanity filter for a superadmin: the words that are hidden in chat and reviews, and the log of who used them (masked). */
export function ProfanityPage() {
  useDocumentTitle('Profanity Filter — SilhouFit')
  useMetaDescription(META_DESCRIPTION)
  const [tab, setTab] = useState<Tab>('words')

  return (
    <div className="grid gap-3">
      <header className="flex min-h-8 flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="display text-2xl text-fg sm:text-3xl">Profanity Filter</h1>
          <p className="mt-1 text-xs text-fg-muted">The words that get hidden in chat and reviews, and who used them</p>
        </div>
      </header>
      <div>
        <SegmentedTabs label="Profanity filter sections" name="profanity" options={TABS} value={tab} onChange={setTab} />
      </div>
      <div role="tabpanel" aria-labelledby={`profanity-tab-${tab}`}>
        {tab === 'words' ? <WordsTab /> : <OffensesTab />}
      </div>
    </div>
  )
}
