import { useState } from 'react'
import { ReportCard } from '../../components/admin/reports/ReportCard'
import { InventoryPreview, SalesPreview, TransactionsPreview } from '../../components/admin/reports/ReportPreviews'
import { PeriodSegments, YearSelect } from '../../components/staff/PeriodFilter'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { loadInventoryReport, loadSalesReport, loadTransactionsReport } from '../../service/reports'
import { defaultFilter, resolvePeriod } from '../../utils/period'
import { inventoryDoc, salesDoc, transactionsDoc } from '../../utils/reportDoc'

const META_DESCRIPTION = 'Download the sales, transactions and inventory reports as Excel or PDF files, branded for SilhouFit and KRAL, ready to print or share.'

/** Downloadable reports. Only figures the store really records are offered: sales, orders and best sellers, and stock per size. */
export function ReportsPage() {
  useDocumentTitle('Reports — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const [filter, setFilter] = useState(defaultFilter)
  const [txFilter, setTxFilter] = useState(defaultFilter)

  return (
    <div className="grid gap-3">
      <header>
        <h1 className="display text-2xl text-fg sm:text-3xl">Reports</h1>
        <p className="mt-1 text-xs text-fg-muted">Download figures as Excel or PDF files</p>
      </header>
      {/* Bento: Sales is tall (it holds the chart), so it spans both rows of the left column while Transactions and Inventory stack on the right. */}
      <div className="grid items-stretch gap-3 lg:grid-cols-2">
        <div className="grid grid-rows-1 lg:row-span-2">
          <ReportCard
            title="Sales report"
            description={`Orders, revenue and best sellers by day, week or month. Revenue and best sellers cover ${resolvePeriod(filter).scope}.`}
            controls={
              <>
                <div className="w-full sm:w-80">
                  <PeriodSegments name="Sales report" value={filter} onChange={setFilter} disabled={['quarter', 'year']} />
                </div>
                <YearSelect name="Sales report" value={filter} onChange={setFilter} />
              </>
            }
            preview={<SalesPreview filter={filter} />}
            includes={['Sales by period', 'Best sellers', 'Units sold by category']}
            load={async () => salesDoc(await loadSalesReport(filter))}
          />
        </div>
        <ReportCard
          title="Transactions report"
          description={`Every payment with its status, method, fees and net amount. Covers ${resolvePeriod(txFilter).scope}.`}
          controls={
            <>
              <div className="w-full sm:w-80">
                <PeriodSegments name="Transactions report" value={txFilter} onChange={setTxFilter} />
              </div>
              <YearSelect name="Transactions report" value={txFilter} onChange={setTxFilter} />
            </>
          }
          preview={<TransactionsPreview filter={txFilter} />}
          includes={['Payments by status', 'Paid volume, fees and net', 'Every transaction in the period']}
          load={async () => transactionsDoc(await loadTransactionsReport(txFilter))}
        />
        <ReportCard
          title="Inventory report"
          description="Stock for every product and size, with low-stock alerts and sold-out sizes. It reflects stock right now."
          preview={<InventoryPreview />}
          includes={['Low-stock alerts', 'Sold-out sizes', 'Stock per product and size']}
          load={async () => inventoryDoc(await loadInventoryReport())}
        />
      </div>
    </div>
  )
}
