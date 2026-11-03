import { useState } from 'react'
import { useAccounts } from '../../../hooks/useAccounts'
import { useResetPassword } from '../../../hooks/useResetPassword'
import { getAccounts } from '../../../service/accountStore'
import { archiveAdminAccount, createAdminAccount, listAdmins, resetAdminPassword, restoreAdminAccount } from '../../../service/accountService'
import type { AdminAccount } from '../../../types/accounts'
import { fullName } from '../../../utils/accountQuery'
import { formatPlacedAt } from '../../../utils/format'
import { ArchiveIcon, LockIcon, PlusIcon, RestoreIcon } from '../../form/icons'
import { AddedDate, RowAction } from '../../staff/inventory/InventoryParts'
import { STAFF_SECTION } from '../../staff/StaffSkeleton'
import { useToast } from '../../toast/useToast'
import { PRIMARY_BUTTON } from '../../ui/buttonStyles'
import { AccountName } from './AccountName'
import { AccountTable, type AccountColumn } from './AccountTable'
import { AccountToolbar } from './AccountToolbar'
import { ConfirmDialog } from './ConfirmDialog'
import { CreateAccountSheet } from './CreateAccountSheet'
import { PendingBadge, StatusBadge } from './StatusBadge'

const COLUMNS: AccountColumn<AdminAccount>[] = [
  { key: 'name', header: 'Admin', sort: 'name', cell: (a) => <AccountName account={a} sub={a.username} /> },
  {
    key: 'status',
    header: 'Status',
    sort: 'status',
    width: 'w-[22%]',
    cell: (a) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={a.status} />
        {a.mustChangePassword && a.status !== 'archived' && <PendingBadge />}
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
  { value: 'archived' as const, label: 'Archived' },
]

/** Admins can be added, listed and searched. Only a superadmin (`manage`) can reset or archive one; another admin cannot, so an admin sees no row actions. */
export function AdminsTab({ manage = false }: { manage?: boolean }) {
  const toast = useToast()
  const list = useAccounts(listAdmins, 'name', getAccounts().admins.length)
  const reset = useResetPassword(resetAdminPassword)
  const [creating, setCreating] = useState(false)
  const [session, setSession] = useState(0)
  const [archiving, setArchiving] = useState<AdminAccount | null>(null)
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function archive(account: AdminAccount) {
    setPending(true)
    try {
      await archiveAdminAccount(account.id)
      setAsking(false)
      toast.show({ kind: 'success', message: `${fullName(account)} archived`, action: { label: 'Undo', onClick: () => void restore(account, true) } })
    } catch {
      setAsking(false)
      toast.show({
        kind: 'error',
        message: `Couldn't archive ${fullName(account)}. The request failed before anything changed, so the account is still active. Check your connection, then retry.`,
        action: { label: 'Retry', onClick: () => setAsking(true) },
      })
    } finally {
      setPending(false)
    }
  }

  async function restore(account: AdminAccount, undo = false) {
    setBusyId(account.id)
    try {
      await restoreAdminAccount(account.id)
      toast.show({ kind: 'success', message: undo ? `Archive undone. ${fullName(account)} is active again` : `${fullName(account)} restored` })
    } catch {
      toast.show({
        kind: 'error',
        message: `Couldn't restore ${fullName(account)}. The request failed before anything changed, so the account is still archived. Check your connection, then retry.`,
        action: { label: 'Retry', onClick: () => void restore(account, undo) },
      })
    } finally {
      setBusyId(null)
    }
  }

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
      Add admin account
    </button>
  )

  return (
    <section aria-labelledby="admins-list" className={`${STAFF_SECTION} scroll-mt-14`}>
      <h2 id="admins-list" className="sr-only">
        Admins
      </h2>
      <AccountToolbar noun="admins" text={list.text} onText={list.setText} status={list.status} onStatus={list.setStatus} statuses={STATUSES} per={list.per} onPer={list.setPer} action={add} />
      <AccountTable
        list={list}
        label="Admin accounts with status, last sign-in and date added"
        noun="admin accounts"
        columns={COLUMNS}
        actions={
          manage
            ? (account) =>
                account.status === 'archived' ? (
                  <RowAction label={`Restore ${fullName(account)}`} icon={<RestoreIcon />} disabled={busyId === account.id} onClick={() => void restore(account)} />
                ) : (
                  <>
                    <RowAction label={`Reset password for ${fullName(account)}`} icon={<LockIcon size={16} />} onClick={() => reset.ask(account)} />
                    <RowAction
                      label={`Archive ${fullName(account)}`}
                      icon={<ArchiveIcon />}
                      onClick={() => {
                        setArchiving(account)
                        setAsking(true)
                      }}
                    />
                  </>
                )
            : undefined
        }
        empty={
          <>
            <p className="text-base font-semibold text-fg">No admin accounts yet</p>
            <p className="mt-1 mb-3 text-base text-fg-muted">Add an admin account to give someone access to user management.</p>
            {add}
          </>
        }
      />
      <CreateAccountSheet key={session} open={creating} onClose={() => setCreating(false)} noun="admin" create={createAdminAccount} />
      {manage && (
        <>
          <ConfirmDialog
            open={asking}
            title={archiving ? `Archive ${fullName(archiving)}?` : ''}
            confirmLabel="Archive account"
            pending={pending}
            onConfirm={() => archiving && void archive(archiving)}
            onClose={() => setAsking(false)}
          >
            They can no longer sign in, and the account moves to the Archived filter. You can restore it at any time.
          </ConfirmDialog>
          {reset.element}
        </>
      )}
    </section>
  )
}
