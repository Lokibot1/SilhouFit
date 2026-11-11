import { HELP_CATEGORIES, HELP_CATEGORY_LABELS, HELP_PER_PAGE_OPTIONS, MAX_HELP_SEARCH, type HelpCategory } from '../../../service/helpAnswers'
import { PlusIcon, SearchIcon, XIcon } from '../../form/icons'
import { PRIMARY_BUTTON } from '../../ui/buttonStyles'
import { Select } from '../../ui/Select'

const PER_PAGE_CHOICES = HELP_PER_PAGE_OPTIONS.map((n) => ({ value: n, label: `${n} per page` }))
const TOPIC_CHOICES: { value: HelpCategory | 'all'; label: string }[] = [{ value: 'all', label: 'All topics' }, ...HELP_CATEGORIES.map((value) => ({ value, label: HELP_CATEGORY_LABELS[value] }))]

interface HelpAnswersToolbarProps {
  text: string
  onText: (text: string) => void
  category: HelpCategory | ''
  onCategory: (category: HelpCategory | '') => void
  per: number
  onPer: (per: number) => void
  onCreate: () => void
}

export function HelpAnswersToolbar({ text, onText, category, onCategory, per, onPer, onCreate }: HelpAnswersToolbarProps) {
  return (
    <div className="mb-3 grid gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
        <input
          type="text"
          value={text}
          onChange={(event) => onText(event.target.value)}
          maxLength={MAX_HELP_SEARCH}
          placeholder="Search questions"
          aria-label="Search questions"
          autoComplete="off"
          spellCheck={false}
          className="font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas pr-11 pl-10 text-base text-fg placeholder:text-fg-muted"
        />
        {text && (
          <button
            type="button"
            onClick={() => onText('')}
            aria-label="Clear search"
            className="absolute top-0 right-0 flex size-11 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:text-fg"
          >
            <XIcon />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full @sm:w-44">
          <Select label="Topic" value={category || 'all'} options={TOPIC_CHOICES} onChange={(value) => onCategory(value === 'all' ? '' : value)} />
        </div>
        <div className="w-full @sm:w-44">
          <Select label="Rows per page" value={per} options={PER_PAGE_CHOICES} onChange={onPer} />
        </div>
        <button type="button" onClick={onCreate} className={`${PRIMARY_BUTTON} w-full @sm:ml-auto @sm:w-auto`}>
          <PlusIcon />
          Add question
        </button>
      </div>
    </div>
  )
}
