import type { ReactNode } from 'react'
import type { AccountStatus } from '../../../types/accounts'
import { ACCOUNT_PER_PAGE_OPTIONS, MAX_ACCOUNT_SEARCH } from '../../../utils/accountQuery'
import { SearchIcon, XIcon } from '../../form/icons'
import { Select } from '../../ui/Select'

const PER_PAGE_CHOICES = ACCOUNT_PER_PAGE_OPTIONS.map((n) => ({ value: n, label: `${n} per page` }))

interface AccountToolbarProps {
  /** What the search box looks through: "customers", "staff". */
  noun: string
  text: string
  onText: (text: string) => void
  /** The status filter; a tab without statuses (staff) leaves all three out and the filter is not shown. */
  status?: AccountStatus | ''
  onStatus?: (status: AccountStatus | '') => void
  statuses?: { value: AccountStatus | ''; label: string }[]
  per: number
  onPer: (per: number) => void
  /** The create button, when the tab has one. */
  action?: ReactNode
}

export function AccountToolbar({ noun, text, onText, status, onStatus, statuses, per, onPer, action }: AccountToolbarProps) {
  return (
    <div className="mb-3 grid gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
        <input
          type="text"
          value={text}
          onChange={(event) => onText(event.target.value)}
          maxLength={MAX_ACCOUNT_SEARCH}
          placeholder="Name, email or phone"
          aria-label={`Search ${noun} by name, username, email or phone`}
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
        {statuses && onStatus && (
          <div className="w-full @sm:w-44">
            <Select label="Status" triggerPrefix="Status: " value={status ?? ''} options={statuses} onChange={onStatus} />
          </div>
        )}
        <div className="w-full @sm:w-44">
          <Select label="Rows per page" value={per} options={PER_PAGE_CHOICES} onChange={onPer} />
        </div>
        {action && <div className="w-full @sm:ml-auto @sm:w-auto [&>button]:w-full @sm:[&>button]:w-auto">{action}</div>}
      </div>
    </div>
  )
}
