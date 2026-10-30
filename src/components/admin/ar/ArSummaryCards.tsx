import { motion } from 'motion/react'
import { useCallback, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useReveal } from '../../../hooks/useReveal'
import { useSection } from '../../../hooks/useSection'
import { getArSummary, type ArSummary } from '../../../service/arInsights'
import type { RequestOptions } from '../../../service/simulateRequest'
import { resolvePeriod, type PeriodFilterValue } from '../../../utils/period'
import { ArIcon, BagIcon, StarIcon, TrendUpIcon } from '../../form/icons'
import { SectionBody } from '../../staff/StaffSection'
import { STAFF_SECTION, STAT_CARD, STAT_CONTEXT, STAT_LABEL, STAT_VALUE, statIcon, type StatTone } from '../../staff/StaffSkeleton'

// Four cards in even rows (1, 2 or 4 across) by the width the section is given.
const GRID = 'grid gap-3 @[28rem]:grid-cols-2 @[60rem]:grid-cols-4'
// Wrap instead of truncating (the shared classes cut a long label off with an ellipsis).
const LABEL = STAT_LABEL.replace('truncate ', '')
const CONTEXT = STAT_CONTEXT.replace('truncate ', '')
const MotionLink = motion.create(Link)
const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`}>&nbsp;</div>

const CardSkeleton = ({ label }: { label: string }) => (
  <div role="status" aria-label={label} className={`${STAT_CARD} animate-pulse`}>
    <Bar className="col-start-1 row-start-1 w-24 text-sm" />
    <Bar className="col-start-1 row-start-2 mt-0.5 w-20 text-xs @[60rem]:min-h-8" />
    <div className="col-start-2 row-span-2 row-start-1 size-8 rounded-xl bg-line" />
    <Bar className={`${STAT_VALUE} w-16`} />
  </div>
)

interface CardProps {
  index: number
  icon: ComponentType<{ size?: 16 | 20; className?: string }>
  tone: StatTone
  label: string
  value: string
  context: string
  /** The page the card opens, and what that does in words (for the link's name). */
  link?: { to: string; action: string }
}

const CARD_LINK = 'cursor-pointer transition-colors hover:border-line-strong hover:bg-canvas-raised focus-visible:outline-2 focus-visible:outline-offset-2'

function CardBody({ icon: Icon, tone, label, value, context }: CardProps) {
  return (
    <>
      <span className={LABEL}>{label}</span>
      <span className={`${STAT_VALUE} text-fg`}>{value}</span>
      <span className={CONTEXT}>{context}</span>
      <span aria-hidden="true" className={statIcon(tone)}>
        <Icon size={20} />
      </span>
    </>
  )
}

function StaticCard(props: CardProps) {
  const { ref, fade } = useReveal<HTMLDivElement>(props.index)
  return (
    <motion.div ref={ref} {...fade} className={STAT_CARD}>
      <CardBody {...props} />
    </motion.div>
  )
}

// The whole card is one link, so there is no nested anchor.
function LinkCard(props: CardProps & { link: NonNullable<CardProps['link']> }) {
  const { ref, fade } = useReveal<HTMLAnchorElement>(props.index)
  return (
    <MotionLink ref={ref} {...fade} to={props.link.to} aria-label={`${props.label}: ${props.value}, ${props.link.action}`} className={`${STAT_CARD} ${CARD_LINK}`}>
      <CardBody {...props} />
    </MotionLink>
  )
}

/** AR sessions, how many ended in a purchase, how much of the catalogue can be tried on, and the average fit score. One request, one retry. */
export function ArSummaryCards({ filter }: { filter: PeriodFilterValue }) {
  const { period, year } = filter
  const fetcher = useCallback((options: RequestOptions) => getArSummary({ ...options, filter: { period, year } }), [period, year])
  const section = useSection(fetcher)
  const skeleton = (
    <>
      <CardSkeleton label="Loading AR sessions" />
      <CardSkeleton label="Loading purchases after try-on" />
      <CardSkeleton label="Loading AR-ready coverage" />
      <CardSkeleton label="Loading average fit score" />
    </>
  )

  return (
    <section aria-labelledby="ar-figures" className="@container">
      <h2 id="ar-figures" className="sr-only">
        AR Fitting at a glance
      </h2>
      <div className={GRID}>
        <SectionBody section={section} what="the AR Fitting figures" skeleton={skeleton} errorClassName={`${STAFF_SECTION} col-span-full`}>
          {({ sessions, conversionPct, arReady, products, avgFitScore }: ArSummary) => (
            <>
              <StaticCard index={0} icon={ArIcon} tone="info" label="AR sessions" value={sessions.toLocaleString('en-PH')} context={resolvePeriod(filter).scope} />
              <StaticCard index={1} icon={TrendUpIcon} tone="success" label="Try-on to purchase" value={`${conversionPct.toFixed(1)}%`} context="Sessions that ended in a purchase" />
              <LinkCard
                index={2}
                icon={BagIcon}
                tone="violet"
                label="AR-ready coverage"
                value={`${products > 0 ? Math.round((arReady / products) * 100) : 0}%`}
                context={`${arReady.toLocaleString('en-PH')} of ${products.toLocaleString('en-PH')} products can be tried on`}
                link={{ to: '/admin/inventory?ar=yes', action: 'open AR-ready products in inventory' }}
              />
              <StaticCard index={3} icon={StarIcon} tone="teal" label="Average fit score" value={`${avgFitScore} / 100`} context="Across fitted try-ons" />
            </>
          )}
        </SectionBody>
      </div>
    </section>
  )
}
