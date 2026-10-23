import { ChevronDownIcon, ChevronUpIcon, SortIcon } from '../../form/icons'
import { TH } from './layout'

interface SortHeaderProps<C extends string> {
  label: string
  column: C
  active: { sort: C; dir: 'asc' | 'desc' }
  onSort: (column: C) => void
}

/** `C` is the page's own union of sortable columns. */
export function SortHeader<C extends string>({ label, column, active, onSort }: SortHeaderProps<C>) {
  const on = active.sort === column
  const Arrow = !on ? SortIcon : active.dir === 'asc' ? ChevronUpIcon : ChevronDownIcon
  return (
    <th scope="col" aria-sort={on ? (active.dir === 'asc' ? 'ascending' : 'descending') : undefined} className={TH}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`-mx-2 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-xl px-2 hover:text-chrome-strong`}
      >
        {label}
        <Arrow className={on ? 'text-fg' : 'text-fg-muted'} />
      </button>
    </th>
  )
}
