import { useRef, useState, useSyncExternalStore } from 'react'
import { useToast } from '../components/toast/useToast'
import { DuplicateUsernameError, takenUsernames, type NewAccountInput } from '../service/accountService'
import { getAccounts, subscribeAccounts } from '../service/accountStore'
import { generateUsername } from '../service/credentials'
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

/** The create sheet's state: the form, then the credentials the service returns. `noun` ("staff" or "admin") words the toast. */
export function useCreateAccountFlow(create: Create, noun: string) {
  const toast = useToast()
  const accounts = useSyncExternalStore(subscribeAccounts, getAccounts)
  const [values, setValues] = useState(EMPTY)
  const [touched, setTouched] = useState<Partial<Record<AccountFormField, boolean>>>({})
  const [pending, setPending] = useState(false)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [failure, setFailure] = useState<{ title: string; body: string } | null>(null)
  const inFlight = useRef(false)

  const all = validateAccountForm(values)
  const errors = Object.fromEntries(Object.entries(all).filter(([name]) => touched[name as AccountFormField]))
  // What the sign-in name will be, from the names typed so far and the usernames already taken.
  const username = !all.firstName && !all.lastName ? generateUsername(values.firstName, values.lastName, takenUsernames(accounts)) : null

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
      toast.show({ kind: 'success', message: `${noun[0].toUpperCase()}${noun.slice(1)} account created for ${normalizeName(values.firstName)} ${normalizeName(values.lastName)}` })
    } catch (error) {
      setFailure(
        error instanceof DuplicateUsernameError
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
