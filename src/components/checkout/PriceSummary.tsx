import type { ReactNode } from 'react'
import { formatPeso } from '../../utils/format'
import type { Totals } from '../../utils/checkout'

/** The order total, line by line, in tabular numbers on the right. `tone="kral"` sets it in the KRAL mono type. `shipping` replaces the fee while it is not known, and the total then shows a dash. */
export function PriceSummary({ totals, itemCount, tone, shipping }: { totals: Totals; itemCount: number; tone?: 'kral'; shipping?: ReactNode }) {
  const kral = tone === 'kral'
  const row = `flex items-baseline justify-between gap-4 text-base ${kral ? 'font-kral-mono text-kral-muted' : 'text-fg-muted'}`
  const value = `text-right tabular-nums ${kral ? 'text-kral-fg' : 'text-fg'}`
  return (
    <dl className="space-y-2">
      <div className={row}>
        <dt>Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})</dt>
        <dd className={value}>{formatPeso(totals.subtotal)}</dd>
      </div>
      {totals.discount > 0 && (
        <div className={row}>
          <dt>Sale discount</dt>
          <dd className="text-right tabular-nums text-success">−{formatPeso(totals.discount)}</dd>
        </div>
      )}
      <div className={row} aria-live="polite">
        <dt>Shipping</dt>
        <dd className={value}>{shipping ?? (totals.shipping === 0 ? 'Free' : formatPeso(totals.shipping))}</dd>
      </div>
      <div className={`flex items-baseline justify-between gap-4 border-t pt-3 ${kral ? 'font-kral-mono border-kral-rule text-kral-fg' : 'border-line text-fg'}`}>
        <dt className={`text-base ${kral ? 'font-medium uppercase' : 'font-semibold'}`}>Total</dt>
        <dd className={`text-right text-2xl tabular-nums ${kral ? 'font-medium' : 'font-semibold'}`}>{shipping ? '—' : formatPeso(totals.total)}</dd>
      </div>
    </dl>
  )
}
