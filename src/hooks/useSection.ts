import { useEffect, useState } from 'react'
import { errorKind, type SectionErrorKind } from '../components/staff/StaffSection'
import type { RequestOptions } from '../service/simulateRequest'

export type SectionState<T> =
  | { status: 'loading' }
  | { status: 'error'; kind: SectionErrorKind }
  | { status: 'success'; data: T }

const LOADING: SectionState<never> = { status: 'loading' }

/**
 * Loads one dashboard section on its own: abortable, with a retry. `fetcher` must be a stable function; a new one
 * (say, for another filter) shows the loading state at once and drops the previous request's answer.
 */
export function useSection<T>(fetcher: (options: RequestOptions) => Promise<T>) {
  const [answer, setAnswer] = useState<{ for: typeof fetcher; state: SectionState<T> }>({ for: fetcher, state: LOADING })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetcher({ signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setAnswer({ for: fetcher, state: { status: 'success', data } })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setAnswer({ for: fetcher, state: { status: 'error', kind: errorKind(error) } })
      },
    )
    return () => controller.abort()
  }, [fetcher, attempt])

  function retry() {
    setAnswer({ for: fetcher, state: LOADING })
    setAttempt((n) => n + 1)
  }

  return { state: answer.for === fetcher ? answer.state : LOADING, retry }
}
