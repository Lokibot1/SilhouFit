import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSection } from '../../../hooks/useSection'
import { getCustomerTransactions, listCustomerOrders, type CustomerPayment } from '../../../service/accountService'
import type { PaymentMethod, TransactionListItem } from '../../../service/fetchTransactions'
import type { RequestOptions } from '../../../service/simulateRequest'
import type { Customer } from '../../../types/accounts'
import { fullName } from '../../../utils/accountQuery'
import { formatPeso, formatPlacedAt, itemsLabel } from '../../../utils/format'
import { AddedDate } from '../../staff/inventory/InventoryParts'
import { SegmentedTabs } from '../../staff/measurements/SegmentedTabs'
import { EmptyNote, SectionBody } from '../../staff/StaffSection'
import { PlacedAt, ReturnedBadge } from '../../staff/transactions/TransactionParts'
import { Avatar } from '../../ui/Avatar'
import { Modal } from '../../ui/Modal'
import { StatusBadge } from './StatusBadge'

const METHOD: Record<PaymentMethod, string> = { cash: 'Cash', gcash: 'GCash', card: 'Card', cod: 'Cash on delivery' }

const TABS = [
  { value: 'orders', label: 'Orders' },
  { value: 'transactions', label: 'Transactions' },
] as const
type Tab = (typeof TABS)[number]['value']

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />
const ROW = 'flex h-16 items-center justify-between gap-3 border-b border-line'

function ListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="animate-pulse">
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className={ROW}>
          <div className="min-w-0 flex-1">
            <Bar className="h-5 w-24" />
            <Bar className="mt-1 h-4 w-1/2" />
          </div>
          <Bar className="h-5 w-20" />
        </div>
      ))}
    </div>
  )
}

function Orders({ id, onNavigate }: { id: string; onNavigate: () => void }) {
  const fetcher = useCallback((options: RequestOptions) => listCustomerOrders(id, options), [id])
  const section = useSection(fetcher)
  return (
    <SectionBody section={section} what="the orders" skeleton={<ListSkeleton label="Loading orders" />}>
      {(orders: TransactionListItem[]) =>
        orders.length === 0 ? (
          <EmptyNote>This customer has not placed an order yet. Orders appear here after checkout.</EmptyNote>
        ) : (
          <ul aria-label="Orders">
            {orders.map((order) => (
              <li key={order.id} className={ROW}>
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <Link
                      to={`/admin/transactions?q=${encodeURIComponent(order.orderNo)}`}
                      onClick={onNavigate}
                      aria-label={`View order ${order.orderNo} in Transactions`}
                      className="font-mono text-base font-semibold text-fg underline-offset-2 hover:text-chrome-strong hover:underline"
                    >
                      {order.orderNo}
                    </Link>
                    {order.returnedAt && <ReturnedBadge />}
                  </p>
                  <p className="text-sm text-fg-muted">
                    <PlacedAt iso={order.placedAt} /> <span className="tabular-nums">· {itemsLabel(order.itemCount)}</span>
                  </p>
                </div>
                <p className="shrink-0 text-right text-base font-semibold whitespace-nowrap text-fg tabular-nums">{formatPeso(order.total)}</p>
              </li>
            ))}
          </ul>
        )
      }
    </SectionBody>
  )
}

function Payments({ id }: { id: string }) {
  const fetcher = useCallback((options: RequestOptions) => getCustomerTransactions(id, options), [id])
  const section = useSection(fetcher)
  return (
    <SectionBody section={section} what="the transactions" skeleton={<ListSkeleton label="Loading transactions" />}>
      {(payments: CustomerPayment[]) =>
        payments.length === 0 ? (
          <EmptyNote>No payments yet. A payment is listed here for every order this customer places.</EmptyNote>
        ) : (
          <ul aria-label="Transactions">
            {payments.map((payment) => (
              <li key={payment.orderNo} className={ROW}>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-fg">{METHOD[payment.method]}</p>
                  <p className="text-sm text-fg-muted">
                    <span className="font-mono">{payment.orderNo}</span> · <PlacedAt iso={payment.placedAt} />
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-semibold whitespace-nowrap text-fg tabular-nums">{formatPeso(payment.amount)}</p>
                  {payment.refunded && <p className="text-sm text-fg-muted">Refunded</p>}
                </div>
              </li>
            ))}
          </ul>
        )
      }
    </SectionBody>
  )
}

const FACT = 'text-sm text-fg-muted'
const VALUE = 'min-w-0 text-sm text-fg wrap-break-word'

function Profile({ customer }: { customer: Customer }) {
  const name = fullName(customer)
  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar name={name} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-fg">{name}</p>
          <StatusBadge status={customer.status} />
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className={FACT}>Email</dt>
        <dd className={VALUE}>{customer.email}</dd>
        <dt className={FACT}>Phone</dt>
        <dd className={`${VALUE} tabular-nums`}>{customer.phone || '—'}</dd>
        <dt className={FACT}>Address</dt>
        <dd className={VALUE}>{customer.address ?? 'No saved address'}</dd>
        <dt className={FACT}>Registered</dt>
        <dd className={VALUE}>
          <AddedDate iso={customer.createdAt} />
        </dd>
        <dt className={FACT}>Last sign-in</dt>
        <dd className={VALUE}>{customer.lastSignInAt ? formatPlacedAt(customer.lastSignInAt) : 'Never'}</dd>
        <dt className={FACT}>Body profile</dt>
        <dd className={VALUE}>{customer.bodyProfileSet ? 'Measurements saved' : 'Not set up yet'}</dd>
        <dt className={FACT}>Orders</dt>
        <dd className={`${VALUE} tabular-nums`}>{customer.orderCount}</dd>
        <dt className={FACT}>Lifetime spend</dt>
        <dd className={`${VALUE} font-semibold tabular-nums`}>{formatPeso(customer.lifetimeSpend)}</dd>
      </dl>
    </div>
  )
}

function Body({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('orders')
  return (
    <div className="pb-5">
      <Profile customer={customer} />
      <div className="mt-5">
        <SegmentedTabs label="Customer history" name="customer" options={TABS} value={tab} onChange={setTab} />
      </div>
      <div role="tabpanel" aria-labelledby={`customer-tab-${tab}`} className="mt-3">
        {tab === 'orders' ? <Orders id={customer.id} onNavigate={onClose} /> : <Payments id={customer.id} />}
      </div>
    </div>
  )
}

interface CustomerDrawerProps {
  /** The customer to show; it stays set while the drawer slides out. */
  customer: Customer | null
  open: boolean
  onClose: () => void
}

/** A read-only drawer: the customer's profile at once, then their orders and payments, each loading on its own. It opens on Orders every time. */
export function CustomerDrawer({ customer, open, onClose }: CustomerDrawerProps) {
  return (
    <Modal variant="sheet" open={open} onClose={onClose} title={customer ? fullName(customer) : ''}>
      {open && customer && <Body customer={customer} onClose={onClose} />}
    </Modal>
  )
}
