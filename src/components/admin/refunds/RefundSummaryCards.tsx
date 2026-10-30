import { motion } from 'motion/react'
import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { useReveal } from '../../../hooks/useReveal'
import { useSection } from '../../../hooks/useSection'
import { getRefundSummary, subscribeRefunds, type RefundSummary } from '../../../service/refunds'
import type { RequestOptions } from '../../../service/simulateRequest'
import { formatPeso } from '../../../utils/format'
import { BanknoteIcon, CheckIcon, ClockIcon, XIcon } from '../../form/icons'
import { SectionBody } from '../../staff/StaffSection'
import { STAFF_SECTION, STAT_CARD, STAT_CONTEXT, STAT_LABEL, STAT_VALUE, statIcon, type StatTone } from '../../staff/StaffSkeleton'

// Four cards in even rows (1, 2 or 4 across) by the width the section is given.
export const REFUND_GRID = 'grid gap-3 @[28rem]:grid-cols-2 @[60rem]:grid-cols-4'
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
export const RefundCardsSkeleton = () => (
  <>
    <CardSkeleton label="Loading pending requests" />
    <CardSkeleton label="Loading approved requests" />
    <CardSkeleton label="Loading rejected requests" />
    <CardSkeleton label="Loading total refunded" />
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

/** How many requests wait, were approved and rejected, and the pesos given back. One request, one retry; it loads again when a request is decided. */
export function RefundSummaryCards() {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const unsubscribe = subscribeRefunds(() => setVersion((n) => n + 1))
    return () => void unsubscribe()
  }, [])
  // A new version is a new request, though it is not read inside.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const fetcher = useCallback((options: RequestOptions) => getRefundSummary(options), [version])
  const section = useSection(fetcher)

  return (
    <section aria-labelledby="refund-figures" className="@container">
      <h2 id="refund-figures" className="sr-only">
        Refund requests at a glance
      </h2>
      <div className={REFUND_GRID}>
        <SectionBody section={section} what="the refund figures" skeleton={<RefundCardsSkeleton />} errorClassName={`${STAFF_SECTION} col-span-full`}>
          {({ pending, approved, rejected, refundedTotal }: RefundSummary) => (
            <>
              <Card index={0} icon={ClockIcon} tone="info" label="Pending" value={pending.toLocaleString('en-PH')} context="Waiting for a decision" />
              <Card index={1} icon={CheckIcon} tone="success" label="Approved" value={approved.toLocaleString('en-PH')} context="Refunded to customers" />
              <Card index={2} icon={XIcon} tone="rose" label="Rejected" value={rejected.toLocaleString('en-PH')} context="Turned down" />
              <Card index={3} icon={BanknoteIcon} tone="teal" label="Total refunded" value={formatPeso(refundedTotal)} context={`${approved.toLocaleString('en-PH')} approved ${approved === 1 ? 'request' : 'requests'}`} />
            </>
          )}
        </SectionBody>
      </div>
    </section>
  )
}
