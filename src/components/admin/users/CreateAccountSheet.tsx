import type { FormEvent, ReactNode } from 'react'
import { fieldId, useCreateAccountFlow } from '../../../hooks/useCreateAccountFlow'
import type { Invited, InviteInput } from '../../../service/staffApi'
import { latestBirthday, type AccountFormField, type AccountGender } from '../../../utils/accountValidation'
import { LIMITS } from '../../../utils/signUpValidation'
import { AlertIcon, CheckIcon, SpinnerIcon } from '../../form/icons'
import { Field, FIELD_INPUT, SELECT_FLAT, SelectField } from '../../staff/inventory/FormField'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { Select } from '../../ui/Select'
import { Tooltip } from '../../ui/Tooltip'

const FORM_ID = 'create-account-form'

const GENDER_OPTIONS: { value: AccountGender; label: string }[] = [
  { value: '', label: 'Not specified' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'unisex', label: 'Unisex' },
]

/** The hint for an optional field: on mouse hover and on keyboard focus, never the field's accessible name. */
const Hint = ({ label, children }: { label: string; children: ReactNode }) => (
  <Tooltip label={label} wrap>
    <div className="w-full min-w-0">{children}</div>
  </Tooltip>
)

interface CreateAccountSheetProps {
  open: boolean
  onClose: () => void
  /** "staff", "admin" or "superadmin": the role the invitation gives, for the title and the toast. */
  noun: string
  invite: (input: InviteInput) => Promise<Invited<unknown>>
  /** Runs once the invitation is sent, so the list can load again. */
  onCreated?: () => void
}

/** Invites a staff, admin or superadmin account by email: the form, then a confirmation. Give it a new `key` for every open so it starts empty. */
export function CreateAccountSheet({ open, onClose, noun, invite, onCreated }: CreateAccountSheetProps) {
  const flow = useCreateAccountFlow(invite, noun, onCreated)
  const { values, errors, pending, invitedEmail, failure } = flow

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void flow.submit()
  }

  const input = (name: AccountFormField, extra: { inputMode?: 'email'; autoComplete?: string }) => ({
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

  return (
    <Modal
      variant="sheet"
      open={open}
      onClose={pending ? () => {} : onClose}
      title={invitedEmail ? 'Invitation sent' : `Add ${noun} account`}
      footer={
        invitedEmail ? (
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
              {pending ? 'Sending…' : 'Send Invitation'}
            </button>
          </div>
        )
      }
    >
      {invitedEmail ? (
        <div role="status" className="flex items-start gap-3 pb-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong text-success">
            <CheckIcon />
          </span>
          <p className="min-w-0 text-base leading-relaxed wrap-anywhere text-fg">
            Invitation sent to <strong className="font-semibold">{invitedEmail}</strong>. They will set their own password from the email link.
          </p>
        </div>
      ) : (
        <form id={FORM_ID} noValidate onSubmit={onSubmit} aria-busy={pending} className="grid gap-4 pb-5 md:[&_.field]:[--field-h:44px] md:[&_[role=combobox]]:min-h-11">
          <p className="text-base text-fg-muted sm:text-sm">We email them an invitation. They choose their own password from the link, so you never see or share one.</p>
          <Field id={fieldId('firstName')} label="First name" count={{ value: values.firstName.length, max: LIMITS.nameMaxLength }} error={errors.firstName}>
            <input {...input('firstName', {})} type="text" />
          </Field>
          <Hint label="Optional. Leave it empty if they have no middle name.">
            <Field id={fieldId('middleName')} label="Middle name" optional count={{ value: values.middleName.length, max: LIMITS.nameMaxLength }} error={errors.middleName}>
              <input {...input('middleName', {})} type="text" />
            </Field>
          </Hint>
          <Field id={fieldId('lastName')} label="Last name" count={{ value: values.lastName.length, max: LIMITS.nameMaxLength }} error={errors.lastName}>
            <input {...input('lastName', {})} type="text" />
          </Field>
          <Hint label="Optional. Goes after the last name, like Jr. or III.">
            <Field id={fieldId('suffix')} label="Suffix" optional count={{ value: values.suffix.length, max: LIMITS.suffixMaxLength }} error={errors.suffix}>
              <input {...input('suffix', {})} type="text" />
            </Field>
          </Hint>
          <Field id={fieldId('email')} label="Email" count={{ value: values.email.length, max: LIMITS.emailMaxLength }} error={errors.email}>
            <input {...input('email', { inputMode: 'email' })} type="email" maxLength={LIMITS.emailMaxLength} />
          </Field>
          <Hint label="Optional. Pick a day before today.">
            <Field id={fieldId('birthday')} label="Birthday" optional error={errors.birthday}>
              <input {...input('birthday', {})} type="date" max={latestBirthday()} />
            </Field>
          </Hint>
          <Hint label="Optional. Leave it as Not specified to skip it.">
            <div className="w-full">
              <SelectField label="Gender (optional)">
                <Select label="Gender (optional)" value={values.gender} options={GENDER_OPTIONS} onChange={(gender) => flow.setField('gender', gender)} className={SELECT_FLAT} />
              </SelectField>
            </div>
          </Hint>
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
