import { useEffect, useMemo, useState } from 'react'
import type { CustomSizing } from '../service/customSizings'
import type { ProductVariant } from '../service/fetchProductList'
import { fetchCategoryMeasurements, type SizeMeasurement } from '../service/sizeMeasurements'
import { buildSizeGuide } from '../utils/sizeGuide'

/**
 * The size guide of a product, merged from its category's base measurements (or its custom sizing) and its own. Fetches only once `enabled` (the guide is open).
 * A 404 (the API answers it until it ships) is not an error here: the product's own measurements, if any, are shown, and `available` is
 * false when there is nothing at all. Any other failure (server, network) sets `failed`, and `retry` asks again.
 */
export function useSizeGuide(category: string, variants: ProductVariant[], enabled: boolean, customSizing?: CustomSizing) {
  const [loaded, setLoaded] = useState<{ category: string; rows: SizeMeasurement[]; failed: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let ignore = false
    fetchCategoryMeasurements(category).then(
      (rows) => !ignore && setLoaded({ category, rows, failed: false }),
      (error: unknown) => !ignore && setLoaded({ category, rows: [], failed: (error as { kind?: string } | null)?.kind !== 'not-found' }),
    )
    return () => {
      ignore = true
    }
  }, [category, enabled, attempt])

  const loading = enabled && loaded?.category !== category
  const guide = useMemo(() => buildSizeGuide(category, variants, loaded?.category === category ? loaded.rows : [], customSizing), [category, variants, loaded, customSizing])
  const retry = () => {
    setLoaded(null)
    setAttempt((n) => n + 1)
  }
  return { loading, guide, available: guide.rows.some((r) => r.source !== 'none'), failed: loaded?.category === category && loaded.failed, retry }
}
