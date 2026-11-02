import { motion } from 'motion/react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useCountUp } from '../../hooks/useCountUp'
import { useReveal } from '../../hooks/useReveal'
import { useSection } from '../../hooks/useSection'
import { fetchStaffSummary, type StaffSummary } from '../../service/fetchStaffAnalytics'
import { formatDay, formatPeso, formatPesoWhole } from '../../utils/format'
import { staggerDelay } from '../../motion/tokens'
import { SectionBody } from './StaffSection'
import { ArIcon, BanknoteIcon, BoxIcon, CartArrowIcon, TrendDownIcon, TrendUpIcon } from '../form/icons'
import { Tooltip } from '../ui/Tooltip'
import { STAFF_SECTION, StatCardsSkeleton, STAT_CARD, STAT_CONTEXT, STAT_LABEL, STAT_PILL_ROW, STAT_VALUE, statIcon, type StatTone } from './StaffSkeleton'

/** This month's three headline figures, from one request. */
export function StatCards({ arInsightsTo }: { arInsightsTo?: string }) {
  const section = useSection(fetchStaffSummary)

  return (
    <section aria-labelledby="month-figures">
      <h2 id="month-figures" className="sr-only">
        This month at a glance
      </h2>
      <SectionBody section={section} what="this month's figures" skeleton={<StatCardsSkeleton />} errorClassName={STAFF_SECTION}>
        {(summary) => <Cards summary={summary} arInsightsTo={arInsightsTo} />}
      </SectionBody>
    </section>
  )
}

function Cards({ summary, arInsightsTo }: { summary: StaffSummary; arInsightsTo?: string }) {
  const since = `Since ${formatDay(summary.periodStart)}`
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card index={0} icon={ArIcon} tone="info" label="AR Fitting Sessions" value={summary.arSessions} context="No. of users who tried AR Fitting" change={summary.arChange} to={arInsightsTo} />
      <Card index={1} icon={BanknoteIcon} tone="success" label="Sales this month" value={summary.salesTotal} context={since} change={summary.salesChange} peso />
      <Card index={2} icon={BoxIcon} tone="violet" label="Orders this month" value={summary.orderCount} context={`Placed since ${formatDay(summary.periodStart)}`} change={summary.ordersChange} />
      <Card index={3} icon={CartArrowIcon} tone="teal" label="Products sold" value={summary.unitsSold} context={`Units since ${formatDay(summary.periodStart)}`} aov={summary.orderCount > 0 ? summary.aov : null} />
    </dl>
  )
}

interface CardProps {
  index: number
  icon: ComponentType<{ size?: 16 | 20; className?: string }>
  label: string
  value: number
  context: string
  /** Percent against the same days last month; null shows nothing. */
  change?: number | null
  /** Average order value, shown instead of a change on the card that carries it. */
  aov?: number | null
  peso?: boolean
  tone?: StatTone
  /** Makes the whole card a link (admin only); the link sits in the label so the list markup stays valid. */
  to?: string
}

function Card({ index, icon: Icon, label, value, context, change = null, aov = null, peso = false, tone, to }: CardProps) {
  const { ref, fade } = useReveal<HTMLDivElement>(index)
  const shown = useCountUp(value, staggerDelay(index))
  const text = (n: number) => (peso ? formatPesoWhole(n) : n.toLocaleString('en-PH'))

  return (
    <motion.div ref={ref} {...fade} className={to ? `${STAT_CARD} relative transition-colors hover:border-line-strong hover:bg-canvas-raised` : STAT_CARD}>
      <dt className={STAT_LABEL}>
        {to ? (
          <Link
            to={to}
            aria-label={`${label}: ${value.toLocaleString('en-PH')}, open AR Fitting Insights`}
            className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2"
          >
            {label}
          </Link>
        ) : (
          label
        )}
      </dt>
      <dd className={`${STAT_VALUE} text-fg`}>
        {/* The count-up is hidden from screen readers, which get the final figure once. */}
        <span aria-hidden="true">{text(shown)}</span>
        <span className="sr-only">{text(value)}</span>
      </dd>
      <dd className={STAT_CONTEXT}>{context}</dd>
      <span aria-hidden="true" className={statIcon(tone)}>
        <Icon size={20} />
      </span>
      <div className={`${STAT_PILL_ROW} relative`}>
        {change !== null && <ChangePill change={change} />}
        {aov !== null && <AovPill aov={aov} />}
      </div>
    </motion.div>
  )
}

const PILL = 'font-ui inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums text-fg'

/** Up or down against the same days last month. Direction is the arrow and the sign, not only the colour. */
function ChangePill({ change }: { change: number }) {
  const up = change > 0
  const down = change < 0
  const Arrow = down ? TrendDownIcon : TrendUpIcon
  const text = `${up ? '+' : down ? '−' : ''}${Math.abs(change).toFixed(1)}%`
  return (
    <Tooltip label="Compared with the same days last month">
      <span tabIndex={0} className={`${PILL} ${up ? 'bg-success/15' : down ? 'bg-danger/10' : 'bg-line'}`}>
        <Arrow size={16} className={up ? 'text-success' : down ? 'text-danger' : 'text-fg-muted'} />
        {text}
        <span className="sr-only">{up ? ', up' : down ? ', down' : ', no change'} from the same days last month</span>
      </span>
    </Tooltip>
  )
}

function AovPill({ aov }: { aov: number }) {
  return (
    <Tooltip label="AOV is the Average Order Value: total sales divided by the number of orders.">
      <span tabIndex={0} className={`${PILL} bg-line`}>
        <BanknoteIcon size={16} className="text-fg-muted" />
        AOV {formatPeso(aov)}
        <span className="sr-only">, average order value</span>
      </span>
    </Tooltip>
  )
}
