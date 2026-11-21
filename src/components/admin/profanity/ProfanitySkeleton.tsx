import { PROFANITY_PER_PAGE } from '../../../service/profanity'
import { TABLE_ROW, TD, TH } from '../../staff/inventory/layout'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { TransactionPagerSkeleton } from '../../staff/TransactionsSkeleton'

export const WORD_HEADERS = ['Word', 'Language', 'Status', 'Updated', 'Actions'] as const
export const OFFENSE_HEADERS = ['Date', 'Customer', 'Source', 'Message', 'Matched words', 'Count'] as const

/** The height a word card and an offense row keep before and after the rows arrive. */
export const WORD_CARD_ROW = 'h-28'
export const OFFENSE_ROW = 'h-20'
export const OFFENSE_CARD_ROW = 'min-h-30'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

// Word, Language, Status badge, Updated and Actions (two 44px icon buttons).
const WORD_BARS = ['h-5 w-32', 'h-5 w-20', 'h-6 w-20', 'h-5 w-28', 'h-11 w-24']
// Date (two lines), Customer, Source, Message, Matched words and Count (right-aligned).
const OFFENSE_BARS = ['h-4 w-24', 'h-5 w-28', 'h-5 w-24', 'h-5 w-48', 'h-5 w-28', 'h-5 w-6 ml-auto']

export function WordTableSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <tr key={n} className={`${TABLE_ROW} animate-pulse`}>
      {WORD_BARS.map((bar, i) => (
        <td key={i} className={TD}>
          <Bar className={bar} />
        </td>
      ))}
    </tr>
  ))
}

export function WordCardSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <li key={n} className={`${WORD_CARD_ROW} flex animate-pulse flex-col justify-center py-2`}>
      <div className="flex h-6 items-center justify-between gap-3">
        <Bar className="h-5 w-1/3" />
        <Bar className="h-6 w-20" />
      </div>
      <div className="flex h-6 items-center">
        <Bar className="h-5 w-1/2" />
      </div>
      <div className="flex h-11 items-center justify-end">
        <Bar className="h-11 w-24" />
      </div>
    </li>
  ))
}

export function OffenseTableSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <tr key={n} className={`${OFFENSE_ROW} animate-pulse`}>
      {OFFENSE_BARS.map((bar, i) => (
        <td key={i} className={TD}>
          {i === 0 ? (
            <div className="grid gap-1">
              <Bar className={bar} />
              <Bar className="h-4 w-16" />
            </div>
          ) : (
            <Bar className={bar} />
          )}
        </td>
      ))}
    </tr>
  ))
}

export function OffenseCardSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <li key={n} className={`${OFFENSE_CARD_ROW} grid animate-pulse content-center gap-2 py-3`}>
      <Bar className="h-5 w-1/2" />
      <Bar className="h-5 w-full" />
      <Bar className="h-5 w-2/3" />
    </li>
  ))
}

const TAB_LABELS = ['Words', 'Offenses']
const WORD_TABS = ['Active', 'Archived', 'All']

/** The route fallback for the profanity page (it opens on Words): header, tabs, toolbar, list and pager at the sizes they have once loaded. */
export function ProfanityPageSkeleton() {
  return (
    <div role="status" aria-label="Loading Profanity Filter" className="grid animate-pulse gap-3">
      <div className="flex min-h-8 flex-wrap items-center gap-3">
        {/* The real title and line, hidden, so they wrap and measure the same. */}
        <div aria-hidden="true" className="min-w-0">
          <div className="display w-fit rounded-xl bg-line text-2xl text-transparent sm:text-3xl">Profanity Filter</div>
          <div className="mt-1 text-xs text-transparent">
            <span className="rounded-xl bg-line">The words that get hidden in chat and reviews, and who used them</span>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="font-ui inline-flex w-fit flex-wrap rounded-xl border border-line-strong bg-line p-0.5">
        {TAB_LABELS.map((label) => (
          <div key={label} className="flex h-11 min-w-16 items-center px-3 text-base font-semibold text-transparent md:h-8 md:text-sm">
            {label}
          </div>
        ))}
      </div>
      <section className={STAFF_SECTION}>
        <div aria-hidden="true" className="font-ui mb-3 inline-flex flex-wrap rounded-xl border border-line-strong bg-line p-0.5">
          {WORD_TABS.map((label) => (
            <div key={label} className="flex h-11 min-w-16 items-center px-3 text-base font-semibold text-transparent md:h-8 md:text-sm">
              {label}
            </div>
          ))}
        </div>
        <div className="mb-3 grid gap-3">
          <Bar className="h-11 w-full" />
          <div className="flex flex-wrap items-center gap-3">
            <Bar className="h-9 w-full max-md:h-11 pointer-coarse:h-11 @sm:w-44" />
            <Bar className="h-9 w-full max-md:h-11 pointer-coarse:h-11 @sm:w-44" />
            <Bar className="h-9 w-full max-md:h-11 pointer-coarse:h-11 @sm:ml-auto @sm:w-32" />
          </div>
        </div>
        <table className="hidden w-full border-separate border-spacing-0 whitespace-nowrap @4xl:table">
          <thead>
            <tr>
              {WORD_HEADERS.map((label) => (
                <th key={label} className={TH}>
                  <div className="h-11" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <WordTableSkeletonRows count={PROFANITY_PER_PAGE} />
          </tbody>
        </table>
        <ul className="divide-y divide-line border-y border-line @4xl:hidden">
          <WordCardSkeletonRows count={PROFANITY_PER_PAGE} />
        </ul>
        <TransactionPagerSkeleton />
      </section>
    </div>
  )
}
