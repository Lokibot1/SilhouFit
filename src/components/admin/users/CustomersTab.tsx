import { useAccounts } from '../../../hooks/useAccounts'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { useDeactivateCustomer } from '../../../hooks/useDeactivateAccount'
import { listCustomerAccounts } from '../../../service/staffApi'
import type { CustomerAccount } from '../../../types/accounts'
import { fullName } from '../../../utils/accountQuery'
import { ArchiveIcon, RestoreIcon } from '../../form/icons'
import { AddedDate, RowAction } from '../../staff/inventory/InventoryParts'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { AccountName } from './AccountName'
import { AccountTable, type AccountColumn } from './AccountTable'
import { AccountToolbar } from './AccountToolbar'
import { StatusBadge } from './StatusBadge'

const STATUSES = [
  { value: 'active' as const, label: 'Active' },
  { value: 'inactive' as const, label: 'Inactive' },
  { value: '' as const, label: 'All' },
]

/** Customers sign up themselves, so there is nothing to add. An admin or a superadmin can deactivate and activate them; the Status filter opens on Active. */
export function CustomersTab() {
  const list = useAccounts(listCustomerAccounts, 'name', undefined, 'active')
  const deactivate = useDeactivateCustomer(list.retry)
  const role = useCurrentUser()?.role
  const manage = role === 'admin' || role === 'superadmin'

  // The number counts across pages, from the page the rows belong to (not the one just asked for).
  const meta = list.result?.meta
  const columns: AccountColumn<CustomerAccount>[] = [
    {
      key: 'number',
      header: '#',
      cardLabel: '#',
      width: 'w-12',
      cell: (_, index) => <span className="tabular-nums">{((meta?.page ?? list.page) - 1) * (meta?.limit ?? list.per) + index + 1}</span>,
    },
    { key: 'name', header: 'Customer', sort: 'name', title: true, cell: (a) => <AccountName account={a} /> },
    { key: 'email', header: 'Email', width: 'w-[30%]', cell: (a) => <span className="block truncate">{a.email}</span> },
    { key: 'status', header: 'Status', cardLabel: 'Status:', width: 'w-[14%]', cell: (a) => <StatusBadge status={a.status} /> },
    { key: 'added', header: 'Added', cardLabel: 'Added:', sort: 'createdAt', width: 'w-[16%]', cell: (a) => <AddedDate iso={a.createdAt} /> },
  ]

  return (
    <section aria-labelledby="customers-list" className={`${STAFF_SECTION} scroll-mt-14`}>
      <h2 id="customers-list" className="sr-only">
        Customers
      </h2>
      <AccountToolbar noun="customers" searchBy="name or email" text={list.text} onText={list.setText} status={list.status} onStatus={list.setStatus} statuses={STATUSES} per={list.per} onPer={list.setPer} />
      <AccountTable
        list={list}
        label="Customers with email, status and date added"
        noun="customers"
        columns={columns}
        actions={
          manage
            ? (account) =>
                account.status === 'inactive' ? (
                  <RowAction label={`Activate ${fullName(account)}`} icon={<RestoreIcon size={16} />} disabled={deactivate.pendingId === account.id} onClick={() => deactivate.activate(account)} />
                ) : (
                  <RowAction label={`Deactivate ${fullName(account)}`} icon={<ArchiveIcon size={16} />} disabled={deactivate.pendingId === account.id} onClick={() => deactivate.ask(account)} />
                )
            : undefined
        }
        emptyFiltered={
          list.status === 'inactive' && !list.text.trim() ? (
            <>
              <p className="text-base font-semibold text-fg">No inactive customers</p>
              <p className="mt-1 mb-3 text-base text-fg-muted">Deactivated accounts show up here and can be activated again.</p>
              <button type="button" onClick={list.clear} className={`${SECONDARY_BUTTON} mt-3`}>
                Show active customers
              </button>
            </>
          ) : undefined
        }
        empty={
          <>
            <p className="text-base font-semibold text-fg">No customers yet</p>
            <p className="mt-1 text-base text-fg-muted">Customers appear here as soon as they sign up in the shop.</p>
          </>
        }
      />
      {deactivate.element}
    </section>
  )
}
