import { useEffect, useState } from 'react'
import type { ProductListError } from '../../service/fetchProductList'

/** Try again; after a 429 it waits out the server's Retry-After first, since asking sooner only spends the budget that ran out. */
export function RetryButton({ error, onRetry, className }: { error: ProductListError | null; onRetry: () => void; className: string }) {
  const [wait, setWait] = useState(error?.kind === 'rate-limit' ? Math.ceil((error.retryAfterMs ?? 15_000) / 1000) : 0)
  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((n) => n - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])
  return (
    <button type="button" disabled={wait > 0} onClick={onRetry} className={`${className} tabular-nums`}>
      {wait > 0 ? `Try again in ${wait}s` : 'Try again'}
    </button>
  )
}
