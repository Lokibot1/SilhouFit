import { useCallback, useEffect, useState } from 'react'
import { listWords, PROFANITY_PER_PAGE, subscribeProfanity, type WordStatus } from '../service/profanity'
import type { RequestOptions } from '../service/simulateRequest'
import { useDebouncedValue } from './useDebouncedValue'
import { useSection } from './useSection'

/** The word list: search (debounced), status tab (opens on Active), language and page, loaded as its own section. It loads again after a word is added, changed, archived or restored. */
export function useProfanityWords() {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<WordStatus>('active')
  const [language, setLanguage] = useState('')
  const [page, setPage] = useState(1)
  const [per, setPer] = useState<number>(PROFANITY_PER_PAGE)
  const [version, setVersion] = useState(0)
  const search = useDebouncedValue(text.trim(), 300)

  useEffect(() => {
    const unsubscribe = subscribeProfanity(() => setVersion((n) => n + 1))
    return () => void unsubscribe()
  }, [])

  const load = useCallback(
    (options: RequestOptions) => listWords({ search: search || undefined, language: language || undefined, status, page, limit: per }, options),
    // A new version is a new request, though it is not read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [search, language, status, page, per, version],
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
    setStatus: (value: WordStatus) => {
      setStatus(value)
      setPage(1)
    },
    language,
    setLanguage: (value: string) => {
      setLanguage(value)
      setPage(1)
    },
    /** As many placeholder rows as a full page, so the rows do not jump when they arrive. */
    skeletonRows: per,
    page,
    setPage,
    per,
    setPer: (value: number) => {
      setPer(value)
      setPage(1)
    },
    filtered: Boolean(search || language),
    clear: () => {
      setText('')
      setLanguage('')
      setPage(1)
    },
  }
}

export type WordsList = ReturnType<typeof useProfanityWords>
