import { useState } from 'react'
import { ArFitBreakdown } from '../../components/admin/ar/ArFitBreakdown'
import { ArNotReadyList } from '../../components/admin/ar/ArNotReadyList'
import { ArSessionsChart } from '../../components/admin/ar/ArSessionsChart'
import { ArSizeAgreement } from '../../components/admin/ar/ArSizeAgreement'
import { ArSummaryCards } from '../../components/admin/ar/ArSummaryCards'
import { ArTopProductsTable } from '../../components/admin/ar/ArTopProductsTable'
import { PeriodSegments, YearSelect } from '../../components/staff/PeriodFilter'
import { SampleDataBadge } from '../../components/ui/SampleDataBadge'
import { SAMPLE_DATA } from '../../service/fetchStaffAnalytics'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { defaultFilter, resolvePeriod } from '../../utils/period'

const META_DESCRIPTION =
  'See how shoppers use AR Fitting: sessions over time, the products tried on most, how the fit turned out, and whether shoppers bought the size we recommended.'

/** How AR Fitting is used and whether it leads to purchases. One period filter at the top sets every section. */
export function ArInsightsPage() {
  useDocumentTitle('AR Fitting Insights — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const [filter, setFilter] = useState(defaultFilter)

  return (
    <div className="grid gap-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-2xl text-fg sm:text-3xl">AR Fitting Insights</h1>
            {SAMPLE_DATA && <SampleDataBadge reason="These figures are placeholders until the AR fitting analytics backend exists." />}
          </div>
          <p className="mt-1 text-xs text-fg-muted">How shoppers use AR Fitting · {resolvePeriod(filter).scope}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="w-full sm:w-80">
            <PeriodSegments name="AR Fitting Insights" value={filter} onChange={setFilter} />
          </div>
          <YearSelect name="AR Fitting Insights" value={filter} onChange={setFilter} />
        </div>
      </header>
      <ArSummaryCards filter={filter} />
      <ArSessionsChart filter={filter} />
      <div className="grid gap-3 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7 [&>section]:h-full">
          <ArTopProductsTable filter={filter} />
        </div>
        <div className="grid min-w-0 gap-3 xl:col-span-5 xl:grid-rows-2 [&>section]:h-full">
          <ArFitBreakdown filter={filter} />
          <ArSizeAgreement filter={filter} />
        </div>
      </div>
      <ArNotReadyList />
    </div>
  )
}
