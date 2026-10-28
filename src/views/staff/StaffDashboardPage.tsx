import type { ReactNode } from 'react'
import { OrderLog } from '../../components/staff/OrderLog'
import { ProductMixChart } from '../../components/staff/ProductMixChart'
import { SalesChart } from '../../components/staff/SalesChart'
import { StatCards } from '../../components/staff/StatCards'
import { TrendingItems } from '../../components/staff/TrendingItems'
import { Tooltip } from '../../components/ui/Tooltip'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { SAMPLE_DATA } from '../../service/fetchStaffAnalytics'
import { longDate } from '../../components/staff/StaffSkeleton'
import { useStaffMe } from './StaffLayout'

const META_DESCRIPTION =
  'Track sales this month, how many people tried the AR Fitting, products sold, the most ordered items and the latest orders on the SilhouFit staff dashboard.'

/** The dashboard's figures and charts, shared with the admin dashboard. `asideTop` stacks another tile above the order log, which then fills the rest of the column's height and scrolls. */
export function StaffDashboardWidgets({ asideTop }: { asideTop?: ReactNode }) {
  return (
    <>
      <StatCards />
      {/* Bento: sales over two half tiles on the left, the order log as a tall tile on the right (from xl). */}
      <div className="grid gap-3 xl:grid-cols-12">
        <div className="grid gap-3 xl:col-span-8 xl:grid-rows-[auto_1fr]">
          <SalesChart />
          <div className="grid gap-3 md:grid-cols-2 [&>section]:h-full">
            <ProductMixChart />
            <TrendingItems />
          </div>
        </div>
        <div className={asideTop ? 'relative xl:col-span-4' : 'xl:col-span-4 [&>section]:h-full'}>
          {asideTop ? (
            // From xl this column takes the height of the left one instead of adding to it: the order log fills what the top tile leaves and scrolls.
            <div className="grid gap-3 xl:absolute xl:inset-0 xl:grid-rows-[auto_minmax(0,1fr)] [&>section:last-child]:flex [&>section:last-child]:flex-col xl:[&>section:last-child]:min-h-0">
              {asideTop}
              <OrderLog compact />
            </div>
          ) : (
            <OrderLog />
          )}
        </div>
      </div>
    </>
  )
}

export function StaffDashboardPage() {
  useDocumentTitle('Staff dashboard — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const me = useStaffMe()
  const today = new Date()

  return (
    <div className="grid gap-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-2xl text-fg sm:text-3xl">Hello, {me.firstName}</h1>
          <p className="mt-1 text-xs text-fg-muted">
            <time dateTime={today.toISOString()}>{longDate(today)}</time>
          </p>
        </div>
        {SAMPLE_DATA && (
          <Tooltip label="These figures are placeholders until the orders backend exists." describe>
            <span tabIndex={0} className="font-ui inline-flex h-8 items-center rounded-full border border-line-strong px-3 text-sm font-medium text-fg-muted">
              Sample data
            </span>
          </Tooltip>
        )}
      </header>
      <StaffDashboardWidgets />
    </div>
  )
}
