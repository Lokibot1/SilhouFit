import { useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../components/admin/users/ConfirmDialog'
import { useToast } from '../components/toast/useToast'
import { resetStaffPasswordApi } from '../service/staffApi'
import { fullName } from '../utils/accountQuery'

type Person = { id: string; firstName: string; lastName: string }

/** What a failed reset tells the admin: what happened, why, and what to do next. `retry` is set when trying again can help. */
function failureCopy(error: unknown, name: string): { message: string; retry: boolean } {
  const { status, code } = (error ?? {}) as { status?: number; code?: string }
  const head = `Couldn't reset the password for ${name}.`
  if (status === 401) return { message: `${head} Your session expired. Sign in again, then retry.`, retry: false }
  if (status === 403 && code === 'not_a_staff_account')
    return { message: `${name} is not a staff account, so it can't be reset here. Refresh the list.`, retry: false }
  if (status === 403)
    return { message: `${head} Your account isn't allowed to reset staff passwords, so nothing changed. Sign in with an admin account or ask a superadmin.`, retry: false }
  if (status === 404 || code === 'staff_not_found')
    return { message: `${head} This staff account no longer exists, so nothing changed. Refresh the list to see who is still there.`, retry: false }
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
 * Reset a staff member's password: ask first (they are signed out everywhere and the default password works until they change it), then call the API.
 * `element` must be rendered by the caller; `ask` opens the question for one account; `pendingId` is the account whose reset is in flight.
 * `onMissing` runs when the server says the account is gone, so the caller can reload its list.
 */
export function useResetStaffPassword(onMissing: () => void): { ask: (account: Person) => void; pendingId: string | null; element: ReactNode } {
  const toast = useToast()
  const [target, setTarget] = useState<Person | null>(null)
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState(false)

  async function confirm() {
    if (!target || pending) return
    const name = fullName(target)
    setPending(true)
    try {
      await resetStaffPasswordApi(target.id)
      setAsking(false)
      toast.show({ kind: 'success', message: `Password reset for ${name}. They are signed out and must sign in with the default password.` })
    } catch (error) {
      setAsking(false)
      const { message, retry } = failureCopy(error, name)
      const { status, code } = (error ?? {}) as { status?: number; code?: string }
      if (status === 404 || (status === 403 && code === 'not_a_staff_account')) onMissing()
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
