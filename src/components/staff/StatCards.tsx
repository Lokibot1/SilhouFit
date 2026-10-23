import { motion } from 'motion/react'
import type { ComponentType } from 'react'
import { useCountUp } from '../../hooks/useCountUp'
import { useReveal } from '../../hooks/useReveal'
import { useSection } from '../../hooks/useSection'
import { fetchStaffSummary, type StaffSummary } from '../../service/fetchStaffAnalytics'
import { formatDay, formatPesoWhole } from '../../utils/format'
import { staggerDelay } from '../../motion/tokens'
import { SectionBody } from './StaffSection'
import { BagIcon, CameraIcon, CartIcon, ListIcon } from '../form/icons'
import { STAFF_SECTION, StatCardsSkeleton, STAT_CARD, STAT_TOP, STAT_VALUE } from './StaffSkeleton'

/** This month's three headline figures, from one request. */
export function StatCards() {
  const section = useSection(fetchStaffSummary)

  return (
    <section aria-labelledby="month-figures">
      <h2 id="month-figures" className="sr-only">
        This month at a glance
      </h2>
      <SectionBody section={section} what="this month's figures" skeleton={<StatCardsSkeleton />} errorClassName={STAFF_SECTION}>
        {(summary) => <Cards summary={summary} />}
      </SectionBody>
    </section>
  )
}

function Cards({ summary }: { summary: StaffSummary }) {
  const since = `Since ${formatDay(summary.periodStart)}`
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card index={0} icon={CameraIcon} label="Tried AR Fitting" value={summary.arSessions} context="Unique users so far" />
      <Card index={1} icon={BagIcon} label="Sales this month" value={summary.salesTotal} context={since} peso />
      <Card index={2} icon={ListIcon} label="Orders this month" value={summary.orderCount} context={`Placed since ${formatDay(summary.periodStart)}`} />
      <Card index={3} icon={CartIcon} label="Products sold" value={summary.unitsSold} context={`Units since ${formatDay(summary.periodStart)}`} />
    </dl>
  )
}

interface CardProps {
  index: number
  icon: ComponentType<{ size?: 16 | 20; className?: string }>
  label: string
  value: number
  context: string
  peso?: boolean
}

function Card({ index, icon: Icon, label, value, context, peso = false }: CardProps) {
  const { ref, fade } = useReveal<HTMLDivElement>(index)
  const shown = useCountUp(value, staggerDelay(index))
  const text = (n: number) => (peso ? formatPesoWhole(n) : n.toLocaleString('en-PH'))

  return (
    <motion.div ref={ref} {...fade} className={STAT_CARD}>
      {/* The figure comes first on screen but after its label in the markup, so the label reads first. */}
      <dd className={`${STAT_TOP} order-1`}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-line text-fg">
          <Icon size={20} />
        </span>
        <span className={`${STAT_VALUE} min-w-0 truncate text-fg`}>
          {/* The count-up is hidden from screen readers, which get the final figure once. */}
          <span aria-hidden="true">{text(shown)}</span>
          <span className="sr-only">{text(value)}</span>
        </span>
      </dd>
      <dt className="order-2 mt-2 truncate text-sm font-semibold text-fg">{label}</dt>
      <dd className="order-3 mt-1 truncate text-xs text-fg-muted">{context}</dd>
    </motion.div>
  )
}
