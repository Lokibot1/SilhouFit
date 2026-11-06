import { useState } from 'react'
import { useAccounts } from '../../../hooks/useAccounts'
import { inviteSuperadminAccountApi, listSuperadminAccounts } from '../../../service/staffApi'
import type { SuperadminAccount } from '../../../types/accounts'
import { PlusIcon } from '../../form/icons'
import { AddedDate } from '../../staff/inventory/InventoryParts'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { PRIMARY_BUTTON } from '../../ui/buttonStyles'
import { AccountName } from './AccountName'
import { AccountTable, type AccountColumn } from './AccountTable'
import { AccountToolbar } from './AccountToolbar'
import { CreateAccountSheet } from './CreateAccountSheet'

/** Superadmins can invite each other and be listed and searched, from the server. The tab offers no row actions or status filter. */
export function SuperadminsTab() {
  const list = useAccounts(listSuperadminAccounts, 'name')
  const [creating, setCreating] = useState(false)
  const [session, setSession] = useState(0)

  // The number counts across pages, from the page the rows belong to (not the one just asked for).
  const meta = list.result?.meta
  const columns: AccountColumn<SuperadminAccount>[] = [
    {
      key: 'number',
      header: '#',
      cardLabel: '#',
      width: 'w-12',
      cell: (_, index) => <span className="tabular-nums">{((meta?.page ?? list.page) - 1) * (meta?.limit ?? list.per) + index + 1}</span>,
    },
    { key: 'name', header: 'Superadmin', sort: 'name', title: true, cell: (a) => <AccountName account={a} /> },
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
      Add superadmin account
    </button>
  )

  return (
    <section aria-labelledby="superadmins-list" className={`${STAFF_SECTION} scroll-mt-14`}>
      <h2 id="superadmins-list" className="sr-only">
        Superadmins
      </h2>
      <AccountToolbar noun="superadmins" searchBy="name or email" text={list.text} onText={list.setText} per={list.per} onPer={list.setPer} action={add} />
      <AccountTable
        list={list}
        label="Superadmin accounts with email and date added"
        noun="superadmin accounts"
        columns={columns}
        empty={
          <>
            <p className="text-base font-semibold text-fg">No superadmin accounts yet</p>
            <p className="mt-1 mb-3 text-base text-fg-muted">Invite a superadmin account to give someone full access.</p>
            {add}
          </>
        }
      />
      <CreateAccountSheet key={session} open={creating} onClose={() => setCreating(false)} noun="superadmin" invite={inviteSuperadminAccountApi} onCreated={list.retry} />
    </section>
  )
}
