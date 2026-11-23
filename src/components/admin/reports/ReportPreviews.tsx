import { useCallback } from 'react'
import { useSection } from '../../../hooks/useSection'
import { loadSalesReport, loadStockOverview } from '../../../service/reports'
import type { RequestOptions } from '../../../service/simulateRequest'
import { formatPeso } from '../../../utils/format'
import type { PeriodFilterValue } from '../../../utils/period'
import { SalesChart } from '../../staff/SalesChart'
import { EmptyNote, SectionBody } from '../../staff/StaffSection'

// What a report holds, shown on its card before it is downloaded: the headline figures the file opens with, and one chart of them.

function Figures({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-3">
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="truncate text-xs text-fg-muted">{label}</dt>
          <dd className="mt-0.5 truncate text-lg font-semibold text-fg tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const FiguresSkeleton = () => (
  <div role="status" aria-label="Loading the figures" className="grid animate-pulse grid-cols-3 gap-3">
    {[0, 1, 2].map((n) => (
      <div key={n}>
        <div className="h-4 w-20 rounded-xl bg-line" />
        <div className="mt-1 h-7 w-24 rounded-xl bg-line" />
      </div>
    ))}
  </div>
)

/** The sales report's opening figures for the card's period, then the sales chart for it. */
export function SalesPreview({ filter }: { filter: PeriodFilterValue }) {
  const { period, year } = filter
  const fetcher = useCallback((options: RequestOptions) => loadSalesReport({ period, year }, options), [period, year])
  const section = useSection(fetcher)
  return (
    <div className="grid gap-4">
      <SectionBody section={section} what="the sales figures" skeleton={<FiguresSkeleton />}>
        {(report) => (
          <Figures
            items={[
              { label: 'Revenue', value: formatPeso(report.revenue) },
              { label: 'Orders placed', value: report.orders.toLocaleString('en-PH') },
              { label: 'Top seller', value: report.bestSellers[0]?.name ?? 'None yet' },
            ]}
          />
        )}
      </SectionBody>
      <SalesChart filter={filter} />
    </div>
  )
}

const STATUS = [
  { key: 'inStock', label: 'In stock', bar: 'bg-success' },
  { key: 'low', label: 'Low stock', bar: 'bg-warning' },
  { key: 'out', label: 'Sold out', bar: 'bg-danger' },
] as const

/** The inventory report's opening figures, and one bar splitting the products into in stock, low and sold out. Text labels carry the meaning, not colour alone. */
export function InventoryPreview() {
  const section = useSection(loadStockOverview)
  return (
    <SectionBody section={section} what="the stock figures" skeleton={<FiguresSkeleton />}>
      {(stock) =>
        stock.products === 0 ? (
          <EmptyNote>No products yet. Stock shows here once the first product is added.</EmptyNote>
        ) : (
          <div className="grid gap-4">
            <Figures items={STATUS.map(({ key, label }) => ({ label, value: stock[key].toLocaleString('en-PH') }))} />
            <div>
              <div
                role="img"
                aria-label={`${stock.products} products: ${STATUS.map(({ key, label }) => `${stock[key]} ${label.toLowerCase()}`).join(', ')}`}
                className="flex h-4 gap-0.5 overflow-hidden rounded-xl"
              >
                {STATUS.map(({ key, bar }) => (stock[key] > 0 ? <span key={key} className={bar} style={{ flexGrow: stock[key] }} /> : null))}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
                {STATUS.map(({ key, label, bar }) => (
                  <li key={key} className="flex items-center gap-1.5">
                    <span aria-hidden="true" className={`size-2.5 rounded-full ${bar}`} />
                    {label} {Math.round((stock[key] / stock.products) * 100)}%
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-fg-muted">Products out of {stock.products.toLocaleString('en-PH')}. The file lists every size.</p>
            </div>
          </div>
        )
      }
    </SectionBody>
  )
}
