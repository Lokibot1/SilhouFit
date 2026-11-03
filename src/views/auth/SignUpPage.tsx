import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthHeading, AuthSplit } from '../../components/auth/AuthSplit'
import { FloatingField } from '../../components/form/FloatingField'
import { GoogleButton } from '../../components/form/GoogleButton'
import { PasswordChecklist } from '../../components/form/PasswordChecklist'
import { AlertIcon, CheckIcon, LockIcon, MailIcon, SpinnerIcon } from '../../components/form/icons'
import { LegalModal } from '../../components/legal/LegalModal'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { fieldId, SIGN_UP_ERROR_COPY, useSignUpForm } from '../../hooks/useSignUpForm'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { nextQuery } from '../../utils/safeNext'
import { LIMITS, type FieldName } from '../../utils/signUpValidation'

const META_DESCRIPTION =
  'Create your KRAL account to save your fit profile, try clothes with AR fitting and shop boutiques and online with one secure sign in. It takes a minute.'

const GAPS = '[&>*+*]:mt-4 short:[&>*+*]:mt-3 lg:[&>*+*]:mt-3'
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
  useDocumentTitle('Sign up — KRAL')
  useMetaDescription(META_DESCRIPTION)
  const next = nextQuery(useSearchParams()[0].get('next'))

  const {
    values,
    errors,
    status,
    errorKind,
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
  const [passwordFocused, setPasswordFocused] = useState(false)

  const field = (name: TextField) => ({
    id: fieldId(name),
    value: values[name],
    error: errors[name],
    readOnly: pending,
    onChange: (value: string) => setField(name, value),
    onBlur: () => blurField(name),
  })

  return (
    <>
      <AuthSplit photo={status !== 'success'}>
        {status === 'success' ? (
          <div>
            <span className="flex size-10 items-center justify-center rounded-full border border-line-strong text-success">
              <CheckIcon />
            </span>
            <div className="mt-4">
              <WelcomeHeading>
                Welcome, {values.firstName.trim()}
              </WelcomeHeading>
            </div>
            <p className="mt-2 text-base leading-relaxed text-fg-muted">
              We sent a confirmation link to <strong className="font-medium text-fg">{values.email.trim()}</strong>.
              Open it to activate your account, then go to login.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link to="/" className={PRIMARY_BUTTON}>
                Back to home
              </Link>
              {/* Sign-up does not sign the user in, so offer the way on, back to wherever they came from. */}
              <Link to={`/login${next}`} className={SECONDARY_BUTTON}>
                Go to login
              </Link>
              <Link to={{ pathname: '/about', hash: '#how-it-works' }} className={SECONDARY_BUTTON}>
                Explore AR fitting
              </Link>
            </div>
          </div>
        ) : (
          <>
            <form noValidate onSubmit={onSubmit} aria-busy={pending} className={GAPS}>
              <AuthHeading title="Sign up" subtitle="Save your fit profile and try clothes with AR." />

              <div className="grid gap-4 short:gap-3 min-[360px]:grid-cols-2 lg:gap-3">
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

              {/* The checklist floats under the field like a tooltip, only while focus is inside this wrapper. */}
              <div
                className="relative"
                onFocus={() => setPasswordFocused(true)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setPasswordFocused(false)
                }}
              >
                <FloatingField
                  {...field('password')}
                  label="Password"
                  type="password"
                  icon={<LockIcon size={16} />}
                  autoComplete="new-password"
                  enterKeyHint="next"
                />
                <PasswordChecklist
                  password={values.password}
                  email={values.email}
                  firstName={values.firstName}
                  visible={passwordFocused}
                  className="absolute inset-x-0 top-full z-10 mt-1 bg-canvas shadow-lg"
                />
              </div>

              <FloatingField
                {...field('confirmPassword')}
                label="Confirm password"
                type="password"
                icon={<LockIcon size={16} />}
                autoComplete="new-password"
                enterKeyHint="done"
              />

              <div className="scroll-mt-28">
                <label className="relative flex min-h-11 cursor-pointer items-start gap-2.5 py-2 text-sm lg:min-h-0 lg:py-1 leading-snug text-fg-muted">
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
                      {SIGN_UP_ERROR_COPY[errorKind].title}
                    </strong>
                    <span className="text-fg-muted">{SIGN_UP_ERROR_COPY[errorKind].body}</span>
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

              <div className="flex items-center gap-3 text-xs text-fg-muted" aria-hidden="true">
                <span className="h-px flex-1 bg-line-strong" />
                or sign up with
                <span className="h-px flex-1 bg-line-strong" />
              </div>
              <GoogleButton onClick={onGoogle} pending={pending && method === 'google'} />

              <p className="flex flex-wrap items-center justify-center gap-x-1 text-sm text-fg-muted">
                Already registered?{' '}
                <Link
                  to={`/login${next}`}
                  className="flex min-h-11 items-center font-medium text-fg lg:min-h-9 underline underline-offset-2 hover:text-chrome-strong"
                >
                  Login now!
                </Link>
              </p>
            </form>
          </>
        )}
      </AuthSplit>
      {(['terms', 'privacy'] as const).map((doc) => (
        <LegalModal
          key={doc}
          doc={doc}
          open={legalOpen === doc}
          onAcknowledge={() => acknowledge(doc)}
          onClose={closeLegal}
        />
      ))}
    </>
  )
}
