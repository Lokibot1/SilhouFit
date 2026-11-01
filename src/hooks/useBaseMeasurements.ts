import { useEffect, useState } from 'react'
import { fetchCategoryMeasurements, type SizeMeasurement } from '../service/sizeMeasurements'

/**
 * A category's active base rows, from the shared cache (one request per category). `status` is 'loading' until they arrive, 'failed' when
 * they could not be read, and 'ready' otherwise; a 404 (the API answers it until it ships) is ready with no rows. Without a category it
 * is 'ready' with none and nothing is fetched.
 */
export function useBaseMeasurements(category: string | undefined) {
  const [loaded, setLoaded] = useState<{ category: string; rows: SizeMeasurement[]; failed: boolean } | null>(null)

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
  }, [category])

  if (!category) return { rows: [], status: 'ready' as const }
  if (loaded?.category !== category) return { rows: [], status: 'loading' as const }
  return { rows: loaded.rows, status: loaded.failed ? ('failed' as const) : ('ready' as const) }
}
