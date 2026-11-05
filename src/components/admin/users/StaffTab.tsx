import { useState } from 'react'
import { useAccounts } from '../../../hooks/useAccounts'
import { createStaffAccountApi, listStaffAccounts } from '../../../service/staffApi'
import type { StaffAccount } from '../../../types/accounts'
import { PlusIcon } from '../../form/icons'
import { AddedDate } from '../../staff/inventory/InventoryParts'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { PRIMARY_BUTTON } from '../../ui/buttonStyles'
import { AccountName } from './AccountName'
import { AccountTable, type AccountColumn } from './AccountTable'
import { AccountToolbar } from './AccountToolbar'
import { CreateAccountSheet } from './CreateAccountSheet'

const create = async ({ firstName, lastName }: { firstName: string; lastName: string }) => ({ credentials: (await createStaffAccountApi({ firstName, lastName })).credentials })

export function StaffTab() {
  const list = useAccounts(listStaffAccounts)
  const [creating, setCreating] = useState(false)
  const [session, setSession] = useState(0)

  // The number counts across pages, from the page the rows belong to (not the one just asked for).
  const meta = list.result?.meta
  const columns: AccountColumn<StaffAccount>[] = [
    {
      key: 'number',
      header: '#',
      cardLabel: '#',
      width: 'w-12',
      cell: (_, index) => <span className="tabular-nums">{((meta?.page ?? list.page) - 1) * (meta?.limit ?? list.per) + index + 1}</span>,
    },
    { key: 'name', header: 'Staff', sort: 'name', title: true, cell: (a) => <AccountName account={a} /> },
    { key: 'email', header: 'Email', width: 'w-[30%]', cell: (a) => <span className="block truncate">{a.email}</span> },
    { key: 'added', header: 'Added', cardLabel: 'Added:', sort: 'createdAt', width: 'w-[16%]', cell: (a) => <AddedDate iso={a.createdAt} /> },
  ]

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
      Add staff account
    </button>
  )

  return (
    <section aria-labelledby="staff-list" className={`${STAFF_SECTION} scroll-mt-14`}>
      <h2 id="staff-list" className="sr-only">
        Staff
      </h2>
      <AccountToolbar noun="staff" searchBy="name or email" text={list.text} onText={list.setText} per={list.per} onPer={list.setPer} action={add} />
      <AccountTable
        list={list}
        label="Staff accounts with email and date added"
        noun="staff accounts"
        columns={columns}
        empty={
          <>
            <p className="text-base font-semibold text-fg">No staff accounts yet</p>
            <p className="mt-1 mb-3 text-base text-fg-muted">Add the first staff account to give someone access to inventory, measurements and transactions.</p>
            {add}
          </>
        }
      />
      <CreateAccountSheet key={session} open={creating} onClose={() => setCreating(false)} noun="staff" create={create} server taken={list.result?.data.map((a) => a.username)} onCreated={list.retry} />
    </section>
  )
}
