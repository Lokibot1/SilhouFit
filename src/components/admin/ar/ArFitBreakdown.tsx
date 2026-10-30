import { useCallback } from 'react'
import { useSection } from '../../../hooks/useSection'
import { getArFitBreakdown, type FitBreakdown } from '../../../service/arInsights'
import type { RequestOptions } from '../../../service/simulateRequest'
import { describe, type PeriodFilterValue } from '../../../utils/period'
import { SectionBody, StaffSection } from '../../staff/StaffSection'
import { Reveal, ShareBar, ShareBarsSkeleton } from './arParts'

/** How the fit indicator rated the try-ons: too tight, a good fit or loose. */
export function ArFitBreakdown({ filter }: { filter: PeriodFilterValue }) {
  const { period, year } = filter
  const fetcher = useCallback((options: RequestOptions) => getArFitBreakdown({ ...options, filter: { period, year } }), [period, year])
  const section = useSection(fetcher)

  return (
    <StaffSection id="ar-fit" title="Fit results" description={describe(filter, 'How try-ons ended')}>
      <SectionBody section={section} what="the fit results" skeleton={<ShareBarsSkeleton label="Loading fit results" count={3} />}>
        {({ tooTight, goodFit, loose }: FitBreakdown) => (
          <Reveal>
            <ul aria-label="Share of try-ons by fit" className="grid gap-4">
              <ShareBar label="Too tight" pct={tooTight} fill="bg-chart-4" hint={`${tooTight}% of try-ons showed the garment as too tight`} />
              <ShareBar label="Good fit" pct={goodFit} fill="bg-chart-5" hint={`${goodFit}% of try-ons showed a good fit`} />
              <ShareBar label="Loose" pct={loose} fill="bg-chart-3" hint={`${loose}% of try-ons showed the garment as loose`} />
            </ul>
          </Reveal>
        )}
      </SectionBody>
    </StaffSection>
  )
}
