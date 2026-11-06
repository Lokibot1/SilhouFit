import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthHeading, AuthSplit } from '../../components/auth/AuthSplit'
import { FloatingField } from '../../components/form/FloatingField'
import { AlertIcon, CheckIcon, MailIcon, SpinnerIcon } from '../../components/form/icons'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { useToast } from '../../components/toast/useToast'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { requestPasswordReset } from '../../service/requestPasswordReset'
import { normalizeEmail, stripEmoji, validateEmail } from '../../utils/signUpValidation'

const META_DESCRIPTION =
  'Forgot your KRAL password? Enter your email and we will send a link to choose a new one. The link works for 30 minutes, then you can sign in again.'

type Status = 'editing' | 'pending' | 'success' | 'error'

export function ForgotPasswordPage() {
  useDocumentTitle('Reset your password — KRAL')
  useMetaDescription(META_DESCRIPTION)

  const toast = useToast()
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [status, setStatus] = useState<Status>('editing')
  const inFlight = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const submitRef = useRef<() => void>(() => {})

  useEffect(
    () => () => {
      controller.current?.abort()
      // A leftover toast's "Try again" must not re-run the request after leaving the page.
      submitRef.current = () => {}
    },
    [],
  )

  const error = touched ? validateEmail(email) : null
  const pending = status === 'pending'

  async function submit() {
    if (inFlight.current) return
    setTouched(true)
    if (validateEmail(email)) {
      document.getElementById('forgot-email')?.focus()
      return
    }

    inFlight.current = true
    const abort = new AbortController()
    controller.current = abort
    setStatus('pending')
    try {
      await requestPasswordReset({ email: normalizeEmail(email) }, { signal: abort.signal })
      setStatus('success')
      toast.show({ kind: 'success', message: 'Reset request sent. Check your email.' })
    } catch {
      if (abort.signal.aborted) return
      setStatus('error')
      toast.show({
        kind: 'error',
        message: "We couldn't send the reset link. Check your connection and try again.",
        action: { label: 'Try again', onClick: () => submitRef.current() },
      })
    } finally {
      inFlight.current = false
    }
  }
  useEffect(() => {
    submitRef.current = submit
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void submit()
  }

  return (
    <AuthSplit photo={false}>
      <div className="[&>*+*]:mt-4 short:[&>*+*]:mt-3 lg:[&>*+*]:mt-3">
        <AuthHeading
          title="Reset your password"
          subtitle={
            status === 'success'
              ? 'Check your email.'
              : "Enter the email you signed up with and we'll send you a link to choose a new password."
          }
        />
        {status === 'success' ? (
          <div>
            <span className="flex size-10 items-center justify-center rounded-full border border-line-strong text-success">
              <CheckIcon />
            </span>
            <p className="mt-4 text-base leading-relaxed text-fg">
              If an account exists for that address, we've sent a link to reset your password. The link expires in 30
              minutes.
            </p>
            <Link to="/login" className={`${PRIMARY_BUTTON} mt-6 w-full`}>
              Back to login
            </Link>
          </div>
        ) : (
          <form noValidate onSubmit={onSubmit} aria-busy={pending} className="[&>*+*]:mt-4 lg:[&>*+*]:mt-3">
            <FloatingField
              id="forgot-email"
              label="Email"
              type="email"
              icon={<MailIcon size={16} />}
              value={email}
              error={error ?? undefined}
              readOnly={pending}
              onChange={(value) => setEmail(stripEmoji(value))}
              onBlur={() => setTouched(true)}
              autoComplete="email"
              inputMode="email"
              enterKeyHint="done"
            />

            {status === 'error' && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-snug"
              >
                <AlertIcon size={20} className="mt-px text-danger" />
                <p>
                  <strong className="block font-semibold text-fg">We couldn't send the reset link.</strong>
                  <span className="text-fg-muted">
                    The connection dropped before we got a response. Check your connection and try again.
                  </span>
                </p>
              </div>
            )}

            <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON} w-full`}>
              {pending ? (
                <>
                  <SpinnerIcon />
                  Sending…
                </>
              ) : (
                'Send reset link'
              )}
            </button>
            <Link to="/login" className={`${SECONDARY_BUTTON} w-full`}>
              Back to login
            </Link>
          </form>
        )}
      </div>
    </AuthSplit>
  )
}
