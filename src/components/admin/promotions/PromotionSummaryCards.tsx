import { motion } from 'motion/react'
import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { useReveal } from '../../../hooks/useReveal'
import { useSection } from '../../../hooks/useSection'
import { getPromoSummary, subscribePromotions, type PromoSummary } from '../../../service/promotions'
import type { RequestOptions } from '../../../service/simulateRequest'
import { formatPesoWhole } from '../../../utils/format'
import { ArchiveIcon, BanknoteIcon, ClockIcon, TrendUpIcon } from '../../form/icons'
import { SectionBody } from '../../staff/StaffSection'
import { STAFF_SECTION, STAT_CARD, STAT_CONTEXT, STAT_LABEL, STAT_VALUE, statIcon, type StatTone } from '../../staff/StaffSkeleton'

// Four cards in even rows (1, 2 or 4 across) by the width the section is given.
export const PROMO_GRID = 'grid gap-3 @[28rem]:grid-cols-2 @[60rem]:grid-cols-4'
// Wrap instead of truncating (the shared classes cut a long label off with an ellipsis).
const LABEL = STAT_LABEL.replace('truncate ', '')
const CONTEXT = STAT_CONTEXT.replace('truncate ', '')
const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`}>&nbsp;</div>

const CardSkeleton = ({ label }: { label: string }) => (
  <div role="status" aria-label={label} className={`${STAT_CARD} animate-pulse`}>
    <Bar className="col-start-1 row-start-1 w-24 text-sm" />
    <Bar className="col-start-1 row-start-2 mt-0.5 w-20 text-xs" />
    <div className="col-start-2 row-span-2 row-start-1 size-8 rounded-xl bg-line" />
    <Bar className={`${STAT_VALUE} w-16`} />
  </div>
)

/** The four cards' placeholders. */
export const PromoCardsSkeleton = () => (
  <>
    <CardSkeleton label="Loading active promotions" />
    <CardSkeleton label="Loading scheduled promotions" />
    <CardSkeleton label="Loading ended promotions" />
    <CardSkeleton label="Loading redemptions" />
  </>
)

interface CardProps {
  index: number
  icon: ComponentType<{ size?: 16 | 20; className?: string }>
  tone: StatTone
  label: string
  value: string
  context: string
}

function Card({ index, icon: Icon, tone, label, value, context }: CardProps) {
  const { ref, fade } = useReveal<HTMLDivElement>(index)
  return (
    <motion.div ref={ref} {...fade} className={STAT_CARD}>
      <span className={LABEL}>{label}</span>
      <span className={`${STAT_VALUE} text-fg`}>{value}</span>
      <span className={CONTEXT}>{context}</span>
      <span aria-hidden="true" className={statIcon(tone)}>
        <Icon size={20} />
      </span>
    </motion.div>
  )
}

/** How many promotions are running, coming up and over, and the redemptions so far. One request, one retry; it loads again when the promotions change. */
export function PromotionSummaryCards() {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const unsubscribe = subscribePromotions(() => setVersion((n) => n + 1))
    return () => void unsubscribe()
  }, [])
  // A new version is a new request, though it is not read inside.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const fetcher = useCallback((options: RequestOptions) => getPromoSummary(options), [version])
  const section = useSection(fetcher)

  return (
    <section aria-labelledby="promo-figures" className="@container">
      <h2 id="promo-figures" className="sr-only">
        Promotions at a glance
      </h2>
      <div className={PROMO_GRID}>
        <SectionBody section={section} what="the promotion figures" skeleton={<PromoCardsSkeleton />} errorClassName={`${STAFF_SECTION} col-span-full`}>
          {({ active, scheduled, ended, redemptions, discountGiven }: PromoSummary) => (
            <>
              <Card index={0} icon={TrendUpIcon} tone="success" label="Active" value={active.toLocaleString('en-PH')} context="Running right now" />
              <Card index={1} icon={ClockIcon} tone="info" label="Scheduled" value={scheduled.toLocaleString('en-PH')} context="Starting later" />
              <Card index={2} icon={ArchiveIcon} tone="rose" label="Ended" value={ended.toLocaleString('en-PH')} context="Finished or ended" />
              <Card index={3} icon={BanknoteIcon} tone="teal" label="Redemptions" value={redemptions.toLocaleString('en-PH')} context={`${formatPesoWhole(discountGiven)} off so far`} />
            </>
          )}
        </SectionBody>
      </div>
    </section>
  )
}
