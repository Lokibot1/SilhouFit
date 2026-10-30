import { MAX_PROMO_SEARCH, PROMO_PER_PAGE_OPTIONS } from '../../../service/promotions'
import { PlusIcon, SearchIcon, XIcon } from '../../form/icons'
import { PRIMARY_BUTTON } from '../../ui/buttonStyles'
import { Select } from '../../ui/Select'

const PER_PAGE_CHOICES = PROMO_PER_PAGE_OPTIONS.map((n) => ({ value: n, label: `${n} per page` }))

interface PromotionsToolbarProps {
  text: string
  onText: (text: string) => void
  per: number
  onPer: (per: number) => void
  onCreate: () => void
}

export function PromotionsToolbar({ text, onText, per, onPer, onCreate }: PromotionsToolbarProps) {
  return (
    <div className="mb-3 grid gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
        <input
          type="text"
          value={text}
          onChange={(event) => onText(event.target.value)}
          maxLength={MAX_PROMO_SEARCH}
          placeholder="Name or code"
          aria-label="Search promotions by name or code"
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
          <Select label="Rows per page" value={per} options={PER_PAGE_CHOICES} onChange={onPer} />
        </div>
        <button type="button" onClick={onCreate} className={`${PRIMARY_BUTTON} w-full @sm:ml-auto @sm:w-auto`}>
          <PlusIcon />
          Create promotion
        </button>
      </div>
    </div>
  )
}
