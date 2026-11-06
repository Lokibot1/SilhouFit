import { useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../components/admin/users/ConfirmDialog'
import { useToast } from '../components/toast/useToast'
import { requestPasswordReset, type PasswordResetErrorKind } from '../service/requestPasswordReset'
import { fullName } from '../utils/accountQuery'

type Person = { id: string; firstName: string; lastName: string; email: string }

/** What a failed send tells the admin: what happened, why, and what to do next. `retry` is set when trying again can help. */
function failureCopy(kind: PasswordResetErrorKind, email: string): { message: string; retry: boolean } {
  const head = `Couldn't send a password reset email to ${email}.`
  if (kind === 'rate-limit') return { message: `${head} The sign-in service limits how many emails it sends, so none was sent. Wait a few minutes, then try again.`, retry: false }
  if (kind === 'network') return { message: `${head} The connection dropped before it answered. Check your connection, then retry.`, retry: true }
  return { message: `${head} Something went wrong on the sign-in service's side. Retry in a moment.`, retry: true }
}

/**
 * Send a staff member's (or an admin's) password reset email through Supabase Auth: ask first, then send the recovery link to the account's address.
 * Nothing about the current password changes until they follow the link and choose a new one.
 * `element` must be rendered by the caller; `ask` opens the question for one account; `pendingId` is the account whose email is being sent.
 */
export function useSendPasswordReset(): { ask: (account: Person) => void; pendingId: string | null; element: ReactNode } {
  const toast = useToast()
  const [target, setTarget] = useState<Person | null>(null)
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState(false)

  async function confirm() {
    if (!target || pending) return
    const { email } = target
    setPending(true)
    try {
      await requestPasswordReset({ email })
      setAsking(false)
      toast.show({ kind: 'success', message: `Password reset email sent to ${email}` })
    } catch (error) {
      setAsking(false)
      const { message, retry } = failureCopy((error as { kind?: PasswordResetErrorKind } | null)?.kind ?? 'server', email)
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
        title={target ? `Send a password reset email to ${fullName(target)}?` : ''}
        confirmLabel="Send Reset Email"
        pending={pending}
        onConfirm={() => void confirm()}
        onClose={() => setAsking(false)}
      >
        {target ? fullName(target) : 'This person'} gets an email at {target?.email ?? 'their address'} with a link to choose a new password. Their current password keeps working until they do.
      </ConfirmDialog>
    ),
  }
}
