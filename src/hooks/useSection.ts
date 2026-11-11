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
 * (say, for another filter) shows the loading state at once and drops the previous request's answer (still offered as `previous`, also if the new request fails).
 */
export function useSection<T>(fetcher: (options: RequestOptions) => Promise<T>) {
  const [answer, setAnswer] = useState<{ for: typeof fetcher; state: SectionState<T>; last?: T }>({ for: fetcher, state: LOADING })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetcher({ signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setAnswer({ for: fetcher, state: { status: 'success', data }, last: data })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setAnswer((old) => ({ for: fetcher, state: { status: 'error', kind: errorKind(error) }, last: old.last }))
      },
    )
    return () => controller.abort()
  }, [fetcher, attempt])

  function retry() {
    setAnswer((old) => ({ for: fetcher, state: LOADING, last: old.last }))
    setAttempt((n) => n + 1)
  }

  /** Puts a background read's answer on screen in place: no loading state, and dropped if the fetcher changed since it was asked. */
  function swap(data: T) {
    setAnswer((old) => (old.for === fetcher ? { for: fetcher, state: { status: 'success', data }, last: data } : old))
  }

  const current = answer.for === fetcher
  const state = current ? answer.state : LOADING
  // The last good answer for an earlier fetcher, so a page can keep it on screen while the next one loads or fails.
  const previous = state.status === 'success' ? undefined : answer.last
  return { state, previous, retry, swap }
}
