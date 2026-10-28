import { motion } from 'motion/react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useReveal } from '../../hooks/useReveal'
import { useSection } from '../../hooks/useSection'
import { getAccountSummary, type AccountSummary } from '../../service/accountService'
import { getArFigures, getRefundFigures, getStockFigures, type ArFigures, type RefundFigures, type StockFigures } from '../../service/adminOverview'
import { LOW_STOCK } from '../../data/products'
import type { RequestOptions } from '../../service/simulateRequest'
import { ArIcon, BoxIcon, RestoreIcon, SettingsIcon, UserIcon, UsersIcon } from '../form/icons'
import { SectionBody } from '../staff/StaffSection'
import { STAFF_SECTION, STAT_CARD, STAT_CONTEXT, STAT_ICON, STAT_LABEL, STAT_VALUE } from '../staff/StaffSkeleton'

// Six cards in even rows (1, 2, 3 or 6 across) by the width the section is given, sidebar open or collapsed, so none is squeezed under 13rem and none is left alone on a row.
const GRID = 'grid gap-3 @[28rem]:grid-cols-2 @3xl:grid-cols-3 @[84rem]:grid-cols-6'
// Wrap instead of truncating (the shared classes cut a long label off with an ellipsis).
const LABEL = STAT_LABEL.replace('truncate ', '')
const CONTEXT = STAT_CONTEXT.replace('truncate ', '')
const MotionLink = motion.create(Link)
const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`}>&nbsp;</div>

const CardSkeleton = ({ label }: { label: string }) => (
  <div role="status" aria-label={label} className={`${STAT_CARD} animate-pulse`}>
    <Bar className="col-start-1 row-start-1 w-24 text-sm" />
    <Bar className="col-start-1 row-start-2 mt-0.5 w-20 text-xs" />
    <div className="col-start-2 row-span-2 row-start-1 size-8 rounded-xl bg-line" />
    <Bar className={`${STAT_VALUE} w-16`} />
  </div>
)

interface CardProps {
  index: number
  icon: ComponentType<{ size?: 16 | 20; className?: string }>
  label: string
  value: number
  context: string
  /** The page the card opens, and what that does in words (for the link's name). */
  to: string
  action: string
}

// The whole card is one link, so there is no nested anchor.
function Card({ index, icon: Icon, label, value, context, to, action }: CardProps) {
  const { ref, fade } = useReveal<HTMLAnchorElement>(index)
  return (
    <MotionLink
      ref={ref}
      {...fade}
      to={to}
      aria-label={`${label}: ${value.toLocaleString('en-PH')}, ${action}`}
      className={`${STAT_CARD} cursor-pointer transition-colors hover:border-line-strong hover:bg-canvas-raised focus-visible:outline-2 focus-visible:outline-offset-2`}
    >
      <span className={LABEL}>{label}</span>
      <span className={`${STAT_VALUE} text-fg`}>{value.toLocaleString('en-PH')}</span>
      <span className={CONTEXT}>{context}</span>
      <span aria-hidden="true" className={STAT_ICON}>
        <Icon size={20} />
      </span>
    </MotionLink>
  )
}

/** Customers, staff and admins, from one request. */
function AccountCards() {
  const section = useSection(getAccountSummary)
  const skeleton = (
    <>
      <CardSkeleton label="Loading customers" />
      <CardSkeleton label="Loading staff" />
      <CardSkeleton label="Loading admins" />
    </>
  )
  return (
    <SectionBody section={section} what="the account figures" skeleton={skeleton} errorClassName={`${STAFF_SECTION} col-span-full`}>
      {(summary: AccountSummary) => (
        <>
          <Card index={0} icon={UsersIcon} label="Customers" value={summary.customers} context="Registered shoppers" to="/admin/users?tab=customers" action="open customer list" />
          <Card index={1} icon={UserIcon} label="Staff" value={summary.staff} context="Including archived" to="/admin/users?tab=staff" action="open staff list" />
          <Card index={2} icon={SettingsIcon} label="Admins" value={summary.admins} context="Never archived" to="/admin/users?tab=admins" action="open admin list" />
        </>
      )}
    </SectionBody>
  )
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-PH')} ${n === 1 ? one : many}`

/** Each operations card loads, fails and retries on its own. */
function OpsCard<T>({ index, fetcher, what, icon, label, to, action, read }: Pick<CardProps, 'index' | 'icon' | 'label' | 'to' | 'action'> & {
  fetcher: (options: RequestOptions) => Promise<T>
  what: string
  read: (data: T) => { value: number; context: string }
}) {
  const section = useSection(fetcher)
  return (
    <SectionBody section={section} what={what} skeleton={<CardSkeleton label={`Loading ${label.toLowerCase()}`} />} errorClassName={STAFF_SECTION}>
      {(data) => <Card index={index} icon={icon} label={label} to={to} action={action} {...read(data)} />}
    </SectionBody>
  )
}

/** The account counts and the operations figures across the top of the admin dashboard. */
export function AdminSummaryCards() {
  return (
    <section aria-labelledby="account-figures" className="@container">
      <h2 id="account-figures" className="sr-only">
        Accounts at a glance
      </h2>
      <div className={GRID}>
        <AccountCards />
        {/* SAMPLE_DATA: all three read the sample orders and products until the backend answers (see service/adminOverview). */}
        <OpsCard
          index={3}
          fetcher={getRefundFigures}
          what="the refund figures"
          icon={RestoreIcon}
          label="Refunds"
          to="/admin/transactions"
          action="open transactions"
          read={({ returned, orders }: RefundFigures) => ({
            value: returned,
            context: `${orders > 0 ? ((returned / orders) * 100).toFixed(1) : '0.0'}% of ${orders.toLocaleString('en-PH')} orders returned`,
          })}
        />
        <OpsCard
          index={4}
          fetcher={getArFigures}
          what="the AR-ready figures"
          icon={ArIcon}
          label="AR-ready products"
          to="/admin/inventory?ar=yes"
          action="open AR-ready products in inventory"
          read={({ ready, products }: ArFigures) => ({ value: ready, context: `of ${plural(products, 'product', 'products')} can be tried on` })}
        />
        <OpsCard
          index={5}
          fetcher={getStockFigures}
          what="the stock figures"
          icon={BoxIcon}
          label="Low or out of stock"
          to="/admin/inventory"
          action="open inventory to restock"
          read={({ out, low }: StockFigures) => ({ value: out + low, context: `${out.toLocaleString('en-PH')} out, ${low.toLocaleString('en-PH')} with ${LOW_STOCK} or fewer left` })}
        />
      </div>
    </section>
  )
}
