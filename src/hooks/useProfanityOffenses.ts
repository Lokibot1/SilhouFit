import { useCallback, useState } from 'react'
import { listOffenses, PROFANITY_PER_PAGE, type OffenseSource } from '../service/profanity'
import type { RequestOptions } from '../service/simulateRequest'
import { useSection } from './useSection'

/** A date picked as YYYY-MM-DD, as local midnight or the last millisecond of that day. The API leaves out the day of a date-only end, so the end is sent as a time. */
const startOfDay = (date: string) => new Date(`${date}T00:00:00`).toISOString()
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999`).toISOString()

/** The offenses list: source and date range filters and page, loaded as its own section. */
export function useProfanityOffenses() {
  const [source, setSource] = useState<OffenseSource | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [per, setPer] = useState<number>(PROFANITY_PER_PAGE)
  /** A range that ends before it starts finds nothing; the page says so beside the dates. */
  const badRange = Boolean(from && to && from > to)

  const load = useCallback(
    (options: RequestOptions) =>
      listOffenses({ source: source || undefined, startDate: from ? startOfDay(from) : undefined, endDate: to ? endOfDay(to) : undefined, page, limit: per }, options),
    [source, from, to, page, per],
  )
  const { state, previous, retry } = useSection(load)
  const result = state.status === 'success' ? state.data : previous

  const reset = (apply: () => void) => {
    apply()
    setPage(1)
  }

  return {
    state,
    retry,
    result,
    /** The rows shown are from the previous request. */
    stale: state.status === 'loading' && result !== undefined,
    source,
    setSource: (value: OffenseSource | '') => reset(() => setSource(value)),
    from,
    setFrom: (value: string) => reset(() => setFrom(value)),
    to,
    setTo: (value: string) => reset(() => setTo(value)),
    badRange,
    skeletonRows: per,
    page,
    setPage,
    per,
    setPer: (value: number) => reset(() => setPer(value)),
    filtered: Boolean(source || from || to),
    clear: () =>
      reset(() => {
        setSource('')
        setFrom('')
        setTo('')
      }),
  }
}

export type OffensesList = ReturnType<typeof useProfanityOffenses>
