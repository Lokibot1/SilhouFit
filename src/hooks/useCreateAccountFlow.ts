import { useRef, useState, useSyncExternalStore } from 'react'
import { useToast } from '../components/toast/useToast'
import { DuplicateUsernameError, takenUsernames, type NewAccountInput } from '../service/accountService'
import { getAccounts, subscribeAccounts } from '../service/accountStore'
import { generateUsername } from '../service/credentials'
import { StaffApiError } from '../service/staffApi'
import type { Credentials } from '../types/accounts'
import {
  ACCOUNT_FIELD_ORDER,
  normalizeAccountPhone,
  sanitizeAccountName,
  sanitizeAccountPhone,
  validateAccountForm,
  type AccountFormField,
  type AccountFormValues,
} from '../utils/accountValidation'
import { normalizeName } from '../utils/signUpValidation'

const EMPTY: AccountFormValues = { firstName: '', lastName: '', phone: '' }

export const fieldId = (name: AccountFormField) => `create-${name}`

type Create = (input: NewAccountInput) => Promise<{ credentials: Credentials }>

type Failure = { title: string; body: string }

/** What happened, why, and what to do next, for each way the server can refuse a new staff or admin account. */
function accountFailure({ kind, status, detail }: StaffApiError, noun: string): Failure {
  if (status === 401) return { title: 'Your session has expired.', body: "The server didn't recognise your sign-in, so no account was made. Sign in again, then create the account." }
  if (status === 403) {
    return {
      title: `You can't create ${noun} accounts.`,
      body:
        noun === 'superadmin'
          ? 'Only superadmins can, and no account was made. Sign in with a superadmin account, or ask a superadmin to do it.'
          : 'Only admins and superadmins can, and no account was made. Sign in with an admin account, or ask an admin to do it.',
    }
  }
  if (kind === 'conflict') return { title: "We couldn't reserve that email.", body: 'Another account took the generated email at the same moment, so no account was made. Try again.' }
  if (kind === 'validation') return { title: 'The server rejected the names.', body: `${detail ?? 'They are not in a form it accepts.'} No account was made. Fix the names, then try again.` }
  if (kind === 'rate-limit') return { title: 'Too many requests.', body: 'The server is limiting requests right now, so no account was made. Wait a minute, then try again.' }
  if (kind === 'network') return { title: 'Nothing was created.', body: 'The connection dropped before the server answered. Check your connection, then try again.' }
  return { title: 'No account was made.', body: 'Something went wrong on our side. Try again in a moment; if it keeps happening, contact the developer.' }
}

/** The create sheet's state: the form, then the credentials the service returns. `noun` ("staff" or "admin") words the toast; `onCreated` runs once the account exists. */
export function useCreateAccountFlow(create: Create, noun: string, onCreated?: () => void, taken?: string[]) {
  const toast = useToast()
  const accounts = useSyncExternalStore(subscribeAccounts, getAccounts)
  const [values, setValues] = useState(EMPTY)
  const [touched, setTouched] = useState<Partial<Record<AccountFormField, boolean>>>({})
  const [pending, setPending] = useState(false)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const inFlight = useRef(false)

  const all = validateAccountForm(values)
  const errors = Object.fromEntries(Object.entries(all).filter(([name]) => touched[name as AccountFormField]))
  // What the sign-in name will be, from the names typed so far and the usernames already taken.
  const username = !all.firstName && !all.lastName ? generateUsername(values.firstName, values.lastName, taken ?? takenUsernames(accounts)) : null

  function setField(name: AccountFormField, value: string) {
    const clean = name === 'phone' ? sanitizeAccountPhone(value) : sanitizeAccountName(value)
    setValues((current) => ({ ...current, [name]: clean }))
    setFailure(null)
  }

  async function submit() {
    if (inFlight.current) return
    setTouched({ firstName: true, lastName: true, phone: true })
    const first = ACCOUNT_FIELD_ORDER.find((name) => all[name])
    if (first) {
      document.getElementById(fieldId(first))?.focus()
      return
    }
    inFlight.current = true
    setPending(true)
    setFailure(null)
    try {
      const { credentials: issued } = await create({
        firstName: normalizeName(values.firstName),
        lastName: normalizeName(values.lastName),
        phone: normalizeAccountPhone(values.phone),
        username: username ?? undefined,
      })
      setCredentials(issued)
      onCreated?.()
      toast.show({ kind: 'success', message: `${noun[0].toUpperCase()}${noun.slice(1)} account created for ${normalizeName(values.firstName)} ${normalizeName(values.lastName)}` })
    } catch (error) {
      setFailure(
        error instanceof StaffApiError
          ? accountFailure(error, noun)
          : error instanceof DuplicateUsernameError
            ? {
                title: 'That username was just taken.',
                body: 'Someone else created an account with it a moment ago. A new username is shown above: check it, then create the account again.',
              }
            : { title: "We couldn't create the account.", body: 'Something went wrong before it was saved, so no account was made. Check your connection, then try again.' },
      )
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  function reset() {
    setValues(EMPTY)
    setTouched({})
    setCredentials(null)
    setFailure(null)
  }

  return {
    values,
    errors,
    username,
    pending,
    credentials,
    failure,
    setField,
    blurField: (name: AccountFormField) => setTouched((current) => ({ ...current, [name]: true })),
    submit,
    reset,
  }
}
