import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useProfanityWords } from '../../../hooks/useProfanityWords'
import { archiveWord, createWord, languageLabel, MAX_WORD_SEARCH, PROFANITY_PER_PAGE_OPTIONS, restoreWord, updateWord, WORD_LANGUAGES, type ProfanityWord, type WordStatus } from '../../../service/profanity'
import { formatOrderTime } from '../../../utils/format'
import { PlusIcon, RestoreIcon, SearchIcon, TrashIcon, PencilIcon, XIcon } from '../../form/icons'
import { Pagination } from '../../shop/Pagination'
import { PAGER_FOOTER, PAGER_PAGINATION, TABLE_ROW, TD, TH } from '../../staff/inventory/layout'
import { RowIconButton } from '../../staff/measurements/RowIconButton'
import { SectionError } from '../../staff/StaffSection'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { TransactionPagerSkeleton } from '../../staff/TransactionsSkeleton'
import { PAGER_ROWS } from '../../staff/transactions/layout'
import { useToast } from '../../toast/useToast'
import { PRIMARY_BUTTON_SM, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { SegmentedTabs } from '../../ui/SegmentedTabs'
import { Select } from '../../ui/Select'
import { ConfirmDialog } from '../users/ConfirmDialog'
import { WORD_CARD_ROW, WORD_HEADERS, WordCardSkeletonRows, WordTableSkeletonRows } from './ProfanitySkeleton'
import { WordFormModal } from './WordFormModal'

/** Placeholders sit clearly dimmer than typed text yet stay above 4.5:1 on the page colour in both themes. */
const PLACEHOLDER = 'placeholder:text-[color-mix(in_srgb,var(--fg-muted)_85%,var(--canvas))] dark:placeholder:text-[color-mix(in_srgb,var(--fg-muted)_72%,var(--canvas))]'
const STATUSES: readonly { value: WordStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
]
const LANGUAGES = [{ value: '', label: 'All languages' }, ...WORD_LANGUAGES]
const PER_PAGE_CHOICES = PROFANITY_PER_PAGE_OPTIONS.map((n) => ({ value: n, label: `${n} per page` }))

/** The state in words and a dot (filled or ringed), so it never rests on colour alone. */
function StatusBadge({ archived }: { archived: boolean }) {
  return (
    <span className="font-ui inline-flex h-6 shrink-0 items-center gap-1.5 justify-self-start rounded-full border border-line-strong px-2 text-sm whitespace-nowrap text-fg">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${archived ? 'border-2 border-fg-muted' : 'bg-success'}`} />
      {archived ? 'Archived' : 'Active'}
    </span>
  )
}

/** What happened, why, and what to do, for a word request that failed. The server's own sentence is shown for a refusal. */
function failureCopy(error: unknown, doing: string) {
  const { status, detail } = (error ?? {}) as { status?: number; detail?: string }
  const head = `Couldn't ${doing}.`
  if (status === 401) return `${head} Your session expired. Sign in again, then retry.`
  if (status === 403) return `${head} Only a superadmin can change the filter, so nothing changed. Sign in with a superadmin account.`
  if (status === 404) return `${head} The word no longer exists or was already archived, so nothing changed. The list has been refreshed.`
  if (status === 409) return `${head} ${detail ?? 'That word is already in the filter.'} Edit the existing word instead.`
  if (status === 400) return `${head} ${detail ?? 'The server did not accept it.'} Check the word, then try again.`
  if (status === 429) return `${head} Too many requests were sent, so nothing changed. Wait a few minutes, then try again.`
  return `${head} The change wasn't saved, probably because the connection dropped. Try again.`
}

/** The word list: filter by status, search and language; add, edit, archive and restore words. */
export function WordsTab() {
  const toast = useToast()
  const list = useProfanityWords()
  const { state, result, stale, retry, status, setStatus, page, setPage, per, filtered, clear } = list
  // An empty answer to an earlier view is not shown while the next one loads (it would read as "none yet" after Clear filters).
  const rows = result && !(stale && result.data.length === 0) ? result.data : null

  const [busyId, setBusyId] = useState<string | null>(null)
  const inFlight = useRef(false)
  const [form, setForm] = useState<{ word: ProfanityWord | null; session: number; open: boolean; error: string | null } | null>(null)
  // Stays set while the dialog closes, so its text does not change as it fades out.
  const [archiving, setArchiving] = useState<ProfanityWord | null>(null)
  const [asking, setAsking] = useState(false)

  /** One request at a time: the buttons wait, and a double click cannot send it twice. A word that is gone (404) reloads the list. */
  async function run<T>(id: string, request: () => Promise<T>): Promise<T | undefined> {
    if (inFlight.current) return undefined
    inFlight.current = true
    setBusyId(id)
    try {
      return await request()
    } catch (error) {
      if ((error as { status?: number }).status === 404) retry()
      throw error
    } finally {
      inFlight.current = false
      setBusyId(null)
    }
  }

  async function save(input: { word: string; language: string }) {
    if (!form) return
    const { word } = form
    try {
      const saved = await run(word?.id ?? 'new', () => (word ? updateWord(word.id, input) : createWord(input)))
      if (!saved) return
      setForm({ ...form, open: false, error: null })
      toast.show({ kind: 'success', message: word ? `"${saved.word}" updated.` : `"${saved.word}" added to the filter.` })
    } catch (error) {
      setForm((current) => current && { ...current, error: failureCopy(error, word ? 'save the word' : 'add the word') })
    }
  }

  async function restore(word: ProfanityWord) {
    try {
      if (await run(word.id, () => restoreWord(word.id))) toast.show({ kind: 'success', message: `"${word.word}" restored. It is hidden in chat and reviews again.` })
    } catch (error) {
      toast.show({ kind: 'error', message: failureCopy(error, `restore "${word.word}"`), action: { label: 'Retry', onClick: () => void restore(word) } })
    }
  }

  async function archive() {
    if (!archiving) return
    const word = archiving
    try {
      if (!(await run(word.id, () => archiveWord(word.id)))) return
      setAsking(false)
      toast.show({ kind: 'success', message: `"${word.word}" archived.`, action: { label: 'Undo', onClick: () => void restore(word) } })
    } catch (error) {
      setAsking(false)
      toast.show({ kind: 'error', message: failureCopy(error, `archive "${word.word}"`) })
    }
  }

  const edit = (word: ProfanityWord) => setForm((old) => ({ word, session: (old?.session ?? 0) + 1, open: true, error: null }))
  const add = () => setForm((old) => ({ word: null, session: (old?.session ?? 0) + 1, open: true, error: null }))

  // Called, not rendered as a component, so the buttons keep their identity (and focus) across renders.
  const actions = (word: ProfanityWord) => {
    const busy = busyId === word.id
    return (
      <div className="flex flex-nowrap items-center gap-2">
        {word.isArchived ? (
          <RowIconButton label={`Restore ${word.word}`} icon={<RestoreIcon />} disabled={busy} onClick={() => void restore(word)} />
        ) : (
          <>
            <RowIconButton label={`Edit ${word.word}`} icon={<PencilIcon />} disabled={busy} onClick={() => edit(word)} />
            <RowIconButton
              label={`Archive ${word.word}`}
              icon={<TrashIcon />}
              disabled={busy}
              onClick={() => {
                setArchiving(word)
                setAsking(true)
              }}
            />
          </>
        )}
      </div>
    )
  }

  function body(): ReactNode {
    if (state.status === 'error' && !result) return <SectionError what="the words" kind={state.kind} retryAfterMs={state.retryAfterMs} onRetry={retry} />

    if (result && result.data.length === 0 && !stale) {
      return (
        <div>
          {result.meta.total > 0 ? (
            <>
              <p className="text-base text-fg-muted">There are no words on page {page}.</p>
              <button type="button" onClick={() => setPage(1)} className={`${SECONDARY_BUTTON} mt-3`}>
                Go to the first page
              </button>
            </>
          ) : filtered ? (
            <>
              <p className="text-base font-semibold text-fg">No words match</p>
              <p className="mt-1 text-base text-fg-muted">Check the spelling, or clear the search and language and try again.</p>
              <button type="button" onClick={clear} className={`${SECONDARY_BUTTON} mt-3`}>
                Clear filters
              </button>
            </>
          ) : status === 'archived' ? (
            <>
              <p className="text-base font-semibold text-fg">No archived words</p>
              <p className="mt-1 text-base text-fg-muted">Words you archive show up here and can be restored.</p>
              <button type="button" onClick={() => setStatus('active')} className={`${SECONDARY_BUTTON} mt-3`}>
                Show active words
              </button>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-fg">No words yet</p>
              <p className="mt-1 text-base text-fg-muted">Add the first word to start hiding it in customers&apos; chat messages and reviews.</p>
              <button type="button" onClick={add} className={`${SECONDARY_BUTTON} mt-3`}>
                Add word
              </button>
            </>
          )}
        </div>
      )
    }

    return (
      <>
        {state.status === 'error' && result && (
          <div className="mb-3 rounded-xl border border-line bg-canvas-sub p-3">
            <SectionError what="the latest words" kind={state.kind} retryAfterMs={state.retryAfterMs} onRetry={retry} />
            <p className="mt-3 text-sm text-fg-muted">The list below is from before your last change.</p>
          </div>
        )}
        <p role="status" className="sr-only">
          {state.status === 'loading' ? 'Loading words' : ''}
        </p>
        <table aria-busy={rows === null || stale} className="hidden w-full border-separate border-spacing-0 whitespace-nowrap @4xl:table">
          <caption className="sr-only">Words with language, status, last update and actions</caption>
          <thead>
            <tr>
              {WORD_HEADERS.map((label) => (
                <th key={label} scope="col" className={TH}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={`transition-opacity duration-150 ${stale ? 'opacity-60' : ''}`}>
            {rows === null ? (
              <WordTableSkeletonRows count={list.skeletonRows} />
            ) : (
              rows.map((word, index) => (
                <tr key={word.id} style={{ '--i': index } as CSSProperties} className={`${TABLE_ROW} enter-row hover:bg-line/40`}>
                  <td className={`${TD} text-sm font-semibold text-fg`}>
                    <span className="block max-w-64 truncate">{word.word}</span>
                  </td>
                  <td className={`${TD} text-sm text-fg`}>{languageLabel(word.language)}</td>
                  <td className={TD}>
                    <StatusBadge archived={word.isArchived} />
                  </td>
                  <td className={`${TD} text-sm text-fg-muted`}>
                    <time dateTime={word.updatedAt}>{formatOrderTime(word.updatedAt)}</time>
                  </td>
                  <td className={`${TD} w-px`}>
                    {actions(word)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <ul aria-busy={rows === null || stale} aria-label="Words" className={`divide-y divide-line border-y border-line transition-opacity duration-150 @4xl:hidden ${stale ? 'opacity-60' : ''}`}>
          {rows === null ? (
            <WordCardSkeletonRows count={list.skeletonRows} />
          ) : (
            rows.map((word, index) => (
              <li key={word.id} style={{ '--i': index } as CSSProperties} className={`${WORD_CARD_ROW} enter-row flex flex-col justify-center py-2`}>
                <div className="flex h-6 items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-base font-semibold text-fg">{word.word}</p>
                  <StatusBadge archived={word.isArchived} />
                </div>
                <p className="flex h-6 items-center truncate text-base text-fg-muted">
                  {languageLabel(word.language)}
                  <span aria-hidden="true">&nbsp;·&nbsp;</span>
                  <time dateTime={word.updatedAt}>{formatOrderTime(word.updatedAt)}</time>
                </p>
                <div className="flex h-11 items-center justify-end">
                  {actions(word)}
                </div>
              </li>
            ))
          )}
        </ul>
        {rows && result ? (
          <div className={PAGER_FOOTER}>
            <div className={`${PAGER_PAGINATION} ${PAGER_ROWS}`}>
              <Pagination page={page} pageCount={Math.max(1, result.meta.totalPages)} from={(page - 1) * per + 1} to={Math.min(page * per, result.meta.total)} total={result.meta.total} onPage={setPage} />
            </div>
          </div>
        ) : (
          <TransactionPagerSkeleton />
        )}
      </>
    )
  }

  return (
    <section aria-labelledby="words-list" className={`${STAFF_SECTION} scroll-mt-14`}>
      <h2 id="words-list" className="sr-only">
        Words
      </h2>
      <div className="mb-3">
        <SegmentedTabs label="Word status" name="word-status" options={STATUSES} value={status} onChange={setStatus} />
      </div>
      <div className="mb-3 grid gap-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            value={list.text}
            onChange={(event) => list.setText(event.target.value)}
            maxLength={MAX_WORD_SEARCH}
            placeholder="Search words"
            aria-label="Search words"
            autoComplete="off"
            spellCheck={false}
            className={`font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas pr-11 pl-10 text-base text-fg ${PLACEHOLDER}`}
          />
          {list.text && (
            <button type="button" onClick={() => list.setText('')} aria-label="Clear search" className="absolute top-0 right-0 flex size-11 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:text-fg">
              <XIcon />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full @sm:w-44">
            <Select label="Filter by language" value={list.language} options={LANGUAGES} onChange={list.setLanguage} />
          </div>
          <div className="w-full @sm:w-44">
            <Select label="Rows per page" value={per} options={PER_PAGE_CHOICES} onChange={list.setPer} />
          </div>
          <button type="button" onClick={add} className={`${PRIMARY_BUTTON_SM} w-full @sm:ml-auto @sm:w-auto`}>
            <PlusIcon />
            Add word
          </button>
        </div>
      </div>
      {body()}
      {form && (
        <WordFormModal key={form.session} open={form.open} word={form.word} pending={busyId !== null} error={form.error} onSave={(input) => void save(input)} onClose={() => setForm({ ...form, open: false })} />
      )}
      <ConfirmDialog
        open={asking}
        title={archiving ? `Archive "${archiving.word}"?` : ''}
        confirmLabel="Archive Word"
        pending={busyId !== null && busyId === archiving?.id}
        onConfirm={() => void archive()}
        onClose={() => setAsking(false)}
      >
        Customers&apos; chat messages and reviews stop being checked for this word. You can undo it right after, or restore it later from the Archived tab.
      </ConfirmDialog>
    </section>
  )
}
