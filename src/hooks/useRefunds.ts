import { useCallback, useEffect, useState } from 'react'
import { getRefunds, listRefunds, REFUND_PER_PAGE, subscribeRefunds, type RefundDir, type RefundSort, type RefundStatus } from '../service/refunds'
import type { RequestOptions } from '../service/simulateRequest'
import { useDebouncedValue } from './useDebouncedValue'
import { useSection } from './useSection'

/** The refund requests list: search (debounced), status filter, sort and page, loaded as its own section. The list loads again when a request is decided. */
export function useRefunds() {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<RefundStatus | ''>('')
  const [sorted, setSorted] = useState<{ sort: RefundSort; dir: RefundDir }>({ sort: 'requestedAt', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [per, setPer] = useState<number>(REFUND_PER_PAGE)
  const [version, setVersion] = useState(0)
  const search = useDebouncedValue(text.trim(), 300)

  useEffect(() => {
    const unsubscribe = subscribeRefunds(() => setVersion((n) => n + 1))
    return () => void unsubscribe()
  }, [])

  const load = useCallback(
    (options: RequestOptions) => listRefunds({ search: search || undefined, status: status || undefined, ...sorted, page, limit: per, ...options }),
    // A new version is a new request, though it is not read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [search, status, sorted, page, per, version],
  )
  const { state, previous, retry } = useSection(load)
  const result = state.status === 'success' ? state.data : previous

  return {
    state,
    retry,
    result,
    /** The rows shown are from the previous request. */
    stale: state.status === 'loading' && result !== undefined,
    text,
    setText: (value: string) => {
      setText(value)
      setPage(1)
    },
    status,
    setStatus: (value: RefundStatus | '') => {
      setStatus(value)
      setPage(1)
    },
    sorted,
    sortBy: (sort: RefundSort) => {
      setSorted((old) => ({ sort, dir: old.sort === sort && old.dir === 'asc' ? 'desc' : 'asc' }))
      setPage(1)
    },
    /** As many placeholder rows as the first page will have, so the rows do not jump when they arrive. */
    skeletonRows: Math.min(per, getRefunds().length),
    page,
    setPage,
    per,
    setPer: (value: number) => {
      setPer(value)
      setPage(1)
    },
    filtered: Boolean(search || status),
    clear: () => {
      setText('')
      setStatus('')
      setPage(1)
    },
  }
}

export type RefundsList = ReturnType<typeof useRefunds>
