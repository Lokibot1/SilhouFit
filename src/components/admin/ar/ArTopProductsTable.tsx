import { useCallback, useState } from 'react'
import { useSection } from '../../../hooks/useSection'
import { arTopCount, getArTopProducts, type ArTopProduct } from '../../../service/arInsights'
import type { RequestOptions } from '../../../service/simulateRequest'
import { describe, type PeriodFilterValue } from '../../../utils/period'
import { EmptyNote, SectionBody, StaffSection } from '../../staff/StaffSection'
import { Reveal } from './arParts'

const HEAD = 'sticky top-0 h-9 bg-canvas-sub text-xs font-medium text-fg-muted'
const ROW_HEIGHT = 'h-14'
const ROW = `${ROW_HEIGHT} hover:bg-fg/5`
const NUMBER = 'px-1.5 text-right text-sm tabular-nums text-fg @lg:px-3'
const count = (n: number) => n.toLocaleString('en-PH')

function ProductImage({ product }: { product: ArTopProduct }) {
  const [failed, setFailed] = useState(false)
  return product.imageUrl && !failed ? (
    <img src={product.imageUrl} alt={product.name} loading="lazy" onError={() => setFailed(true)} className="hidden size-10 shrink-0 rounded-xl bg-line object-cover @md:block" />
  ) : (
    <div aria-hidden="true" className="hidden size-10 shrink-0 rounded-xl bg-line @md:block" />
  )
}

// The same rows and header as the loaded table, so nothing shifts when the answer arrives.
const Skeleton = () => (
  <div role="status" aria-label="Loading most tried on products" className="animate-pulse">
    <div className="h-9 rounded-xl bg-line bg-clip-content py-2" />
    <div className="divide-y divide-line">
      {Array.from({ length: arTopCount() }, (_, n) => (
        <div key={n} className={`flex ${ROW_HEIGHT} items-center gap-3`}>
          <div className="hidden size-10 shrink-0 rounded-xl bg-line @md:block" />
          <div className="h-5 w-1/2 rounded-xl bg-line" />
          <div className="ml-auto h-5 w-20 rounded-xl bg-line" />
        </div>
      ))}
    </div>
  </div>
)

/** The ten AR-ready products shoppers try on most, with how many of those try-ons ended in a purchase. */
export function ArTopProductsTable({ filter }: { filter: PeriodFilterValue }) {
  const { period, year } = filter
  const fetcher = useCallback((options: RequestOptions) => getArTopProducts({ ...options, filter: { period, year } }), [period, year])
  const section = useSection(fetcher)

  return (
    <StaffSection id="ar-top" title="Most tried on" description={describe(filter, 'Top 10 by try-ons')}>
      <SectionBody section={section} what="the most tried on products" skeleton={<Skeleton />}>
        {(products: ArTopProduct[]) =>
          products.length === 0 ? (
            <EmptyNote>No products were tried on in this period. They show here once shoppers use AR Fitting.</EmptyNote>
          ) : (
            <Reveal>
              <div className="max-h-[36rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Top 10 products by AR try-ons</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={`${HEAD} text-left`}>
                        Product
                      </th>
                      <th scope="col" className={`${HEAD} hidden px-3 text-left @lg:table-cell`}>
                        Category
                      </th>
                      <th scope="col" className={`${HEAD} px-1.5 text-right @lg:px-3`}>
                        Try-ons
                      </th>
                      <th scope="col" className={`${HEAD} px-1.5 text-right @lg:px-3`}>
                        <span aria-hidden="true" className="@lg:hidden">Bought</span>
                        <span className="sr-only @lg:not-sr-only">Purchases</span>
                      </th>
                      <th scope="col" className={`${HEAD} px-1.5 text-right @lg:px-3`}>
                        <span aria-hidden="true" className="@lg:hidden">Rate</span>
                        <span className="sr-only @lg:not-sr-only">Conversion</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {products.map((product) => (
                      <tr key={product.productId} className={ROW}>
                        <td>
                          <div className="flex min-w-0 items-center gap-3">
                            <ProductImage product={product} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-fg">{product.name}</p>
                              <p className="truncate text-xs text-fg-muted @lg:hidden">{product.category}</p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-3 text-fg @lg:table-cell">{product.category}</td>
                        <td className={NUMBER}>{count(product.tryOns)}</td>
                        <td className={NUMBER}>{count(product.purchases)}</td>
                        <td className={NUMBER}>{product.conversionPct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>
          )
        }
      </SectionBody>
    </StaffSection>
  )
}
