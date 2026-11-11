import { useCallback, useEffect, useState } from 'react'
import { getHelpAnswers, HELP_PER_PAGE, listHelpAnswers, subscribeHelpAnswers, type HelpCategory } from '../service/helpAnswers'
import type { RequestOptions } from '../service/simulateRequest'
import { useDebouncedValue } from './useDebouncedValue'
import { useSection } from './useSection'

/** The help answers list: search (debounced), topic filter and page, loaded as its own section. The list loads again when the answers change. */
export function useHelpAnswers() {
  const [text, setText] = useState('')
  const [category, setCategory] = useState<HelpCategory | ''>('')
  const [page, setPage] = useState(1)
  const [per, setPer] = useState<number>(HELP_PER_PAGE)
  const [version, setVersion] = useState(0)
  const search = useDebouncedValue(text.trim(), 300)

  useEffect(() => {
    const unsubscribe = subscribeHelpAnswers(() => setVersion((n) => n + 1))
    return () => void unsubscribe()
  }, [])

  const load = useCallback(
    (options: RequestOptions) => listHelpAnswers({ search: search || undefined, category: category || undefined, page, limit: per, ...options }),
    // A new version is a new request, though it is not read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [search, category, page, per, version],
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
    category,
    setCategory: (value: HelpCategory | '') => {
      setCategory(value)
      setPage(1)
    },
    /** As many placeholder rows as the first page will have, so the rows do not jump when they arrive. */
    skeletonRows: Math.min(per, getHelpAnswers().length),
    page,
    setPage,
    per,
    setPer: (value: number) => {
      setPer(value)
      setPage(1)
    },
    filtered: Boolean(search || category),
    clear: () => {
      setText('')
      setCategory('')
      setPage(1)
    },
  }
}

export type HelpAnswersList = ReturnType<typeof useHelpAnswers>
