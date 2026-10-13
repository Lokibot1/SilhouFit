import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../components/toast/useToast'
import { googleErrorMessage, startGoogleAuth } from '../service/googleAuth'
import { setSession, type Session } from '../service/session'
import { submitSignIn, type SignInError, type SignInErrorKind } from '../service/signIn'
import {
  LOGIN_FIELD_ORDER,
  validateLogin,
  type LoginErrors,
  type LoginField,
  type LoginValues,
} from '../utils/loginValidation'
import { safeNext } from '../utils/safeNext'
import { normalizeEmail, stripEmoji } from '../utils/signUpValidation'

const EMPTY: LoginValues = { email: '', password: '' }

export type LoginStatus = 'editing' | 'pending' | 'invalid' | 'error'
export type LoginMethod = 'email' | 'google'

// What happened, why and the next step, per failure kind. 'invalid' stays generic so emails are never revealed.
export const SIGN_IN_ERROR_COPY: Record<SignInErrorKind, { title: string; body: string }> = {
  network: {
    title: "We couldn't sign you in.",
    body: 'The connection dropped before we got a response. Check your connection and try again.',
  },
  'rate-limit': {
    title: 'Too many sign-in attempts.',
    body: 'Our servers are limiting requests right now. Wait a minute, then try again.',
  },
  profile: {
    title: "We signed you in but couldn't load your profile.",
    body: 'Try again. If it keeps happening, contact support.',
  },
  server: {
    title: "We couldn't sign you in.",
    body: 'Something went wrong on our side. Try again in a moment.',
  },
}

const MAX_INVALID = 5
const COOLDOWN_MS = 30_000

export function fieldId(name: LoginField) {
  return `login-${name}`
}

export function useLoginForm() {
  const toast = useToast()
  const navigate = useNavigate()
  const next = useSearchParams()[0].get('next')
  const [values, setValues] = useState<LoginValues>(EMPTY)
  const [remember, setRemember] = useState(false)
  const [touched, setTouched] = useState<Partial<Record<LoginField, boolean>>>({})
  const [status, setStatus] = useState<LoginStatus>('editing')
  // Separate from status so a Google result during the cooldown cannot lift it.
  const [locked, setLocked] = useState(false)
  const [method, setMethod] = useState<LoginMethod>('email')
  const [errorKind, setErrorKind] = useState<SignInErrorKind>('server')
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

  // Back from Google restores this page frozen mid-request; make the buttons usable again.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setStatus('editing')
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

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

  // Sign-in finished: remember the user, then return to the page that asked for it, or to the profile.
  function signedIn(user: Session) {
    setSession(user)
    toast.show({ kind: 'success', message: 'Signed in. Welcome back.' })
    navigate(safeNext(next, '/profile'), { replace: true })
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
        signedIn(result.user)
      } else if (++invalidCount.current >= MAX_INVALID) {
        startCooldown()
      } else {
        setStatus('invalid')
      }
    } catch (failure) {
      if (abort.signal.aborted) return
      const kind = (failure as Partial<SignInError> | null)?.kind ?? 'server'
      const copy = SIGN_IN_ERROR_COPY[kind]
      setErrorKind(kind)
      setStatus('error')
      toast.show({
        kind: 'error',
        message: `${copy.title} ${copy.body}`,
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
      // The browser leaves for Google, so the pending state stays until it does. The callback page finishes sign-in.
      await startGoogleAuth({ next })
    } catch (failure) {
      if (abort.signal.aborted) return
      // The inline banner belongs to the email form; Google failures use the toast alone.
      setStatus('editing')
      toast.show({
        kind: 'error',
        message: googleErrorMessage(failure),
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

  return { values, remember, setRemember, errors, status, errorKind, locked, method, setField, blurField, onSubmit, onGoogle: googleSignIn }
}
