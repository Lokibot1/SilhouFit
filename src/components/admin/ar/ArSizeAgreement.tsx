import { useCallback } from 'react'
import { useSection } from '../../../hooks/useSection'
import { getSizeAgreement, type SizeAgreement } from '../../../service/arInsights'
import type { RequestOptions } from '../../../service/simulateRequest'
import { describe, type PeriodFilterValue } from '../../../utils/period'
import { EmptyNote, SectionBody, StaffSection } from '../../staff/StaffSection'
import { Tooltip } from '../../ui/Tooltip'
import { Reveal, ShareBar, ShareBarsSkeleton } from './arParts'

const EXPLAIN = 'Of shoppers who bought after AR Fitting recommended a size, how many bought that size, a larger one or a smaller one.'

/** Whether shoppers bought the size AR Fitting recommended. */
export function ArSizeAgreement({ filter }: { filter: PeriodFilterValue }) {
  const { period, year } = filter
  const fetcher = useCallback((options: RequestOptions) => getSizeAgreement({ ...options, filter: { period, year } }), [period, year])
  const section = useSection(fetcher)

  return (
    <StaffSection
      id="ar-size"
      title="Size advice followed"
      description={describe(filter, 'Bought the advised size')}
      action={
        <Tooltip label={EXPLAIN}>
          <button type="button" aria-label="About size advice followed" className="flex size-11 cursor-help items-center justify-center rounded-xl text-fg-muted hover:text-fg">
            <span aria-hidden="true" className="text-base font-semibold">?</span>
          </button>
        </Tooltip>
      }
    >
      <SectionBody section={section} what="the size advice figures" skeleton={<ShareBarsSkeleton label="Loading size advice" count={3} />}>
        {({ recommended, purchasedSame, purchasedLarger }: SizeAgreement) => {
          if (recommended === 0) return <EmptyNote>No purchases after a size recommendation in this period. Pick a longer period to see more.</EmptyNote>
          const same = Math.round((purchasedSame / recommended) * 100)
          const larger = Math.round((purchasedLarger / recommended) * 100)
          const smaller = 100 - same - larger
          const counted = (n: number) => `${n.toLocaleString('en-PH')} of ${recommended.toLocaleString('en-PH')} purchases after a recommendation`
          return (
            <Reveal>
              <ul aria-label="Size bought after a recommendation" className="grid gap-4">
                <ShareBar label="Same size" pct={same} fill="bg-chart-5" hint={`${counted(purchasedSame)} were the recommended size`} />
                <ShareBar label="Larger size" pct={larger} fill="bg-chart-3" hint={`${counted(purchasedLarger)} were a larger size`} />
                <ShareBar label="Smaller size" pct={smaller} fill="bg-chart-4" hint={`${counted(recommended - purchasedSame - purchasedLarger)} were a smaller size`} />
              </ul>
            </Reveal>
          )
        }}
      </SectionBody>
    </StaffSection>
  )
}
