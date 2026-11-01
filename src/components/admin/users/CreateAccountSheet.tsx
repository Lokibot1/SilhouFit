import type { FormEvent } from 'react'
import { ACCOUNT_EMAIL_DOMAIN } from '../../../config/accountPolicy'
import { fieldId, useCreateAccountFlow } from '../../../hooks/useCreateAccountFlow'
import type { NewAccountInput } from '../../../service/accountService'
import type { Credentials } from '../../../types/accounts'
import { normalizeAccountPhone, PHONE_MAX, type AccountFormField } from '../../../utils/accountValidation'
import { LIMITS } from '../../../utils/signUpValidation'
import { AlertIcon, SpinnerIcon } from '../../form/icons'
import { Field, FIELD_INPUT } from '../../staff/inventory/FormField'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { CredentialsPanel } from './CredentialsPanel'

const FORM_ID = 'create-account-form'

interface CreateAccountSheetProps {
  open: boolean
  onClose: () => void
  /** "staff" or "admin", for the title and the toast. */
  noun: string
  create: (input: NewAccountInput) => Promise<{ credentials: Credentials }>
}

/** Creates a staff or admin account: the form, then the credentials once. Give it a new `key` for every open so it starts empty. */
export function CreateAccountSheet({ open, onClose, noun, create }: CreateAccountSheetProps) {
  const flow = useCreateAccountFlow(create, noun)
  const { values, errors, username, pending, credentials, failure } = flow

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void flow.submit()
  }

  const input = (name: AccountFormField, extra: { inputMode?: 'tel'; autoComplete?: string }) => ({
    id: fieldId(name),
    value: values[name],
    readOnly: pending,
    onChange: (event: { target: { value: string } }) => flow.setField(name, event.target.value),
    onBlur: () => flow.blurField(name),
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `${fieldId(name)}-error` : undefined,
    autoComplete: extra.autoComplete ?? 'off',
    inputMode: extra.inputMode,
    spellCheck: false,
    className: FIELD_INPUT,
  })

  const phoneLength = normalizeAccountPhone(values.phone).length

  return (
    <Modal
      variant="sheet"
      open={open}
      onClose={pending ? () => {} : onClose}
      title={credentials ? `${noun[0].toUpperCase()}${noun.slice(1)} account created` : `Add ${noun} account`}
      footer={
        credentials ? (
          <button type="button" onClick={onClose} className={`${PRIMARY_BUTTON} w-full sm:ml-auto sm:w-auto`}>
            Done
          </button>
        ) : (
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={pending} className={SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="submit" form={FORM_ID} disabled={pending} aria-busy={pending} className={PRIMARY_BUTTON}>
              {pending && <SpinnerIcon />}
              {pending ? 'Creating…' : 'Create account'}
            </button>
          </div>
        )
      }
    >
      {credentials ? (
        <CredentialsPanel credentials={credentials} heading={`${values.firstName.trim()} ${values.lastName.trim()}`} />
      ) : (
        <form id={FORM_ID} noValidate onSubmit={onSubmit} aria-busy={pending} className="grid gap-4 pb-5">
          <p className="text-xs text-fg-muted">
            A username and a temporary password are made for you. The new {noun} member signs in with them and chooses their own password.
          </p>
          <Field id={fieldId('firstName')} label="First name" count={{ value: values.firstName.length, max: LIMITS.nameMaxLength }} error={errors.firstName}>
            <input {...input('firstName', { autoComplete: 'off' })} type="text" />
          </Field>
          <Field id={fieldId('lastName')} label="Last name" count={{ value: values.lastName.length, max: LIMITS.nameMaxLength }} error={errors.lastName}>
            <input {...input('lastName', { autoComplete: 'off' })} type="text" />
          </Field>
          <Field id={fieldId('phone')} label="Phone" optional count={{ value: phoneLength, max: PHONE_MAX }} error={errors.phone}>
            <input {...input('phone', { inputMode: 'tel' })} type="tel" placeholder="+639171234567" />
          </Field>
          <dl className="grid gap-1 rounded-xl border border-line bg-canvas-sub p-3 text-sm">
            <dt className="text-fg-muted">Username</dt>
            <dd className="font-mono text-base font-semibold break-all text-fg" aria-live="polite">
              {username ?? 'Enter both names to see it'}
            </dd>
            <dt className="mt-1 text-fg-muted">Sign-in email</dt>
            <dd className="font-mono text-base break-all text-fg">{username ? `${username}@${ACCOUNT_EMAIL_DOMAIN}` : '—'}</dd>
          </dl>
          {failure && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger p-3">
              <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{failure.title}</p>
                <p className="mt-1 text-sm text-fg-muted">{failure.body}</p>
              </div>
            </div>
          )}
        </form>
      )}
    </Modal>
  )
}

interface CredentialsSheetProps {
  open: boolean
  /** Stays set while the sheet slides out. */
  credentials: Credentials | null
  heading: string
  onClose: () => void
}

/** Shows new credentials after a password reset. */
export function CredentialsSheet({ open, credentials, heading, onClose }: CredentialsSheetProps) {
  return (
    <Modal
      variant="sheet"
      open={open}
      onClose={onClose}
      title="Password reset"
      footer={
        <button type="button" onClick={onClose} className={`${PRIMARY_BUTTON} w-full sm:ml-auto sm:w-auto`}>
          Done
        </button>
      }
    >
      {open && credentials && <CredentialsPanel credentials={credentials} heading={heading} />}
    </Modal>
  )
}
