import { useRef, useState, type FormEvent } from 'react'
import { changePassword, type ChangePasswordErrorKind } from '../../service/changePassword'
import { setLoginNotice } from '../../service/loginNotice'
import type { Me } from '../../service/fetchMe'
import { signOut } from '../../service/signOut'
import { stripEmoji, validateConfirmPassword, validatePassword } from '../../utils/signUpValidation'
import { FloatingField } from '../form/FloatingField'
import { PasswordChecklist } from '../form/PasswordChecklist'
import { AlertIcon, LockIcon, SpinnerIcon } from '../form/icons'
import { useToast } from '../toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON_SM } from '../ui/buttonStyles'
import { Modal } from '../ui/Modal'

type Failure = ChangePasswordErrorKind

/** What happened, why, and what to do next. Wrong and same passwords are shown on their fields instead. */
const BANNER_COPY: Record<Exclude<Failure, 'wrong-password' | 'same'>, { title: string; body: string }> = {
  weak: {
    title: 'Your password was not changed.',
    body: 'The server found the new password too weak. Make it longer and mix uppercase, lowercase, numbers and symbols, then try again.',
  },
  'rate-limit': {
    title: 'Too many attempts.',
    body: 'Your password was not changed. Wait a few minutes, then try again.',
  },
  unauthorized: {
    title: 'Your session has expired.',
    body: 'Your password was not changed. Sign in again, then change it from your profile.',
  },
  network: {
    title: 'Your password was not changed.',
    body: 'The connection dropped before we got a response. Check your connection and try again.',
  },
  unavailable: {
    title: 'Password changes are unavailable right now.',
    body: 'Your password was not changed because the server could not complete the request. Try again later, or contact an administrator if it keeps happening.',
  },
  server: {
    title: 'Your password was not changed.',
    body: 'Something went wrong on our side. Try again in a moment.',
  },
}

interface ChangePasswordSheetProps {
  open: boolean
  onClose: () => void
  me: Me
}

/** Staff only: the right-hand sheet on the profile where a signed-in staff member picks their own password. A success ends the session. */
export function ChangePasswordSheet({ open, onClose, me }: ChangePasswordSheetProps) {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState({ current: false, password: false, confirm: false })
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const inFlight = useRef(false)

  const currentError = !current ? 'Enter your current password.' : undefined
  const passwordError = validatePassword(password) ?? (current && password === current ? 'Choose a password different from your current one.' : undefined)
  const confirmError = validateConfirmPassword(password, confirm) ?? undefined

  const shown = (name: keyof typeof touched, error: string | undefined) => (touched[name] ? error : undefined)
  const serverCurrent = failure === 'wrong-password' ? 'That is not your current password. Check it and try again.' : undefined
  const serverPassword = failure === 'same' ? 'This is already your password. Choose a different one.' : undefined
  const banner = failure && failure !== 'wrong-password' && failure !== 'same' ? BANNER_COPY[failure] : null

  function close() {
    if (pending) return
    setCurrent('')
    setPassword('')
    setConfirm('')
    setTouched({ current: false, password: false, confirm: false })
    setFailure(null)
    onClose()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    setTouched({ current: true, password: true, confirm: true })
    const invalid = currentError ? 'cp-current' : passwordError ? 'cp-password' : confirmError ? 'cp-confirm' : null
    if (invalid) {
      document.getElementById(invalid)?.focus()
      return
    }
    inFlight.current = true
    setPending(true)
    setFailure(null)
    try {
      await changePassword(current, password)
      toast.show({ kind: 'success', message: 'Password changed. Sign in with your new password.' })
      setLoginNotice('password-changed')
      signOut()
    } catch (error) {
      const kind = (error as { kind?: Failure } | null)?.kind ?? 'server'
      setFailure(kind)
      if (kind === 'wrong-password') document.getElementById('cp-current')?.focus()
      else if (kind === 'same') document.getElementById('cp-password')?.focus()
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Change password"
      variant="sheet"
      footer={
        <button type="submit" form="change-password-form" disabled={pending} aria-busy={pending} className={`${PRIMARY_BUTTON} w-full`}>
          {pending ? <SpinnerIcon /> : <LockIcon size={16} />}
          Change password
        </button>
      }
    >
      <form id="change-password-form" noValidate onSubmit={(event) => void submit(event)} className="grid gap-4 pb-5">
        <p className="text-base text-fg-muted sm:text-sm">You will be signed out once it is changed, and sign in again with the new password.</p>
        <FloatingField
          id="cp-current"
          label="Current password"
          type="password"
          icon={<LockIcon size={16} />}
          value={current}
          onChange={(value) => {
            setCurrent(stripEmoji(value))
            if (failure === 'wrong-password') setFailure(null)
          }}
          onBlur={() => setTouched((t) => ({ ...t, current: true }))}
          error={serverCurrent ?? shown('current', currentError)}
          toggleLabel="current password"
          autoComplete="current-password"
          readOnly={pending}
        />
        <FloatingField
          id="cp-password"
          label="New password"
          type="password"
          icon={<LockIcon size={16} />}
          value={password}
          onChange={(value) => {
            setPassword(stripEmoji(value))
            if (failure === 'same') setFailure(null)
          }}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={serverPassword ?? shown('password', passwordError)}
          toggleLabel="new password"
          autoComplete="new-password"
          readOnly={pending}
        />
        <PasswordChecklist password={password} email={me.email} firstName={me.firstName} visible />
        <FloatingField
          id="cp-confirm"
          label="Confirm password"
          type="password"
          icon={<LockIcon size={16} />}
          value={confirm}
          onChange={(value) => setConfirm(stripEmoji(value))}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          error={shown('confirm', confirmError)}
          toggleLabel="confirm password"
          autoComplete="new-password"
          readOnly={pending}
        />
        {banner && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger p-3">
            <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-base font-semibold text-fg sm:text-sm">{banner.title}</p>
              <p className="mt-1 text-base text-fg-muted sm:text-sm">{banner.body}</p>
              {failure === 'unauthorized' && (
                <button type="button" onClick={signOut} className={`${SECONDARY_BUTTON_SM} mt-3`}>
                  Sign in again
                </button>
              )}
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
