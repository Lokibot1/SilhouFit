import { useState } from 'react'
import { useAccounts } from '../../../hooks/useAccounts'
import { listCustomers } from '../../../service/accountService'
import type { Customer } from '../../../types/accounts'
import { formatPeso } from '../../../utils/format'
import { AddedDate } from '../../staff/inventory/InventoryParts'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { AccountName } from './AccountName'
import { AccountTable, type AccountColumn } from './AccountTable'
import { AccountToolbar } from './AccountToolbar'
import { CustomerDrawer } from './CustomerDrawer'
import { StatusBadge } from './StatusBadge'

const COLUMNS: AccountColumn<Customer>[] = [
  { key: 'name', header: 'Customer', sort: 'name', cell: (c) => <AccountName account={c} sub={c.email} asButton /> },
  { key: 'status', header: 'Status', sort: 'status', width: 'w-[13%]', cell: (c) => <StatusBadge status={c.status} /> },
  { key: 'orders', header: 'Orders', cardLabel: 'Orders:', sort: 'orderCount', right: true, width: 'w-[10%]', cell: (c) => c.orderCount },
  { key: 'spend', header: 'Lifetime spend', cardLabel: 'Spent:', sort: 'lifetimeSpend', right: true, width: 'w-[16%]', cell: (c) => <span className="whitespace-nowrap">{formatPeso(c.lifetimeSpend)}</span> },
  { key: 'registered', header: 'Registered', cardLabel: 'Registered:', sort: 'createdAt', width: 'w-[15%]', cell: (c) => <AddedDate iso={c.createdAt} /> },
]

const STATUSES = [
  { value: '' as const, label: 'All statuses' },
  { value: 'active' as const, label: 'Active' },
  { value: 'inactive' as const, label: 'Inactive' },
]

/** Customers can be looked at, not changed: sign-up creates them and the shop owns them. */
export function CustomersTab() {
  const list = useAccounts(listCustomers)
  // `selected` outlives `open`, so the drawer keeps its content while it slides out.
  const [selected, setSelected] = useState<Customer | null>(null)
  const [open, setOpen] = useState(false)

  return (
    <section aria-labelledby="customers-list" className={`${STAFF_SECTION} scroll-mt-14`}>
      <h2 id="customers-list" className="sr-only">
        Customers
      </h2>
      <AccountToolbar noun="customers" text={list.text} onText={list.setText} status={list.status} onStatus={list.setStatus} statuses={STATUSES} per={list.per} onPer={list.setPer} />
      <AccountTable
        list={list}
        label="Customers with status, orders, lifetime spend and registration date"
        noun="customers"
        columns={COLUMNS}
        onOpen={(customer) => {
          setSelected(customer)
          setOpen(true)
        }}
        empty={
          <>
            <p className="text-base font-semibold text-fg">No customers yet</p>
            <p className="mt-1 text-base text-fg-muted">Customers appear here as soon as they sign up in the shop.</p>
          </>
        }
      />
      <CustomerDrawer customer={selected} open={open} onClose={() => setOpen(false)} />
    </section>
  )
}
