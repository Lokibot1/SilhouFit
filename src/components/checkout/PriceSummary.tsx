import { formatPeso } from '../../utils/format'
import type { Totals } from '../../utils/checkout'

/** The order total, line by line, in tabular numbers on the right. */
export function PriceSummary({ totals, itemCount }: { totals: Totals; itemCount: number }) {
  const row = 'flex items-baseline justify-between gap-4 text-base text-fg-muted'
  return (
    <dl className="space-y-2">
      <div className={row}>
        <dt>Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})</dt>
        <dd className="text-right tabular-nums text-fg">{formatPeso(totals.subtotal)}</dd>
      </div>
      {totals.discount > 0 && (
        <div className={row}>
          <dt>Sale discount</dt>
          <dd className="text-right tabular-nums text-success">−{formatPeso(totals.discount)}</dd>
        </div>
      )}
      <div className={row}>
        <dt>Shipping</dt>
        <dd className="text-right tabular-nums text-fg">{totals.shipping === 0 ? 'Free' : formatPeso(totals.shipping)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3 text-fg">
        <dt className="text-base font-semibold">Total</dt>
        <dd className="text-right text-2xl font-semibold tabular-nums">{formatPeso(totals.total)}</dd>
      </div>
    </dl>
  )
}
