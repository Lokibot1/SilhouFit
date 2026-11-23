import { useEffect, useState } from 'react'
import { fetchTransactionTrend, type TrendStatuses } from '../service/adminTransactionsApi'

/** The card's trend: undefined while it loads, null when there is nothing to show (or `statuses` is null, so none is asked). Never an error. */
export function useTransactionTrend(statuses: TrendStatuses | null) {
  const [change, setChange] = useState<number | null>()
  useEffect(() => {
    if (!statuses) return
    const controller = new AbortController()
    fetchTransactionTrend(statuses, { signal: controller.signal }).then((next) => {
      if (!controller.signal.aborted) setChange(next)
    })
    return () => controller.abort()
  }, [statuses])
  return statuses ? change : null
}
