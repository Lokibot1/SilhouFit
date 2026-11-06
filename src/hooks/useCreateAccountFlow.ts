import { useRef, useState } from 'react'
import { useToast } from '../components/toast/useToast'
import { StaffApiError, type InviteInput, type Invited } from '../service/staffApi'
import {
  ACCOUNT_FIELD_ORDER,
  sanitizeAccountEmail,
  sanitizeAccountName,
  sanitizeAccountSuffix,
  validateAccountForm,
  type AccountFormField,
  type AccountFormValues,
} from '../utils/accountValidation'
import { normalizeEmail, normalizeName } from '../utils/signUpValidation'

const EMPTY: AccountFormValues = { firstName: '', middleName: '', lastName: '', suffix: '', email: '', birthday: '', gender: '' }

export const fieldId = (name: AccountFormField) => `create-${name}`

type Create = (input: InviteInput) => Promise<Invited<unknown>>

type Failure = { title: string; body: string }

const FIELD_LABELS: Record<string, string> = { firstName: 'first name', middleName: 'middle name', lastName: 'last name', birthday: 'birthday', redirectTo: 'redirect link' }

/** The server's validation messages ("email must be an email; lastName should not be empty") as readable sentences: field names spelled out, each capitalised and ended with a full stop. */
const sentences = (detail: string) =>
  detail
    .split(';')
    .map((message) => message.trim().replace(/^\w+/, (word) => FIELD_LABELS[word] ?? word))
    .filter(Boolean)
    .map((message) => `${message[0].toUpperCase()}${message.slice(1)}${/[.!?]$/.test(message) ? '' : '.'}`)
    .join(' ')

/** What happened, why, and what to do next, for each way the server can refuse an invitation. */
function inviteFailure({ kind, status, detail }: StaffApiError, noun: string, email: string): Failure {
  if (status === 401) return { title: 'Your session has expired.', body: "The server didn't recognise your sign-in, so no invitation was sent. Sign in again, then invite them." }
  if (status === 403) {
    return {
      title: `You can't invite ${noun} accounts.`,
      body:
        noun === 'superadmin'
          ? 'Only superadmins can, and no invitation was sent. Sign in with a superadmin account, or ask a superadmin to do it.'
          : 'Only admins and superadmins can, and no invitation was sent. Sign in with an admin account, or ask an admin to do it.',
    }
  }
  if (kind === 'conflict') return { title: 'That email already has an account.', body: `${email} is already registered, so no invitation was sent. Use a different email, or find the account in the lists.` }
  if (kind === 'validation') return { title: 'The server rejected the details.', body: `${(detail && sentences(detail)) || 'They are not in a form it accepts.'} No invitation was sent. Fix the details, then try again.` }
  if (kind === 'rate-limit') return { title: 'Too many requests.', body: 'The server is limiting requests right now, so no invitation was sent. Wait a minute, then try again.' }
  if (kind === 'network') return { title: 'No invitation was sent.', body: 'The connection dropped before the server answered. Check your connection, then try again.' }
  return { title: 'No invitation was sent.', body: 'Something went wrong on our side. Try again in a moment; if it keeps happening, contact the developer.' }
}

/** The invite sheet's state: the form, then the email the invitation went to. `noun` ("staff", "admin" or "superadmin") words a refused invitation; `onCreated` runs once the invitation is sent. */
export function useCreateAccountFlow(create: Create, noun: string, onCreated?: () => void) {
  const toast = useToast()
  const [values, setValues] = useState(EMPTY)
  const [touched, setTouched] = useState<Partial<Record<AccountFormField, boolean>>>({})
  const [pending, setPending] = useState(false)
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const inFlight = useRef(false)

  const all = validateAccountForm(values)
  const errors = Object.fromEntries(Object.entries(all).filter(([name]) => touched[name as AccountFormField]))

  function setField(name: AccountFormField, value: string) {
    const clean = name === 'email' ? sanitizeAccountEmail(value) : name === 'suffix' ? sanitizeAccountSuffix(value) : name === 'birthday' || name === 'gender' ? value : sanitizeAccountName(value)
    setValues((current) => ({ ...current, [name]: clean }) as AccountFormValues)
    setFailure(null)
  }

  async function submit() {
    if (inFlight.current) return
    setTouched(Object.fromEntries(ACCOUNT_FIELD_ORDER.map((name) => [name, true])))
    const first = ACCOUNT_FIELD_ORDER.find((name) => all[name])
    if (first) {
      document.getElementById(fieldId(first))?.focus()
      return
    }
    inFlight.current = true
    setPending(true)
    setFailure(null)
    const email = normalizeEmail(values.email)
    try {
      // Optional fields the person left empty are not sent at all.
      const middleName = normalizeName(values.middleName)
      const suffix = values.suffix.trim()
      await create({
        email,
        firstName: normalizeName(values.firstName),
        ...(middleName && { middleName }),
        lastName: normalizeName(values.lastName),
        ...(suffix && { suffix }),
        ...(values.birthday && { birthday: values.birthday }),
        ...(values.gender && { gender: values.gender }),
      })
      setInvitedEmail(email)
      onCreated?.()
      toast.show({ kind: 'success', message: 'Invitation sent' })
    } catch (error) {
      setFailure(
        error instanceof StaffApiError
          ? inviteFailure(error, noun, email)
          : { title: "We couldn't send the invitation.", body: 'Something went wrong before it was sent, so no invitation was made. Check your connection, then try again.' },
      )
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return {
    values,
    errors,
    pending,
    invitedEmail,
    failure,
    setField,
    blurField: (name: AccountFormField) => setTouched((current) => ({ ...current, [name]: true })),
    submit,
  }
}
