import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useToast } from '../components/toast/useToast'
import { submitGoogleSignIn } from '../service/googleSignIn'
import { submitSignIn } from '../service/signIn'
import {
  LOGIN_FIELD_ORDER,
  validateLogin,
  type LoginErrors,
  type LoginField,
  type LoginValues,
} from '../utils/loginValidation'
import { normalizeEmail, stripEmoji } from '../utils/signUpValidation'

const EMPTY: LoginValues = { email: '', password: '' }

export type LoginStatus = 'editing' | 'pending' | 'success' | 'invalid' | 'error'
export type LoginMethod = 'email' | 'google'

const MAX_INVALID = 5
const COOLDOWN_MS = 30_000

export function fieldId(name: LoginField) {
  return `login-${name}`
}

export function useLoginForm() {
  const toast = useToast()
  const [values, setValues] = useState<LoginValues>(EMPTY)
  const [remember, setRemember] = useState(false)
  const [touched, setTouched] = useState<Partial<Record<LoginField, boolean>>>({})
  const [status, setStatus] = useState<LoginStatus>('editing')
  // Separate from status so a Google result during the cooldown cannot lift it.
  const [locked, setLocked] = useState(false)
  const [method, setMethod] = useState<LoginMethod>('email')
  const invalidCount = useRef(0)
  const cooldown = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inFlight = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const googleRef = useRef<() => void>(() => {})

  useEffect(
    () => () => {
      controller.current?.abort()
      clearTimeout(cooldown.current)
      // A leftover toast's "Try again" must not re-run a request for an unmounted page.
      submitRef.current = googleRef.current = () => {}
    },
    [],
  )

  const errors = useMemo(() => {
    const all = validateLogin(values)
    return Object.fromEntries(
      Object.entries(all).filter(([name]) => touched[name as LoginField]),
    ) as LoginErrors
  }, [values, touched])

  const setField = useCallback((name: LoginField, value: string) => {
    const clean = name === 'email' ? stripEmoji(value) : value
    setValues((current) => ({ ...current, [name]: clean }))
  }, [])

  const blurField = useCallback((name: LoginField) => {
    setTouched((current) => ({ ...current, [name]: true }))
  }, [])

  function startCooldown() {
    setStatus('editing')
    setLocked(true)
    cooldown.current = setTimeout(() => {
      invalidCount.current = 0
      setLocked(false)
    }, COOLDOWN_MS)
  }

  async function submit() {
    if (inFlight.current || locked) return
    const found = validateLogin(values)
    setTouched({ email: true, password: true })
    const first = LOGIN_FIELD_ORDER.find((name) => found[name])
    if (first) {
      document.getElementById(fieldId(first))?.focus()
      return
    }

    inFlight.current = true
    const abort = new AbortController()
    controller.current = abort
    setMethod('email')
    setStatus('pending')
    try {
      const result = await submitSignIn(
        { email: normalizeEmail(values.email), password: values.password, remember },
        { signal: abort.signal },
      )
      if (result.ok) {
        setStatus('success')
        toast.show({ kind: 'success', message: 'Signed in. Welcome back.' })
      } else if (++invalidCount.current >= MAX_INVALID) {
        startCooldown()
      } else {
        setStatus('invalid')
      }
    } catch {
      if (abort.signal.aborted) return
      setStatus('error')
      toast.show({
        kind: 'error',
        message: "We couldn't sign you in. Check your connection and try again.",
        action: { label: 'Try again', onClick: () => submitRef.current() },
      })
    } finally {
      inFlight.current = false
    }
  }
  useEffect(() => {
    submitRef.current = submit
  })

  async function googleSignIn() {
    if (inFlight.current) return
    inFlight.current = true
    const abort = new AbortController()
    controller.current = abort
    setMethod('google')
    setStatus('pending')
    try {
      await submitGoogleSignIn({ signal: abort.signal })
      setStatus('success')
      toast.show({ kind: 'success', message: 'Signed in. Welcome back.' })
    } catch {
      if (abort.signal.aborted) return
      // The inline banner belongs to the email form; Google failures use the toast alone.
      setStatus('editing')
      toast.show({
        kind: 'error',
        message: "We couldn't connect to Google. The connection dropped before we got a response. Try again.",
        action: { label: 'Try again', onClick: () => googleRef.current() },
      })
    } finally {
      inFlight.current = false
    }
  }
  useEffect(() => {
    googleRef.current = googleSignIn
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void submit()
  }

  return { values, remember, setRemember, errors, status, locked, method, setField, blurField, onSubmit, onGoogle: googleSignIn }
}
