import { Link } from 'react-router-dom'
import { getNotArReady, notArReadyCount, type ArNotReadyItem } from '../../../service/arInsights'
import { useSection } from '../../../hooks/useSection'
import { EmptyNote, SectionBody, StaffSection } from '../../staff/StaffSection'
import { SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { Reveal } from './arParts'

const ROW = 'flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2'

const Skeleton = () => (
  <div role="status" aria-label="Loading products without AR Fitting" className="animate-pulse divide-y divide-line">
    {Array.from({ length: notArReadyCount() }, (_, n) => (
      <div key={n} className={ROW}>
        <div className="min-w-0 flex-1">
          <div className="h-6 w-1/2 rounded-xl bg-line" />
          <div className="h-5 w-1/3 rounded-xl bg-line" />
        </div>
        <div className="h-5 w-24 rounded-xl bg-line" />
        <div className="h-9 w-36 rounded-xl bg-line max-md:h-11" />
      </div>
    ))}
  </div>
)

/** Products shoppers cannot try on yet, each with a link to open it in the inventory. */
export function ArNotReadyList() {
  const section = useSection(getNotArReady)

  return (
    <StaffSection id="ar-not-ready" title="Not AR-ready" description="Products shoppers cannot try on yet">
      <SectionBody section={section} what="the products without AR Fitting" skeleton={<Skeleton />}>
        {(items: ArNotReadyItem[]) =>
          items.length === 0 ? (
            <EmptyNote>Every product can be tried on.</EmptyNote>
          ) : (
            <Reveal>
              <ul aria-label="Products that are not AR-ready" className="divide-y divide-line">
                {items.map((item) => (
                  <li key={item.productId} className={ROW}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-fg">{item.name}</p>
                      <p className="truncate text-sm text-fg-muted">{item.category}</p>
                    </div>
                    <p className={`w-24 text-right text-sm tabular-nums ${item.stock <= 0 ? 'text-danger' : 'text-fg'}`}>{item.stock.toLocaleString('en-PH')} in stock</p>
                    <Link to={`/admin/inventory?ar=no&q=${encodeURIComponent(item.name)}`} aria-label={`Open ${item.name} in inventory`} className={SECONDARY_BUTTON_SM}>
                      Open in inventory
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          )
        }
      </SectionBody>
    </StaffSection>
  )
}
