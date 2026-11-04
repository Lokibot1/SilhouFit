import type { ReactNode } from 'react'
import type { SectionState } from '../../hooks/useSection'
import type { PeriodFilterValue } from '../../utils/period'
import { AlertIcon } from '../form/icons'
import { SECONDARY_BUTTON } from '../ui/buttonStyles'
import { FILTER_DESCRIPTION, FILTER_HEAD, PeriodSegments, YearSelect } from './PeriodFilter'
import { STAFF_SECTION } from './StaffSkeleton'

/** A dashboard card with its own heading, so each section can load, fail and retry on its own. With `filter` it also carries its own period and year. */
export function StaffSection({
  id,
  title,
  description,
  filter,
  action,
  children,
}: {
  id: string
  title: string
  description?: string
  filter?: { name: string; value: PeriodFilterValue; onChange: (value: PeriodFilterValue) => void }
  /** A control on the right of the title row; the title and description shorten before it is pushed out. */
  action?: ReactNode
  children: ReactNode
}) {
  const heading = (
    <h2 id={id} className={`display text-xl text-fg ${action ? 'truncate' : ''}`}>
      {title}
    </h2>
  )
  return (
    <section aria-labelledby={id} className={STAFF_SECTION}>
      {filter ? (
        <div className={FILTER_HEAD}>
          {heading}
          <YearSelect {...filter} />
          {description && (
            <p id={`${id}-desc`} className={`${FILTER_DESCRIPTION} truncate text-xs leading-4 text-fg-muted`}>
              {description}
            </p>
          )}
          <PeriodSegments {...filter} />
        </div>
      ) : (
        <div className={action ? 'mb-3 flex items-center justify-between gap-3' : 'mb-3'}>
          <div className={action ? 'min-w-0' : undefined}>
            {heading}
            {description && (
              <p id={`${id}-desc`} className="mt-0.5 truncate text-xs leading-4 text-fg-muted">
                {description}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export type SectionErrorKind = 'network' | 'rate-limit' | 'not-found' | 'server' | 'forbidden' | 'validation' | 'conflict' | 'simulated'

const WHY: Record<SectionErrorKind, string> = {
  network: 'The connection dropped before we got a response. Check your connection, then try again.',
  'rate-limit': 'Our servers are limiting requests right now. Wait a minute, then try again.',
  'not-found': 'The server could not find what was asked for. Try again.',
  server: 'Something went wrong on our side. Try again in a moment.',
  forbidden: 'Your account is not allowed to see this. Sign in again, or ask an admin for access.',
  validation: 'The server could not use that request. Reload the page, then try again.',
  conflict: 'Someone else changed this at the same time. Reload the page, then try again.',
  simulated: 'Chat needs a real signed-in account. Saved dev accounts have no session with the server, so sign out and sign in with a real account.',
}

export function SectionError({ what, kind, onRetry }: { what: string; kind: SectionErrorKind; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3">
      <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fg">We couldn&apos;t load {what}.</p>
        <p className="mt-1 text-sm text-fg-muted">{WHY[kind]}</p>
        <button type="button" onClick={onRetry} className={`${SECONDARY_BUTTON} mt-4`}>
          Retry
        </button>
      </div>
    </div>
  )
}

/** Pulls the kind off a rejected fetch; anything unexpected reads as a server fault. */
export const errorKind = (error: unknown): SectionErrorKind => {
  const kind = (error as { kind?: string } | null)?.kind
  return kind && Object.hasOwn(WHY, kind) ? (kind as SectionErrorKind) : 'server'
}

/** The loading and error states every dashboard section shares; `children` draws the loaded data (and its empty state). */
export function SectionBody<T>({
  section,
  what,
  skeleton,
  errorClassName,
  children,
}: {
  section: { state: SectionState<T>; retry: () => void }
  /** Fills "We couldn't load ___." */
  what: string
  skeleton: ReactNode
  /** Boxes the error when the section has no card of its own. */
  errorClassName?: string
  children: (data: T) => ReactNode
}) {
  const { state, retry } = section
  if (state.status === 'loading') return skeleton
  if (state.status === 'error') {
    const error = <SectionError what={what} kind={state.kind} onRetry={retry} />
    return errorClassName ? <div className={errorClassName}>{error}</div> : error
  }
  return children(state.data)
}

/** A section with nothing to show yet: what is missing, and what makes it appear. */
export const EmptyNote = ({ children }: { children: ReactNode }) => <p className="text-sm text-fg-muted">{children}</p>
