import { motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FloatingField } from '../../components/form/FloatingField'
import { AlertIcon, CheckIcon, MailIcon, SpinnerIcon } from '../../components/form/icons'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { useToast } from '../../components/toast/useToast'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { Reveal } from '../../motion/Reveal'
import { requestPasswordReset } from '../../service/requestPasswordReset'
import { normalizeEmail, stripEmoji, validateEmail } from '../../utils/signUpValidation'

const META_DESCRIPTION =
  'Forgot your SilhouFit password? Enter your email and we will send a link to choose a new one. The link works for 30 minutes, then you can sign in again.'

type Status = 'editing' | 'pending' | 'success' | 'error'

export function ForgotPasswordPage() {
  useDocumentTitle('Reset your password — SilhouFit')
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
    <div className="relative flex min-h-svh flex-col items-center justify-center px-4 py-14 max-[359px]:px-3 sm:px-6">
      <Reveal>
        <h1 className="display mb-3 text-center text-[clamp(1.75rem,4vw,2.5rem)] text-fg">Reset your password</h1>
      </Reveal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.shift, ease: EASE_OUT }}
        className="glass-card glass-elevated w-full max-w-md rounded-2xl px-4 py-4 wrap-break-word max-[359px]:px-3 sm:px-6 sm:py-6 short:py-4"
      >
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
          <form noValidate onSubmit={onSubmit} aria-busy={pending} className="[&>*+*]:mt-2.5">
            <p className="text-xs leading-snug text-fg-muted">
              Enter the email you signed up with and we'll send you a link to choose a new password.
            </p>
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
      </motion.div>
    </div>
  )
}
