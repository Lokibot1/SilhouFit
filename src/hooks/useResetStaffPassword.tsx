import { useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../components/admin/users/ConfirmDialog'
import { useToast } from '../components/toast/useToast'
import { resetAdminPasswordApi, resetStaffPasswordApi } from '../service/staffApi'
import { fullName } from '../utils/accountQuery'

type Person = { id: string; firstName: string; lastName: string }

/** What differs between resetting a staff and an admin account: the API call, the noun in the copy, the server's code for a wrong account type, and who may do it. */
const KINDS = {
  staff: {
    api: resetStaffPasswordApi,
    noun: 'staff',
    wrongType: 'not_a_staff_account',
    forbidden: "Your account isn't allowed to reset staff passwords, so nothing changed. Sign in with an admin account or ask a superadmin.",
  },
  admin: {
    api: resetAdminPasswordApi,
    noun: 'admin',
    wrongType: 'not_an_admin_account',
    forbidden: 'Only a superadmin can reset admin passwords, so nothing changed. Sign in with a superadmin account.',
  },
}
type Kind = keyof typeof KINDS

/** What a failed reset tells the admin: what happened, why, and what to do next. `retry` is set when trying again can help. */
function failureCopy(error: unknown, name: string, kind: Kind): { message: string; retry: boolean } {
  const { status, code } = (error ?? {}) as { status?: number; code?: string }
  const { noun, wrongType, forbidden } = KINDS[kind]
  const head = `Couldn't reset the password for ${name}.`
  if (status === 401) return { message: `${head} Your session expired. Sign in again, then retry.`, retry: false }
  if (status === 403 && code === wrongType)
    return { message: `${name} is not ${noun === 'admin' ? 'an' : 'a'} ${noun} account, so it can't be reset here. Refresh the list.`, retry: false }
  if (status === 403) return { message: `${head} ${forbidden}`, retry: false }
  if (status === 404 || code === `${noun}_not_found`)
    return { message: `${head} This ${noun} account no longer exists, so nothing changed. Refresh the list to see who is still there.`, retry: false }
  if (status === 422)
    return { message: `${head} The sign-in service rejected the default password, so nothing changed. Ask the project owner to adjust the password settings.`, retry: false }
  if (status === 429) return { message: `${head} Too many requests were sent, so nothing changed. Wait a few minutes, then try again.`, retry: false }
  if (status === 503 || (status === 502 && code === 'reset_not_applied'))
    return { message: `${head} The service couldn't apply the reset, so nothing changed and the old password still works. Wait a moment, then retry.`, retry: true }
  if (status === 502)
    return { message: `The password may already be reset to the default, but the account wasn't fully secured. Retry now to finish; it is safe to repeat.`, retry: true }
  return { message: `We couldn't confirm the result. The password may or may not have been reset. Retry is safe, or check the list after a minute.`, retry: true }
}

/**
 * Reset a staff member's (or, with `kind` 'admin', an admin's) password: ask first (they are signed out everywhere and the default password works until they change it), then call the API.
 * `element` must be rendered by the caller; `ask` opens the question for one account; `pendingId` is the account whose reset is in flight.
 * `onMissing` runs when the server says the account is gone, so the caller can reload its list.
 */
export function useResetStaffPassword(onMissing: () => void, kind: Kind = 'staff'): { ask: (account: Person) => void; pendingId: string | null; element: ReactNode } {
  const toast = useToast()
  const [target, setTarget] = useState<Person | null>(null)
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState(false)

  async function confirm() {
    if (!target || pending) return
    const name = fullName(target)
    setPending(true)
    try {
      await KINDS[kind].api(target.id)
      setAsking(false)
      toast.show({ kind: 'success', message: `Password reset for ${name}. They are signed out and must sign in with the default password.` })
    } catch (error) {
      setAsking(false)
      const { message, retry } = failureCopy(error, name, kind)
      const { status, code } = (error ?? {}) as { status?: number; code?: string }
      if (status === 404 || (status === 403 && code === KINDS[kind].wrongType)) onMissing()
      toast.show({ kind: 'error', message, ...(retry && { action: { label: 'Retry', onClick: () => setAsking(true) } }) })
    } finally {
      setPending(false)
    }
  }

  return {
    ask: (account) => {
      setTarget(account)
      setAsking(true)
    },
    pendingId: pending ? (target?.id ?? null) : null,
    element: (
      <ConfirmDialog
        open={asking}
        title={target ? `Reset password for ${fullName(target)}?` : ''}
        confirmLabel="Reset Password"
        pending={pending}
        onConfirm={() => void confirm()}
        onClose={() => setAsking(false)}
      >
        Their password will be set to the default password 1234567a and they will be signed out everywhere. They must sign in with it and choose a new password. Until they do,
        anyone who knows the default can sign in as them, so tell them to change it right away.
      </ConfirmDialog>
    ),
  }
}

/** The same reset for an admin account (superadmin only; the server refuses anyone else). */
export const useResetAdminPassword = (onMissing: () => void) => useResetStaffPassword(onMissing, 'admin')
