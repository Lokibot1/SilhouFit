import { useRef, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../components/admin/users/ConfirmDialog'
import { useToast, type ToastOptions } from '../components/toast/useToast'
import { archiveAdminAccountApi, archiveStaffAccountApi, restoreAdminAccountApi, restoreStaffAccountApi } from '../service/staffApi'
import { fullName } from '../utils/accountQuery'

type Person = { id: string; firstName: string; lastName: string }
type Action = 'archive' | 'restore'

/** What differs between archiving a staff and an admin account: the API calls, the noun in the copy, the server's code for a wrong account type, and the dialog copy. */
const KINDS = {
  staff: {
    archive: archiveStaffAccountApi,
    restore: restoreStaffAccountApi,
    noun: 'staff',
    article: 'a',
    wrongType: 'not_a_staff_account',
    forbidden: (verb: string) => `Your account isn't allowed to ${verb} staff, so nothing changed. Sign in with an admin account or ask a superadmin.`,
    confirmLabel: 'Archive Staff',
    consequences: "will be signed out everywhere and won't be able to sign in. Their account is hidden from the staff list but kept, and you can restore it from the Archived filter.",
  },
  admin: {
    archive: archiveAdminAccountApi,
    restore: restoreAdminAccountApi,
    noun: 'admin',
    article: 'an',
    wrongType: 'not_an_admin_account',
    forbidden: (verb: string) => `Only a superadmin can ${verb} admins, so nothing changed. Sign in with a superadmin account.`,
    confirmLabel: 'Archive Admin',
    consequences: "will be signed out everywhere and can't sign in until restored. Their account is hidden from the admin list but kept, and you can restore it from the Archived filter.",
  },
}
type Kind = keyof typeof KINDS

/** What a failed archive or restore tells the admin: what happened, why, and what to do next. `reload` is set when the list is out of date; `retry` when trying again can help. */
function failureCopy(action: Action, error: unknown, name: string, kind: Kind): Pick<ToastOptions, 'kind' | 'message'> & { retry: boolean; reload: boolean } {
  const { status, code } = (error ?? {}) as { status?: number; code?: string }
  const { noun, article, wrongType, forbidden } = KINDS[kind]
  const verb = action === 'archive' ? 'archive' : 'restore'
  const head = `Couldn't ${verb} ${name}.`
  const fail = (message: string, retry = false, reload = false) => ({ kind: 'error' as const, message, retry, reload })
  if (status === 401) return fail(`${head} Your session expired. Sign in again, then retry.`)
  if (status === 403 && code === wrongType) return fail(`${name} is not ${article} ${noun} account, so it can't be ${verb}d here. The list has been refreshed.`, false, true)
  if (status === 403) return fail(`${head} ${forbidden(verb)}`)
  if (status === 404) return fail(`${head} This ${noun} account no longer exists, so nothing changed. The list has been refreshed.`, false, true)
  if (status === 409)
    return {
      kind: 'info',
      message: `${name} is already ${action === 'archive' ? 'archived' : 'active'}. The list was out of date, so it has been refreshed.`,
      retry: false,
      reload: true,
    }
  if (status === 429) return fail(`${head} Too many requests were sent, so nothing changed. Wait a few minutes, then try again.`)
  if (status === 502 && code === `${action}_incomplete`)
    return fail(
      action === 'archive'
        ? `${name} is blocked from signing in, but the archive did not finish. Retry now to finish; it is safe to repeat.`
        : `The restore for ${name} was only partly applied and did not finish. Retry now to finish; it is safe to repeat.`,
      true,
    )
  if (status === 503 || (status === 502 && (code === `${action}_not_applied` || code === 'other')))
    return fail(`${head} Nothing changed. The service couldn't apply it, so wait a moment, then retry.`, true)
  return fail(`We couldn't confirm the result. Retry is safe, or check the list after a minute.`, true)
}

/**
 * Archive and restore staff accounts (or, with `kind` 'admin', admin accounts). Archiving asks first (the person is signed out everywhere and cannot sign in until restored); restoring does not.
 * `element` must be rendered by the caller; `ask` opens the archive question; `restore` runs at once; `pendingId` is the account whose request is in flight.
 * `reload` runs whenever the list may have changed, so the caller can reload it.
 */
export function useArchiveStaff(reload: () => void, kind: Kind = 'staff'): { ask: (account: Person) => void; restore: (account: Person) => void; pendingId: string | null; element: ReactNode } {
  const toast = useToast()
  const [target, setTarget] = useState<Person | null>(null)
  const [asking, setAsking] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const busy = useRef(false)

  async function run(action: Action, account: Person, undo = false) {
    if (busy.current) return
    busy.current = true
    const name = fullName(account)
    setPendingId(account.id)
    try {
      await KINDS[kind][action](account.id)
      setAsking(false)
      reload()
      toast.show(
        action === 'archive'
          ? { kind: 'success', message: `${name} archived.`, action: { label: 'Undo', onClick: () => void run('restore', account, true) } }
          : { kind: 'success', message: undo ? `Archive undone. ${name} can sign in again.` : `${name} restored. They can sign in with their current password.` },
      )
    } catch (error) {
      setAsking(false)
      const { retry, reload: stale, ...copy } = failureCopy(action, error, name, kind)
      if (stale) reload()
      toast.show({ ...copy, ...(retry && { action: { label: 'Retry', onClick: () => void run(action, account, undo) } }) })
    } finally {
      busy.current = false
      setPendingId(null)
    }
  }

  return {
    ask: (account) => {
      setTarget(account)
      setAsking(true)
    },
    restore: (account) => void run('restore', account),
    pendingId,
    element: (
      <ConfirmDialog
        open={asking}
        title={target ? `Archive ${fullName(target)}?` : ''}
        confirmLabel={KINDS[kind].confirmLabel}
        pending={asking && pendingId === target?.id}
        onConfirm={() => target && void run('archive', target)}
        onClose={() => setAsking(false)}
      >
        {target ? fullName(target) : 'This person'} {KINDS[kind].consequences}
      </ConfirmDialog>
    ),
  }
}

/** The same archive and restore for an admin account (superadmin only; the server refuses anyone else). */
export const useArchiveAdmin = (reload: () => void) => useArchiveStaff(reload, 'admin')
