import { useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../components/admin/users/ConfirmDialog'
import { CredentialsSheet } from '../components/admin/users/CreateAccountSheet'
import { useToast } from '../components/toast/useToast'
import type { Credentials } from '../types/accounts'
import { fullName } from '../utils/accountQuery'

type Person = { id: string; firstName: string; lastName: string }

/**
 * Reset password for a staff account: ask first (the old password stops working), then show the new credentials once.
 * `element` must be rendered by the caller; `ask` opens the question for one account.
 */
export function useResetPassword(reset: (id: string) => Promise<{ credentials: Credentials }>): { ask: (account: Person) => void; element: ReactNode } {
  const toast = useToast()
  const [target, setTarget] = useState<Person | null>(null)
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState(false)
  const [issued, setIssued] = useState<{ credentials: Credentials; name: string } | null>(null)
  const [showing, setShowing] = useState(false)

  async function confirm() {
    if (!target) return
    setPending(true)
    try {
      const { credentials } = await reset(target.id)
      setAsking(false)
      setIssued({ credentials, name: fullName(target) })
      setShowing(true)
      toast.show({ kind: 'success', message: `Password reset for ${fullName(target)}` })
    } catch {
      setAsking(false)
      toast.show({
        kind: 'error',
        message: `Couldn't reset the password for ${fullName(target)}. The request failed before anything changed, so the old password still works. Check your connection, then retry.`,
        action: { label: 'Retry', onClick: () => setAsking(true) },
      })
    } finally {
      setPending(false)
    }
  }

  return {
    ask: (account) => {
      setTarget(account)
      setAsking(true)
    },
    element: (
      <>
        <ConfirmDialog
          open={asking}
          title={target ? `Reset password for ${fullName(target)}?` : ''}
          confirmLabel="Reset password"
          pending={pending}
          onConfirm={() => void confirm()}
          onClose={() => setAsking(false)}
        >
          The current password stops working at once. You get a new temporary password to hand over, and they choose their own at the next sign-in.
        </ConfirmDialog>
        <CredentialsSheet open={showing} credentials={issued?.credentials ?? null} heading={issued?.name ?? ''} onClose={() => setShowing(false)} />
      </>
    ),
  }
}
