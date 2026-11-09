import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FloatingField } from '../../components/form/FloatingField'
import { AlertIcon, CheckIcon, MailIcon, SendIcon } from '../../components/form/icons'
import { ShopHeader } from '../../components/shop/ShopHeader'
import { KRAL_INPUT, KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { useToast } from '../../components/toast/useToast'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { sanitizeAccountEmail, sanitizeAccountName } from '../../utils/accountValidation'
import { hasProfanity, PROFANITY_ERROR } from '../../utils/profanity'
import { normalizeName, normalizeEmail, validateEmail, validateName } from '../../utils/signUpValidation'

const META_DESCRIPTION =
  'Contact the SilhouFit team: write your name, email and message here and it opens in your email app, ready to send to team@silhoufit.dev. Phone is optional.'

const TEAM_EMAIL = 'team@silhoufit.dev'
const MESSAGE_MIN = 10
const MESSAGE_MAX = 500
const PHONE_MAX = 13

type Field = 'name' | 'email' | 'phone' | 'message'
type Errors = Partial<Record<Field, string>>

// Numbers and a leading + only, 13 characters at most. Spaces, dashes and brackets are dropped so a pasted number still fits.
const sanitizePhone = (value: string) => value.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '').slice(0, PHONE_MAX)

function validatePhone(value: string): string | null {
  if (!value) return null
  return /^\+?\d{7,12}$/.test(value) && value.length <= PHONE_MAX ? null : 'Enter 7 to 13 digits. A + is allowed only at the start.'
}

function validateMessage(value: string): string | null {
  const length = value.trim().length
  if (!length) return 'Message is required.'
  if (length < MESSAGE_MIN) return `Message needs at least ${MESSAGE_MIN} characters so the team can help.`
  if (hasProfanity(value)) return PROFANITY_ERROR
  return null
}

const ORDER: Field[] = ['name', 'email', 'phone', 'message']

export function ContactPage() {
  useDocumentTitle('Contact us — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const user = useCurrentUser()
  const toast = useToast()
  const [values, setValues] = useState<Record<Field, string>>({
    name: user ? sanitizeAccountName(user.name) : '',
    email: user?.email ? sanitizeAccountEmail(user.email) : '',
    phone: '',
    message: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [sent, setSent] = useState(false)

  const check = (field: Field, next = values): string | null => {
    switch (field) {
      case 'name': return validateName(next.name)?.replace('First name', 'Name') ?? null
      case 'email': return validateEmail(next.email)
      case 'phone': return validatePhone(next.phone)
      case 'message': return validateMessage(next.message)
    }
  }
  const set = (field: Field, value: string) => {
    const next = { ...values, [field]: value }
    setValues(next)
    // Once a field shows an error it re-checks as you type, so the message clears the moment it is fixed.
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: check(field, next) ?? undefined }))
  }
  const blur = (field: Field) => setErrors((prev) => ({ ...prev, [field]: check(field) ?? undefined }))

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const found: Errors = {}
    for (const field of ORDER) {
      const message = check(field)
      if (message) found[field] = message
    }
    setErrors(found)
    const first = ORDER.find((field) => found[field])
    if (first) {
      document.getElementById(`contact-${first}`)?.focus()
      return
    }
    const name = normalizeName(values.name)
    const body = [`Name: ${name}`, `Email: ${normalizeEmail(values.email)}`, values.phone && `Phone: ${values.phone}`, '', values.message.trim()]
      .filter((line) => line !== '')
      .join('\n')
    // There is no contact service yet, so the message is handed to the visitor's email app instead of being sent from here.
    window.location.href = `mailto:${TEAM_EMAIL}?subject=${encodeURIComponent(`SilhouFit contact from ${name}`)}&body=${encodeURIComponent(body)}`
    setSent(true)
    toast.show({ kind: 'success', message: 'Your email is ready. Press send in your email app.' })
  }

  const messageError = errors.message

  return (
    <div className="font-kral-mono text-kral-fg">
      <ShopHeader title="Contact us" crumb="Contact" tone="kral" />
      <div className="mx-auto max-w-6xl px-6 pt-4 pb-16 sm:pb-24 2xl:max-w-[88rem] lg:grid lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <span aria-hidden="true" className="mb-6 block h-0.5 w-14 bg-kral-red" />
          <p className="text-sm font-medium tracking-[0.08em] text-kral-red-ink uppercase">(Contact)</p>
          <p className="mt-3 max-w-md text-base leading-relaxed text-kral-muted sm:text-lg">
            Questions about a piece, your measurements or an order? Write to the team. Your message opens in your email app, ready to send.
          </p>
          <dl className="mt-8 divide-y divide-kral-rule border-y border-kral-rule">
            <div className="flex min-h-11 flex-wrap items-center gap-x-4 py-2">
              <dt className="text-sm tracking-[0.08em] text-kral-muted uppercase">Email</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere]">
                <a href={`mailto:${TEAM_EMAIL}`} className="kral-focus tap text-base text-kral-fg underline decoration-kral-red decoration-2 underline-offset-4 hover:text-kral-red-ink">
                  {TEAM_EMAIL}
                </a>
              </dd>
            </div>
            <div className="flex min-h-11 flex-wrap items-center gap-x-4 py-2">
              <dt className="text-sm tracking-[0.08em] text-kral-muted uppercase">Signed in</dt>
              <dd className="text-base text-kral-fg">
                <Link to="/messages" className="kral-focus tap underline decoration-kral-red decoration-2 underline-offset-4 hover:text-kral-red-ink">
                  Message staff
                </Link>
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-10 lg:col-span-7 lg:mt-0">
          {sent ? (
            <div role="status" className="border border-kral-fg p-5 sm:p-8">
              <p className="flex items-center gap-2 text-sm font-medium tracking-[0.08em] text-kral-red-ink uppercase">
                <CheckIcon /> (Message ready)
              </p>
              <h2 className="mt-3 font-kral-display text-2xl leading-[1.05] font-extrabold uppercase sm:text-3xl">Check your email app</h2>
              <p className="mt-4 text-base leading-relaxed text-kral-muted">
                Your message to the team is open in your email app. Press send there to deliver it. If nothing opened, write to{' '}
                <a href={`mailto:${TEAM_EMAIL}`} className="kral-focus tap text-kral-fg underline decoration-kral-red decoration-2 underline-offset-4">{TEAM_EMAIL}</a> yourself.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button type="button" className={KRAL_PRIMARY} onClick={() => { setValues((v) => ({ ...v, phone: '', message: '' })); setSent(false) }}>
                  <MailIcon size={16} />
                  Write another message
                </button>
                <Link to="/shop" className={KRAL_SECONDARY}>Back to shop</Link>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate aria-label="Contact the team" className="space-y-5">
              <FloatingField id="contact-name" label="Name" tone="kral" value={values.name} onChange={(v) => set('name', sanitizeAccountName(v))} onBlur={() => blur('name')} error={errors.name} autoComplete="name" enterKeyHint="next" />
              <FloatingField id="contact-email" label="Email" tone="kral" type="email" inputMode="email" value={values.email} onChange={(v) => set('email', sanitizeAccountEmail(v))} onBlur={() => blur('email')} error={errors.email} autoComplete="email" enterKeyHint="next" />
              <FloatingField id="contact-phone" label="Phone (optional)" tone="kral" type="tel" inputMode="tel" value={values.phone} onChange={(v) => set('phone', sanitizePhone(v))} onBlur={() => blur('phone')} error={errors.phone} counter={{ current: values.phone.length, max: PHONE_MAX }} autoComplete="tel" enterKeyHint="next" />
              <div>
                <label htmlFor="contact-message" className="text-sm font-medium tracking-[0.08em] text-kral-muted uppercase">Message</label>
                <textarea
                  id="contact-message"
                  name="contact-message"
                  rows={6}
                  maxLength={MESSAGE_MAX}
                  value={values.message}
                  onChange={(event) => set('message', event.target.value)}
                  onBlur={() => blur('message')}
                  aria-invalid={messageError ? true : undefined}
                  aria-describedby={messageError ? 'contact-message-error' : undefined}
                  className={`${KRAL_INPUT} h-40 resize-none py-3 ${messageError ? 'border-danger!' : ''}`}
                />
                <div className="mt-1 flex items-start justify-between gap-3">
                  <p id="contact-message-error" className="flex items-start gap-1.5 text-base leading-snug text-danger md:text-sm">
                    {messageError && (<><AlertIcon className="mt-px size-3.5 shrink-0" /><span>{messageError}</span></>)}
                  </p>
                  <p className="shrink-0 text-xs text-kral-muted tabular-nums" aria-hidden="true">{values.message.length}/{MESSAGE_MAX}</p>
                </div>
              </div>
              <button type="submit" className={`${KRAL_PRIMARY} w-full sm:w-auto`}>
                <SendIcon size={16} />
                Send message
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
