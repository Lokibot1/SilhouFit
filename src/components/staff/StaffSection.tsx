import type { ReactNode } from 'react'
import type { SectionState } from '../../hooks/useSection'
import { AlertIcon } from '../form/icons'
import { SECONDARY_BUTTON } from '../ui/buttonStyles'
import { STAFF_SECTION } from './StaffSkeleton'

/** A dashboard card with its own heading, so each section can load, fail and retry on its own. */
export function StaffSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={STAFF_SECTION}>
      <div className="mb-3">
        <h2 id={id} className="display text-xl text-fg">
          {title}
        </h2>
        {description && (
          <p id={`${id}-desc`} className="mt-0.5 truncate text-xs leading-4 text-fg-muted">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

export type SectionErrorKind = 'network' | 'rate-limit' | 'not-found' | 'server'

const WHY: Record<SectionErrorKind, string> = {
  network: 'The connection dropped before we got a response. Check your connection, then try again.',
  'rate-limit': 'Our servers are limiting requests right now. Wait a minute, then try again.',
  'not-found': 'The server could not find what was asked for. Try again.',
  server: 'Something went wrong on our side. Try again in a moment.',
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
export const errorKind = (error: unknown): SectionErrorKind => (error as { kind?: SectionErrorKind } | null)?.kind ?? 'server'

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
