import { useRef, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../components/admin/users/ConfirmDialog'
import { useToast, type ToastOptions } from '../components/toast/useToast'
import { activateAccountApi, deactivateAccountApi } from '../service/staffApi'
import { fullName } from '../utils/accountQuery'

type Person = { id: string; firstName: string; lastName: string }
type Action = 'deactivate' | 'activate'

/** What differs between a customer, staff and an admin account: the noun in the copy, who may act on it, and the dialog copy. */
const KINDS = {
  customer: {
    noun: 'customer',
    forbidden: (verb: string) => `Your account isn't allowed to ${verb} customers, so nothing changed. Sign in with an admin or superadmin account.`,
    confirmLabel: 'Deactivate Customer',
    consequences: "can't sign in or shop until activated again. Their account stays in the customer list under the Inactive filter, and you can activate it again from there.",
  },
  staff: {
    noun: 'staff',
    forbidden: (verb: string) => `Your account isn't allowed to ${verb} staff, so nothing changed. Sign in with an admin account or ask a superadmin.`,
    confirmLabel: 'Deactivate Staff',
    consequences: "can't sign in or refresh their session until activated again. Their account stays in the staff list under the Inactive filter, and you can activate it again from there.",
  },
  admin: {
    noun: 'admin',
    forbidden: (verb: string) => `Only a superadmin can ${verb} admins, so nothing changed. Sign in with a superadmin account.`,
    confirmLabel: 'Deactivate Admin',
    consequences: "can't sign in or refresh their session until activated again. Their account stays in the admin list under the Inactive filter, and you can activate it again from there.",
  },
}
type Kind = keyof typeof KINDS

/** What a failed deactivate or activate tells the admin: what happened, why, and what to do next. `reload` is set when the list is out of date; `retry` when trying again can help. */
function failureCopy(action: Action, error: unknown, name: string, kind: Kind): Pick<ToastOptions, 'kind' | 'message'> & { retry: boolean; reload: boolean } {
  const { status, detail } = (error ?? {}) as { status?: number; detail?: string }
  const { noun, forbidden } = KINDS[kind]
  const head = `Couldn't ${action} ${name}.`
  const fail = (message: string, retry = false, reload = false) => ({ kind: 'error' as const, message, retry, reload })
  if (status === 401) return fail(`${head} Your session expired. Sign in again, then retry.`)
  if (status === 403 && /own account/i.test(detail ?? '')) return fail(`${head} You can't deactivate your own account, so nothing changed. Ask another administrator to do it.`)
  if (status === 403 && /is deactivated/i.test(detail ?? '')) return fail(`${head} Your own account has been deactivated, so you can't manage accounts. Contact a superadmin.`)
  if (status === 403) return fail(`${head} ${forbidden(action)}`)
  if (status === 404) return fail(`${head} This ${noun} account no longer exists, so nothing changed. The list has been refreshed.`, false, true)
  if (status === 429) return fail(`${head} Too many requests were sent, so nothing changed. Wait a few minutes, then try again.`)
  if (status === 400) return fail(`${head} The server rejected the request, so nothing changed. The list has been refreshed; try again.`, false, true)
  return fail(`We couldn't confirm the result for ${name}. Retry is safe, or check the list after a minute.`, true)
}

/**
 * Deactivate and activate staff accounts (or, with `kind` 'admin', admin accounts). Deactivating asks first (the person cannot sign in until activated again); activating does not.
 * `element` must be rendered by the caller; `ask` opens the deactivate question; `activate` runs at once; `pendingId` is the account whose request is in flight.
 * `reload` runs whenever the list may have changed, so the caller can reload it.
 */
export function useDeactivateAccount(reload: () => void, kind: Kind = 'staff'): { ask: (account: Person) => void; activate: (account: Person) => void; pendingId: string | null; element: ReactNode } {
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
      await (action === 'deactivate' ? deactivateAccountApi : activateAccountApi)(account.id)
      setAsking(false)
      reload()
      toast.show(
        action === 'deactivate'
          ? { kind: 'success', message: `${name} deactivated.`, action: { label: 'Undo', onClick: () => void run('activate', account, true) } }
          : { kind: 'success', message: undo ? `Deactivation undone. ${name} can sign in again.` : `${name} activated. They can sign in with their current password.` },
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
    activate: (account) => void run('activate', account),
    pendingId,
    element: (
      <ConfirmDialog
        open={asking}
        title={target ? `Deactivate ${fullName(target)}?` : ''}
        confirmLabel={KINDS[kind].confirmLabel}
        pending={asking && pendingId === target?.id}
        onConfirm={() => target && void run('deactivate', target)}
        onClose={() => setAsking(false)}
      >
        {target ? fullName(target) : 'This person'} {KINDS[kind].consequences}
      </ConfirmDialog>
    ),
  }
}

/** The same deactivate and activate for a customer account (an admin or a superadmin may). */
export const useDeactivateCustomer = (reload: () => void) => useDeactivateAccount(reload, 'customer')

/** The same deactivate and activate for an admin account (superadmin only; the server refuses anyone else). */
export const useDeactivateAdmin = (reload: () => void) => useDeactivateAccount(reload, 'admin')
