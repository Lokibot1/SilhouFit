import { motion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CountrySelect } from '../components/form/CountrySelect'
import { FloatingField } from '../components/form/FloatingField'
import { GoogleButton } from '../components/form/GoogleButton'
import { AlertIcon, CheckIcon, MailIcon, SpinnerIcon } from '../components/form/icons'
import { LegalModal } from '../components/legal/LegalModal'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../components/ui/buttonStyles'
import { fieldId, useSignUpForm } from '../hooks/useSignUpForm'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useMetaDescription } from '../hooks/useMetaDescription'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { Reveal } from '../motion/Reveal'
import { LIMITS, type FieldName } from '../utils/signUpValidation'

const META_DESCRIPTION =
  'Create your SilhouFit account to save your fit profile, try clothes with AR fitting and shop boutiques and online with one secure sign in. It takes a minute.'

const GAPS = '[&>*+*]:mt-2.5'
const LEGAL_LINK =
  'underline decoration-chrome-strong decoration-2 underline-offset-2 hover:text-chrome-strong'

type TextField = Exclude<FieldName, 'consent'>

function WelcomeHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <h2 ref={ref} tabIndex={-1} className="display text-2xl text-fg outline-none">
      {children}
    </h2>
  )
}

export function SignUpPage() {
  useDocumentTitle('Create your account — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const {
    values,
    errors,
    status,
    method,
    legalOpen,
    setField,
    blurField,
    onSubmit,
    onGoogle,
    acknowledge,
    closeLegal,
    openLegal,
    toggleConsent,
  } = useSignUpForm()
  const pending = status === 'pending'

  const field = (name: TextField) => ({
    id: fieldId(name),
    value: values[name],
    error: errors[name],
    readOnly: pending,
    onChange: (value: string) => setField(name, value),
    onBlur: () => blurField(name),
  })

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center px-4 pt-14 pb-3 sm:px-6">
      {status !== 'success' && (
        <Reveal>
          <h1 className="display mb-3 text-center text-[clamp(1.75rem,4vw,2.5rem)] text-fg">
            Create your account
          </h1>
        </Reveal>
      )}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.shift, ease: EASE_OUT }}
        className="glass-card glass-elevated w-full max-w-md rounded-2xl px-4 py-4 wrap-break-word sm:px-5"
      >
        {status === 'success' ? (
          <div>
            <span className="flex size-10 items-center justify-center rounded-full border border-line-strong text-success">
              <CheckIcon />
            </span>
            <div className="mt-4">
              <WelcomeHeading>
                Welcome{method === 'google' ? '!' : `, ${values.firstName.trim()}`}
              </WelcomeHeading>
            </div>
            <p className="mt-2 text-base leading-relaxed text-fg-muted">
              Check your email to finish setting up your account.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row *:flex-1">
              <Link to="/" className={PRIMARY_BUTTON}>
                Back to home
              </Link>
              <Link to="/#ar-fitting" className={SECONDARY_BUTTON}>
                Explore AR fitting
              </Link>
            </div>
          </div>
        ) : (
          <>
            <form noValidate onSubmit={onSubmit} aria-busy={pending} className={GAPS}>
              <GoogleButton onClick={onGoogle} pending={pending && method === 'google'} />
              <div className="flex items-center gap-3 text-xs text-fg-muted" aria-hidden="true">
                <span className="h-px flex-1 bg-line-strong" />
                or sign up with email
                <span className="h-px flex-1 bg-line-strong" />
              </div>

              <div className="grid gap-2.5 min-[360px]:grid-cols-2">
                <FloatingField
                  {...field('firstName')}
                  label="First name"
                  autoComplete="given-name"
                  enterKeyHint="next"
                  counter={{ current: values.firstName.length, max: LIMITS.nameMaxLength }}
                />
                <FloatingField
                  {...field('lastName')}
                  label="Last name"
                  autoComplete="family-name"
                  enterKeyHint="next"
                  counter={{ current: values.lastName.length, max: LIMITS.nameMaxLength }}
                />
                <FloatingField
                  {...field('middleName')}
                  label="Middle name"
                  autoComplete="additional-name"
                  enterKeyHint="next"
                  counter={{ current: values.middleName.length, max: LIMITS.nameMaxLength }}
                />
                <FloatingField
                  {...field('suffix')}
                  label="Suffix"
                  autoComplete="honorific-suffix"
                  enterKeyHint="next"
                />
              </div>

              <FloatingField
                {...field('email')}
                label="Email"
                type="email"
                icon={<MailIcon size={16} />}
                autoComplete="email"
                inputMode="email"
                enterKeyHint="next"
              />
              <FloatingField
                {...field('phone')}
                label="Phone number"
                type="tel"
                prefix={
                  <CountrySelect
                    id={fieldId('phoneCountry')}
                    value={values.phoneCountry}
                    onChange={(code) => setField('phoneCountry', code)}
                    disabled={pending}
                  />
                }
                autoComplete="tel-national"
                inputMode="tel"
                enterKeyHint="next"
                counter={{ current: values.phone.length, max: LIMITS.phoneMaxDigits }}
              />

              <div className="scroll-mt-28">
                <label className="relative flex min-h-11 cursor-pointer items-start gap-2.5 py-2 text-sm leading-snug text-fg-muted">
                  <input
                    id={fieldId('consent')}
                    type="checkbox"
                    checked={values.consent}
                    disabled={pending}
                    onChange={(event) => toggleConsent(event.target.checked)}
                    onBlur={() => blurField('consent')}
                    aria-invalid={errors.consent ? true : undefined}
                    aria-describedby={errors.consent ? 'signup-consent-error' : undefined}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-chrome-strong ${
                      values.consent
                        ? 'border-fg bg-fg text-canvas'
                        : errors.consent
                          ? 'border-danger'
                          : 'border-line-strong'
                    }`}
                  >
                    {values.consent && <CheckIcon />}
                  </span>
                  <span>
                    I agree to the{' '}
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => openLegal('terms')}
                      className={LEGAL_LINK}
                    >
                      Terms of Service
                    </button>{' '}
                    and{' '}
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => openLegal('privacy')}
                      className={LEGAL_LINK}
                    >
                      Privacy Policy
                    </button>
                    .
                  </span>
                </label>
                {errors.consent && (
                  <p
                    id="signup-consent-error"
                    className="flex items-start gap-1.5 px-1 pt-1 text-xs leading-snug text-danger"
                  >
                    <AlertIcon className="mt-px size-3.5" />
                    <span>{errors.consent}</span>
                  </p>
                )}
              </div>

              {status === 'error' && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-snug"
                >
                  <AlertIcon size={20} className="mt-px text-danger" />
                  <p>
                    <strong className="block font-semibold text-fg">
                      We couldn't create your account.
                    </strong>
                    <span className="text-fg-muted">
                      The connection dropped before we got a response. Nothing was saved. Check
                      your connection and try again.
                    </span>
                  </p>
                </div>
              )}

              <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON} w-full`}>
                {pending ? (
                  <>
                    <SpinnerIcon />
                    Creating account…
                  </>
                ) : status === 'error' ? (
                  'Try again'
                ) : (
                  'Create account'
                )}
              </button>
              <Link to="/login" className={`${SECONDARY_BUTTON} w-full`}>
                I already have an account
              </Link>
            </form>
          </>
        )}
      </motion.div>
      {(['terms', 'privacy'] as const).map((doc) => (
        <LegalModal
          key={doc}
          doc={doc}
          open={legalOpen === doc}
          onAcknowledge={() => acknowledge(doc)}
          onClose={closeLegal}
        />
      ))}
    </div>
  )
}
