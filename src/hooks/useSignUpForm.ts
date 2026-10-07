import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useToast } from '../components/toast/useToast'
import type { LegalDoc } from '../components/legal/legalContent'
import { submitGoogleSignUp } from '../service/googleSignUp'
import { submitSignUp } from '../service/signUp'
import { DEFAULT_COUNTRY_CODE } from '../data/countries'
import {
  CONSENT_ERROR,
  FIELD_ORDER,
  normalizeSignUp,
  sanitizeName,
  sanitizePhoneDigits,
  sanitizeSuffix,
  stripEmoji,
  validateSignUp,
  type FieldName,
  type SignUpErrors,
  type SignUpValues,
} from '../utils/signUpValidation'

const EMPTY: SignUpValues = {
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  email: '',
  phoneCountry: DEFAULT_COUNTRY_CODE,
  phone: '',
  consent: false,
}

export type SignUpStatus = 'editing' | 'pending' | 'success' | 'error'
export type SignUpMethod = 'email' | 'google'

// Terms first, then Privacy; the order the consent flow opens them in.
const LEGAL_ORDER: LegalDoc[] = ['terms', 'privacy']
type Acknowledged = Record<LegalDoc, boolean>
const nextUnread = (read: Acknowledged) => LEGAL_ORDER.find((doc) => !read[doc])

// Sanitising runs on every change, so pasted text is cleaned too.
const SANITIZERS: Partial<Record<FieldName, (input: string) => string>> = {
  firstName: sanitizeName,
  middleName: sanitizeName,
  lastName: sanitizeName,
  suffix: sanitizeSuffix,
  email: stripEmoji,
  phone: sanitizePhoneDigits,
}

export function fieldId(name: FieldName) {
  return `signup-${name}`
}

function focusField(errors: SignUpErrors) {
  const first = FIELD_ORDER.find((name) => errors[name])
  if (first) document.getElementById(fieldId(first))?.focus()
}

// Consent counts only when the box is ticked and both documents were read to the end.
function withConsent(errors: SignUpErrors, read: Acknowledged): SignUpErrors {
  return nextUnread(read) ? { ...errors, consent: CONSENT_ERROR } : errors
}

export function useSignUpForm() {
  const toast = useToast()
  const [values, setValues] = useState<SignUpValues>(EMPTY)
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({})
  const [status, setStatus] = useState<SignUpStatus>('editing')
  const [method, setMethod] = useState<SignUpMethod>('email')
  // Reading a document and pressing "I understand" lasts as long as the form; nothing is stored.
  const [acknowledged, setAcknowledged] = useState<Acknowledged>({ terms: false, privacy: false })
  const [legalOpen, setLegalOpen] = useState<LegalDoc | null>(null)
  const resumeGoogle = useRef(false)
  const inFlight = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const googleRef = useRef<() => void>(() => {})

  useEffect(() => () => controller.current?.abort(), [])

  const errors = useMemo(() => {
    const all = withConsent(validateSignUp(values), acknowledged)
    return Object.fromEntries(
      Object.entries(all).filter(([name]) => touched[name as FieldName]),
    ) as SignUpErrors
  }, [values, touched, acknowledged])

  const setField = useCallback((name: FieldName, value: string | boolean) => {
    const clean = typeof value === 'string' ? (SANITIZERS[name]?.(value) ?? value) : value
    setValues((current) => ({ ...current, [name]: clean }))
    if (name === 'consent') setTouched((current) => ({ ...current, consent: true }))
  }, [])

  const blurField = useCallback((name: FieldName) => {
    setTouched((current) => ({ ...current, [name]: true }))
  }, [])

  async function submit() {
    if (inFlight.current) return
    const found = withConsent(validateSignUp(values), acknowledged)
    setTouched(Object.fromEntries(FIELD_ORDER.map((name) => [name, true])))
    if (Object.keys(found).length) {
      // An unread document opens first, whatever else is wrong; the field errors stay visible behind it.
      const unread = nextUnread(acknowledged)
      if (unread) setLegalOpen(unread)
      else focusField(found)
      return
    }

    inFlight.current = true
    const abort = new AbortController()
    controller.current = abort
    setMethod('email')
    setStatus('pending')
    try {
      await submitSignUp(normalizeSignUp(values), { signal: abort.signal })
      setStatus('success')
      toast.show({ kind: 'success', message: 'Account created. Check your email to finish setting up.' })
    } catch {
      if (abort.signal.aborted) return
      setStatus('error')
      toast.show({
        kind: 'error',
        message: "We couldn't create your account. Check your connection and try again.",
        action: { label: 'Try again', onClick: () => submitRef.current() },
      })
    } finally {
      inFlight.current = false
    }
  }
  useEffect(() => {
    submitRef.current = submit
  })

  async function googleSignUp() {
    if (inFlight.current) return
    inFlight.current = true
    const abort = new AbortController()
    controller.current = abort
    setMethod('google')
    setStatus('pending')
    try {
      await submitGoogleSignUp({ signal: abort.signal })
      setStatus('success')
      toast.show({ kind: 'success', message: 'Account created. Check your email to finish setting up.' })
    } catch {
      if (abort.signal.aborted) return
      // The inline error banner belongs to the email form; Google failures use the toast alone.
      setStatus('editing')
      toast.show({
        kind: 'error',
        message: "We couldn't connect to Google. The connection dropped before we got a response. Nothing was saved. Try again.",
        action: { label: 'Try again', onClick: () => googleRef.current() },
      })
    } finally {
      inFlight.current = false
    }
  }
  useEffect(() => {
    googleRef.current = googleSignUp
  })

  function onGoogle() {
    if (inFlight.current) return
    const unread = nextUnread(acknowledged)
    if (unread) {
      resumeGoogle.current = true
      setLegalOpen(unread)
      return
    }
    void googleSignUp()
  }

  function acknowledge(doc: LegalDoc) {
    const read = { ...acknowledged, [doc]: true }
    setAcknowledged(read)
    const unread = nextUnread(read)
    if (unread) {
      setLegalOpen(unread)
      return
    }
    setLegalOpen(null)
    setField('consent', true)
    // Google was clicked on purpose, so it carries on; the email form waits for another press.
    if (resumeGoogle.current) {
      resumeGoogle.current = false
      void googleSignUp()
    }
  }

  // Ticking the box without reading both documents opens whichever is still unread.
  function toggleConsent(checked: boolean) {
    setField('consent', checked)
    const unread = nextUnread(acknowledged)
    if (checked && unread) setLegalOpen(unread)
  }

  function closeLegal() {
    resumeGoogle.current = false
    setLegalOpen(null)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void submit()
  }

  return {
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
    openLegal: setLegalOpen,
    toggleConsent,
  }
}
