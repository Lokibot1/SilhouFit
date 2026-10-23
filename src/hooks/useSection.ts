import { useEffect, useState } from 'react'
import { errorKind, type SectionErrorKind } from '../components/staff/StaffSection'
import type { RequestOptions } from '../service/simulateRequest'

export type SectionState<T> =
  | { status: 'loading' }
  | { status: 'error'; kind: SectionErrorKind }
  | { status: 'success'; data: T }

/** Loads one dashboard section on its own: abortable, with a retry. `fetcher` must be a stable function. */
export function useSection<T>(fetcher: (options: RequestOptions) => Promise<T>) {
  const [state, setState] = useState<SectionState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetcher({ signal: controller.signal }).then(
      (data) => setState({ status: 'success', data }),
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', kind: errorKind(error) })
      },
    )
    return () => controller.abort()
  }, [fetcher, attempt])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  return { state, retry }
}
