import { useRef, useState, type FormEvent } from 'react'
import { canSkipPasswordChange, passwordGateSkipKey } from '../../config/accountPolicy'
import { changePassword, skipPasswordChange } from '../../service/accountService'
import type { Me } from '../../service/fetchMe'
import { stripEmoji, validatePassword } from '../../utils/signUpValidation'
import { FloatingField } from '../form/FloatingField'
import { PasswordChecklist } from '../form/PasswordChecklist'
import { AlertIcon, LockIcon, SpinnerIcon } from '../form/icons'
import { useToast } from '../toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'
import { Modal } from '../ui/Modal'

const dismissalKey = passwordGateSkipKey

function wasSkipped(id: string) {
  try {
    return sessionStorage.getItem(dismissalKey(id)) === '1'
  } catch {
    return false
  }
}

interface FirstLoginPasswordGateProps {
  me: Me
  /** The password was saved: the account no longer needs a change. */
  onChanged: () => void
}

/**
 * Asks someone on a temporary password to choose their own, over whatever page they opened. "Skip for now" appears only while the policy
 * allows it (canSkipPasswordChange); skipping hides the screen for this browser session only, and the account stays flagged, so it returns at the next sign-in.
 */
export function FirstLoginPasswordGate({ me, onChanged }: FirstLoginPasswordGateProps) {
  const toast = useToast()
  const [skipped, setSkipped] = useState(() => wasSkipped(me.id))
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState({ password: false, confirm: false })
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const inFlight = useRef(false)
  const skippable = canSkipPasswordChange(me)

  const passwordError = validatePassword(password) ?? undefined
  const confirmError = !confirm ? 'Type the new password again.' : confirm !== password ? 'The two passwords do not match.' : undefined

  async function save(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    setTouched({ password: true, confirm: true })
    if (passwordError || confirmError) {
      document.getElementById(passwordError ? 'gate-password' : 'gate-confirm')?.focus()
      return
    }
    inFlight.current = true
    setPending(true)
    setFailed(false)
    try {
      await changePassword(me.id, password)
      toast.show({ kind: 'success', message: 'Password updated. Use it the next time you sign in.' })
      onChanged()
    } catch {
      setFailed(true)
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  async function skip() {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    try {
      await skipPasswordChange()
      try {
        sessionStorage.setItem(dismissalKey(me.id), '1')
      } catch {
        // Storage is blocked: the screen stays hidden for this page load only.
      }
      setSkipped(true)
      toast.show({ kind: 'info', message: 'Password change skipped. You will be asked again the next time you sign in.' })
    } catch {
      toast.show({ kind: 'error', message: 'You need to change your password before you continue. Choose a new one to go on.' })
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <Modal
      open={Boolean(me.mustChangePassword) && !skipped}
      onClose={skippable && !pending ? () => void skip() : () => {}}
      title="Choose a new password"
      icon={<LockIcon />}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {skippable && (
            <button type="button" onClick={() => void skip()} disabled={pending} className={SECONDARY_BUTTON}>
              Skip for now
            </button>
          )}
          <button type="submit" form="first-login-form" disabled={pending} aria-busy={pending} className={PRIMARY_BUTTON}>
            {pending && <SpinnerIcon />}
            Save password
          </button>
        </div>
      }
    >
      <form id="first-login-form" noValidate onSubmit={(event) => void save(event)} className="grid gap-4 pb-5">
        <p className="text-xs text-fg-muted">You signed in with a temporary password. Choose your own now so only you know it.</p>
        <FloatingField
          id="gate-password"
          label="New password"
          type="password"
          icon={<LockIcon size={16} />}
          value={password}
          onChange={(value) => setPassword(stripEmoji(value))}
          onBlur={() => setTouched((current) => ({ ...current, password: true }))}
          error={touched.password ? passwordError : undefined}
          autoComplete="new-password"
          readOnly={pending}
        />
        <PasswordChecklist password={password} email={me.email} firstName={me.firstName} visible />
        <FloatingField
          id="gate-confirm"
          label="Confirm new password"
          type="password"
          icon={<LockIcon size={16} />}
          value={confirm}
          onChange={(value) => setConfirm(stripEmoji(value))}
          onBlur={() => setTouched((current) => ({ ...current, confirm: true }))}
          error={touched.confirm ? confirmError : undefined}
          autoComplete="new-password"
          readOnly={pending}
        />
        {failed && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger p-3">
            <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">We couldn&apos;t save your password.</p>
              <p className="mt-1 text-sm text-fg-muted">Something went wrong before it was saved, so your temporary password still works. Check your connection, then save again.</p>
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
