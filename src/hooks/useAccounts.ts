import { useCallback, useEffect, useState } from 'react'
import { subscribeAccounts } from '../service/accountStore'
import type { RequestOptions } from '../service/simulateRequest'
import type { AccountStatus } from '../types/accounts'
import { ACCOUNT_PER_PAGE, type AccountDir, type AccountPage, type AccountSort } from '../utils/accountQuery'
import { useDebouncedValue } from './useDebouncedValue'
import { useSection } from './useSection'

type Lister<T> = (query: { search?: string; status?: AccountStatus; sort: AccountSort; dir: AccountDir; page: number; limit: number }, options: RequestOptions) => Promise<AccountPage<T>>

/** One tab's list: `expectedTotal` (when the tab knows how many accounts it has) sizes the loading skeleton so the rows do not jump when they arrive. Search (debounced), status filter, sort and page, loaded as its own section. The list loads again when the saved accounts change, here or in another tab. */
export function useAccounts<T>(list: Lister<T>, defaultSort: AccountSort = 'name', expectedTotal?: number) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<AccountStatus | ''>('')
  const [sorted, setSorted] = useState<{ sort: AccountSort; dir: AccountDir }>({ sort: defaultSort, dir: 'asc' })
  const [page, setPage] = useState(1)
  const [per, setPer] = useState<number>(ACCOUNT_PER_PAGE)
  const [version, setVersion] = useState(0)
  const search = useDebouncedValue(text.trim(), 300)

  useEffect(() => {
    const unsubscribe = subscribeAccounts(() => setVersion((n) => n + 1))
    return () => void unsubscribe()
  }, [])

  const load = useCallback(
    (options: RequestOptions) => list({ search: search || undefined, status: status || undefined, ...sorted, page, limit: per }, options),
    // A new version is a new request, though it is not read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [list, search, status, sorted, page, per, version],
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
    setStatus: (value: AccountStatus | '') => {
      setStatus(value)
      setPage(1)
    },
    sorted,
    sortBy: (sort: AccountSort) => {
      setSorted((old) => ({ sort, dir: old.sort === sort && old.dir === 'asc' ? 'desc' : 'asc' }))
      setPage(1)
    },
    skeletonRows: Math.min(per, expectedTotal ?? per),
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

export type AccountsList<T> = ReturnType<typeof useAccounts<T>>
