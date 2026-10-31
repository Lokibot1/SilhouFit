import { MAX_REFUND_SEARCH, REFUND_PER_PAGE_OPTIONS } from '../../../service/refunds'
import { SearchIcon, XIcon } from '../../form/icons'
import { PRIMARY_BUTTON_SM, SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { Select } from '../../ui/Select'

/** Placeholders sit clearly dimmer than typed text yet stay above 4.5:1 on the page colour in both themes. */
const PLACEHOLDER = 'placeholder:text-[color-mix(in_srgb,var(--fg-muted)_85%,var(--canvas))] dark:placeholder:text-[color-mix(in_srgb,var(--fg-muted)_72%,var(--canvas))]'
const PER_PAGE_CHOICES = REFUND_PER_PAGE_OPTIONS.map((n) => ({ value: n, label: `${n} per page` }))

interface RefundsToolbarProps {
  text: string
  onText: (text: string) => void
  per: number
  onPer: (per: number) => void
  /** Whether the checkboxes show; they stay hidden until the admin chooses to select requests. */
  selecting: boolean
  onSelecting: (selecting: boolean) => void
  /** Pending requests ticked on this page. */
  selected: number
  onApproveSelected: () => void
}

export function RefundsToolbar({ text, onText, per, onPer, selecting, onSelecting, selected, onApproveSelected }: RefundsToolbarProps) {
  return (
    <div className="mb-3 grid gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
        <input
          type="text"
          value={text}
          onChange={(event) => onText(event.target.value)}
          maxLength={MAX_REFUND_SEARCH}
          placeholder="Request, order, customer or staff"
          aria-label="Search refund requests by request number, order, customer or staff"
          autoComplete="off"
          spellCheck={false}
          className={`font-ui min-h-11 w-full rounded-xl border border-line-strong bg-canvas pr-11 pl-10 text-base text-fg ${PLACEHOLDER}`}
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
        <button type="button" onClick={() => onSelecting(!selecting)} className={SECONDARY_BUTTON_SM}>
          {selecting ? 'Done selecting' : 'Select requests'}
        </button>
        {selected > 0 && (
          <div className="flex w-full items-center justify-between gap-3 @sm:ml-auto @sm:w-auto">
            <p role="status" className="text-sm font-semibold text-fg tabular-nums">
              {selected} selected
            </p>
            <button type="button" onClick={onApproveSelected} className={PRIMARY_BUTTON_SM}>
              Approve selected
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
