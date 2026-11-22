import { useCallback, useEffect, useState } from 'react'
import { clearCategoryMeasurements, fetchCategoryMeasurements, type SizeMeasurement } from '../service/sizeMeasurements'

/**
 * A category's active base rows, from the shared cache (one request per category). `status` is 'loading' until they arrive, 'failed' when
 * they could not be read, and 'ready' otherwise; a 404 (the API answers it until it ships) is ready with no rows. Without a category it
 * is 'ready' with none and nothing is fetched. `reload` drops the shared cache and reads them again (after a row was added elsewhere).
 */
export function useBaseMeasurements(category: string | undefined) {
  const [loaded, setLoaded] = useState<{ category: string; rows: SizeMeasurement[]; failed: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!category) return
    let ignore = false
    fetchCategoryMeasurements(category).then(
      (rows) => !ignore && setLoaded({ category, rows, failed: false }),
      (error: unknown) => !ignore && setLoaded({ category, rows: [], failed: (error as { kind?: string } | null)?.kind !== 'not-found' }),
    )
    return () => {
      ignore = true
    }
  }, [category, attempt])

  const reload = useCallback(() => {
    clearCategoryMeasurements()
    setLoaded(null)
    setAttempt((n) => n + 1)
  }, [])

  if (!category) return { rows: [], status: 'ready' as const, reload }
  if (loaded?.category !== category) return { rows: [], status: 'loading' as const, reload }
  return { rows: loaded.rows, status: loaded.failed ? ('failed' as const) : ('ready' as const), reload }
}
