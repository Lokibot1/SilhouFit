import { useEffect, useState } from 'react'
import { PsgcError, type PsgcErrorKind } from '../service/psgc'

export type ListState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; kind: PsgcErrorKind }
  | { status: 'success'; data: T[] }

/** A PSGC list for `key` (null while there is nothing to load yet), with its own loading and error state. */
export function usePsgcList<T>(load: (signal: AbortSignal) => Promise<T[]>, key: string | null) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ id: string; data?: T[]; kind?: PsgcErrorKind } | null>(null)
  const id = `${key}#${attempt}`

  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    load(controller.signal).then(
      (data) => setResult({ id, data }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        setResult({ id, kind: error instanceof PsgcError ? error.kind : 'network' })
      },
    )
    return () => controller.abort()
    // `load` is a fresh closure each render; `key` is what names the list.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const state: ListState<T> =
    key === null
      ? { status: 'idle' }
      : result?.id !== id
        ? { status: 'loading' }
        : result.data
          ? { status: 'success', data: result.data }
          : { status: 'error', kind: result.kind ?? 'network' }

  return { state, retry: () => setAttempt((n) => n + 1) }
}
