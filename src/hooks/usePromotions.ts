import { useCallback, useEffect, useState } from 'react'
import { getPromotions, listPromotions, PROMO_PER_PAGE, subscribePromotions, type PromoDir, type PromoSort, type PromoStatus } from '../service/promotions'
import type { RequestOptions } from '../service/simulateRequest'
import { useDebouncedValue } from './useDebouncedValue'
import { useSection } from './useSection'

/** The promotions list: search (debounced), status filter, sort and page, loaded as its own section. The list loads again when the promotions change. */
export function usePromotions() {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<PromoStatus | ''>('')
  const [sorted, setSorted] = useState<{ sort: PromoSort; dir: PromoDir }>({ sort: 'name', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [per, setPer] = useState<number>(PROMO_PER_PAGE)
  const [version, setVersion] = useState(0)
  const search = useDebouncedValue(text.trim(), 300)

  useEffect(() => {
    const unsubscribe = subscribePromotions(() => setVersion((n) => n + 1))
    return () => void unsubscribe()
  }, [])

  const load = useCallback(
    (options: RequestOptions) => listPromotions({ search: search || undefined, status: status || undefined, ...sorted, page, limit: per, ...options }),
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
    setStatus: (value: PromoStatus | '') => {
      setStatus(value)
      setPage(1)
    },
    sorted,
    sortBy: (sort: PromoSort) => {
      setSorted((old) => ({ sort, dir: old.sort === sort && old.dir === 'asc' ? 'desc' : 'asc' }))
      setPage(1)
    },
    /** As many placeholder rows as the first page will have, so the rows do not jump when they arrive. */
    skeletonRows: Math.min(per, getPromotions().length),
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

export type PromotionsList = ReturnType<typeof usePromotions>
