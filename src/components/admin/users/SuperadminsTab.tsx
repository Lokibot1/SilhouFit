import { useState } from 'react'
import { useAccounts } from '../../../hooks/useAccounts'
import { getAccounts } from '../../../service/accountStore'
import { createSuperadminAccount, listSuperadmins } from '../../../service/accountService'
import type { SuperadminAccount } from '../../../types/accounts'
import { formatPlacedAt } from '../../../utils/format'
import { PlusIcon } from '../../form/icons'
import { AddedDate } from '../../staff/inventory/InventoryParts'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { PRIMARY_BUTTON } from '../../ui/buttonStyles'
import { AccountName } from './AccountName'
import { AccountTable, type AccountColumn } from './AccountTable'
import { AccountToolbar } from './AccountToolbar'
import { CreateAccountSheet } from './CreateAccountSheet'
import { PendingBadge, StatusBadge } from './StatusBadge'

const COLUMNS: AccountColumn<SuperadminAccount>[] = [
  { key: 'name', header: 'Superadmin', sort: 'name', cell: (a) => <AccountName account={a} sub={a.username} /> },
  {
    key: 'status',
    header: 'Status',
    sort: 'status',
    width: 'w-[22%]',
    cell: (a) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={a.status} />
        {a.mustChangePassword && <PendingBadge />}
      </span>
    ),
  },
  { key: 'signin', header: 'Last sign-in', cardLabel: 'Last sign-in:', sort: 'lastSignInAt', width: 'w-[18%]', cell: (a) => <span className="whitespace-nowrap">{a.lastSignInAt ? formatPlacedAt(a.lastSignInAt) : 'Never'}</span> },
  { key: 'added', header: 'Added', cardLabel: 'Added:', sort: 'createdAt', width: 'w-[13%]', cell: (a) => <AddedDate iso={a.createdAt} /> },
]

const STATUSES = [
  { value: '' as const, label: 'All statuses' },
  { value: 'active' as const, label: 'Active' },
  { value: 'inactive' as const, label: 'Inactive' },
]

/** Superadmins can add each other, but nobody can reset or archive a superadmin, so there are no row actions here. */
export function SuperadminsTab() {
  const list = useAccounts(listSuperadmins, 'name', getAccounts().superadmins.length)
  const [creating, setCreating] = useState(false)
  const [session, setSession] = useState(0)

  const add = (
    <button
      type="button"
      onClick={() => {
        setSession((n) => n + 1)
        setCreating(true)
      }}
      className={PRIMARY_BUTTON}
    >
      <PlusIcon />
      Add superadmin account
    </button>
  )

  return (
    <section aria-labelledby="superadmins-list" className={`${STAFF_SECTION} scroll-mt-14`}>
      <h2 id="superadmins-list" className="sr-only">
        Superadmins
      </h2>
      <AccountToolbar noun="superadmins" text={list.text} onText={list.setText} status={list.status} onStatus={list.setStatus} statuses={STATUSES} per={list.per} onPer={list.setPer} action={add} />
      <AccountTable
        list={list}
        label="Superadmin accounts with status, last sign-in and date added"
        noun="superadmin accounts"
        columns={COLUMNS}
        empty={
          <>
            <p className="text-base font-semibold text-fg">No superadmin accounts yet</p>
            <p className="mt-1 mb-3 text-base text-fg-muted">Add a superadmin account to give someone full access.</p>
            {add}
          </>
        }
      />
      <CreateAccountSheet key={session} open={creating} onClose={() => setCreating(false)} noun="superadmin" create={createSuperadminAccount} />
    </section>
  )
}
