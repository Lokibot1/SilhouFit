import { TABLE_ROW, TD } from '../../staff/inventory/layout'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'

/** The mobile card's height: the loaded card and its placeholder share it, so nothing jumps when the rows arrive. */
export const HELP_CARD_ROW = 'h-52'

/** Table columns: number, question, topic, status, updated, actions. */
export const HELP_CELLS = 6

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

export function HelpTableSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <tr key={n} className={`${TABLE_ROW} animate-pulse`}>
      {Array.from({ length: HELP_CELLS }, (_, c) => (
        <td key={c} className={TD}>
          <Bar className={`h-5 ${c === 1 ? 'w-5/6' : 'w-3/4'}`} />
        </td>
      ))}
    </tr>
  ))
}

export function HelpCardSkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, n) => (
    <li key={n} className={`${HELP_CARD_ROW} flex animate-pulse flex-col justify-center py-2`}>
      <div className="flex h-11 items-center">
        <Bar className="h-6 w-5/6" />
      </div>
      <div className="flex h-6 items-center">
        <Bar className="h-5 w-2/3" />
      </div>
      <div className="flex h-11 items-center">
        <Bar className="h-6 w-1/2" />
      </div>
      <div className="flex h-6 items-center">
        <Bar className="h-5 w-3/4" />
      </div>
      <div className="flex h-11 items-center justify-end">
        <Bar className="h-9 w-44" />
      </div>
    </li>
  ))
}

/** The route fallback for Help Chatbot: title, then the list's toolbar and a few cards. */
export function HelpAnswersPageSkeleton() {
  return (
    <div role="status" aria-label="Loading Help Chatbot" className="grid animate-pulse gap-3">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <Bar className="h-8 w-56 max-w-full sm:h-9" />
        <Bar className="h-8 w-28" />
      </div>
      <section className={STAFF_SECTION}>
        <Bar className="mb-3 h-11 w-full" />
        <Bar className="mb-3 h-11 w-full @sm:w-44" />
        <ul className="divide-y divide-line border-y border-line">
          <HelpCardSkeletonRows count={4} />
        </ul>
      </section>
    </div>
  )
}
