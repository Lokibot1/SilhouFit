import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthHeading, AuthSplit } from '../../components/auth/AuthSplit'
import { CALLBACK_BLOCK, CallbackSkeleton } from '../../components/form/CallbackSkeleton'
import { FloatingField } from '../../components/form/FloatingField'
import { PasswordChecklist } from '../../components/form/PasswordChecklist'
import { AlertIcon, LockIcon, SpinnerIcon } from '../../components/form/icons'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { fetchMe } from '../../service/fetchMe'
import { setSession } from '../../service/session'
import { signOut } from '../../service/signOut'
import { getSupabase } from '../../service/supabase'
import { stripEmoji, validateConfirmPassword, validatePassword } from '../../utils/signUpValidation'
import { homeFor } from '../../utils/staffRole'

const META_DESCRIPTION =
  'Choose your own KRAL password after following an invitation or password reset email, then continue to your account. The email link works once and expires.'

type Failure = 'weak' | 'same' | 'rate-limit' | 'network' | 'expired' | 'server'

const FAILURE_COPY: Record<Exclude<Failure, 'weak' | 'same'>, { title: string; body: string }> = {
  'rate-limit': { title: 'Too many attempts.', body: 'Your password was not set. Wait a few minutes, then try again.' },
  network: { title: 'Your password was not set.', body: 'The connection dropped before we got a response. Check your connection and try again.' },
  expired: { title: 'This link has expired.', body: 'Your password was not set. Ask for a new reset email from the login page.' },
  server: { title: 'Your password was not set.', body: 'Something went wrong on our side. Try again in a moment.' },
}

// The session behind the emailed link is gone or no longer valid: Supabase says so with a 401 or 403, one of these codes, or its own missing-session error.
const isSessionError = ({ code, status, name }: { code?: string; status?: number; name?: string }) =>
  status === 401 || status === 403 || name === 'AuthSessionMissingError' || /^(session_|bad_jwt|refresh_token_|user_not_found)/.test(code ?? '')

type View = 'checking' | 'missing' | 'form'

/** Where the invitation and recovery emails end up (through /auth/callback): the person has a session but chooses their own password here. */
export function SetPasswordPage() {
  useDocumentTitle('Choose your password — KRAL')
  useMetaDescription(META_DESCRIPTION)

  const navigate = useNavigate()
  const toast = useToast()
  const [view, setView] = useState<View>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState({ password: false, confirm: false })
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [detail, setDetail] = useState<string | undefined>()
  const inFlight = useRef(false)

  useEffect(() => {
    let live = true
    getSupabase()
      .then((supabase) => supabase.auth.getSession())
      .then(({ data }) => live && setView(data.session ? 'form' : 'missing'))
      .catch(() => live && setView('missing'))
    return () => {
      live = false
    }
  }, [])

  const passwordError = validatePassword(password) ?? undefined
  const confirmError = validateConfirmPassword(password, confirm) ?? undefined
  const shown = (name: keyof typeof touched, error: string | undefined) => (touched[name] ? error : undefined)
  const serverPassword = failure === 'same' ? 'This is already your password. Choose a different one.' : undefined
  const banner =
    failure === 'weak'
      ? { title: 'Your password was not set.', body: `${detail ?? 'The sign-in service found the password too weak.'} Choose a longer or less common password, then try again.` }
      : failure && failure !== 'same'
        ? FAILURE_COPY[failure]
        : null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    setTouched({ password: true, confirm: true })
    const invalid = passwordError ? 'sp-password' : confirmError ? 'sp-confirm' : null
    if (invalid) {
      document.getElementById(invalid)?.focus()
      return
    }
    inFlight.current = true
    setPending(true)
    setFailure(null)
    setDetail(undefined)
    try {
      const supabase = await getSupabase()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        const { code, status, message } = error as { code?: string; status?: number; message?: string }
        const sessionGone = isSessionError(error)
        setFailure(
          code === 'same_password' ? 'same'
            : code === 'weak_password' ? 'weak'
              : status === 429 || code === 'over_request_rate_limit' ? 'rate-limit'
                : status === 0 ? 'network'
                  : sessionGone ? 'expired'
                    : 'server',
        )
        if (code === 'weak_password') setDetail(message)
        if (code === 'same_password') document.getElementById('sp-password')?.focus()
        return
      }
      const me = await fetchMe()
      setSession({ name: me.fullName ?? `${me.firstName} ${me.lastName}`, email: me.email, avatarUrl: me.avatarUrl ?? undefined, role: me.role })
      toast.show({ kind: 'success', message: 'Password set. Welcome to KRAL.' })
      navigate(homeFor(me.role), { replace: true })
    } catch (error) {
      // The password is set, but the profile could not be loaded: sign in again with it.
      if (isSessionError((error ?? {}) as object)) {
        setFailure('expired')
        return
      }
      const kind = (error as { kind?: string } | null)?.kind
      if (kind === 'unauthorized' || kind === 'not-found') {
        signOut()
        navigate('/login', { replace: true })
        return
      }
      setFailure(kind === 'network' ? 'network' : 'server')
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  if (view === 'checking') return <CallbackSkeleton />

  if (view === 'missing') {
    return (
      <AuthSplit photo={false}>
        <div className={CALLBACK_BLOCK}>
          <span className="flex size-10 items-center justify-center rounded-full border border-line-strong text-danger">
            <AlertIcon size={20} />
          </span>
          <div role="alert">
            <h1 className="display mt-4 text-3xl text-fg">This link has expired.</h1>
            <p className="mt-2 text-base leading-relaxed text-fg-muted">
              The invitation or reset link was already used or is out of date, so no password was set. Request a new reset email, or ask an administrator to invite you again.
            </p>
          </div>
          <div className="mt-auto flex flex-col gap-3 pt-6">
            <Link to="/forgot-password" className={PRIMARY_BUTTON}>
              Send a new reset email
            </Link>
            <Link to="/login" className={SECONDARY_BUTTON}>
              Back to login
            </Link>
          </div>
        </div>
      </AuthSplit>
    )
  }

  return (
    <AuthSplit photo={false}>
      <div className="[&>*+*]:mt-4 short:[&>*+*]:mt-3 lg:[&>*+*]:mt-3">
        <AuthHeading title="Choose your password" subtitle="Pick a password only you know. You will use it to sign in from now on." />
        <form noValidate onSubmit={(event) => void submit(event)} aria-busy={pending} className="[&>*+*]:mt-4 lg:[&>*+*]:mt-3">
          <FloatingField
            id="sp-password"
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
          <PasswordChecklist password={password} email="" firstName="" visible />
          <FloatingField
            id="sp-confirm"
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
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-snug">
              <AlertIcon size={20} className="mt-px text-danger" />
              <p>
                <strong className="block font-semibold text-fg">{banner.title}</strong>
                <span className="text-fg-muted">{banner.body}</span>
              </p>
            </div>
          )}
          <button type="submit" disabled={pending} aria-busy={pending} className={`${PRIMARY_BUTTON} w-full`}>
            {pending ? (
              <>
                <SpinnerIcon />
                Saving…
              </>
            ) : (
              'Set password'
            )}
          </button>
        </form>
      </div>
    </AuthSplit>
  )
}
