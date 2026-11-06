import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AuthSplit } from '../../components/auth/AuthSplit'
import { AlertIcon } from '../../components/form/icons'
import { CALLBACK_BLOCK, CallbackSkeleton } from '../../components/form/CallbackSkeleton'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { fetchMe, MeError, type MeErrorKind } from '../../service/fetchMe'
import { clearStashedNext, readStashedNext } from '../../service/googleAuth'
import { getSession, setSession } from '../../service/session'
import { signOut } from '../../service/signOut'
import { getSupabase } from '../../service/supabase'
import { nextQuery, safeNext } from '../../utils/safeNext'
import { homeFor } from '../../utils/staffRole'

const META_DESCRIPTION =
  'Finishing your Google sign-in to KRAL. If something went wrong, you can head back to the login page and try again whenever you are ready to continue now.'
const EXPIRED_DESCRIPTION =
  'This KRAL link has expired or was already used. Request a new reset email to set your password, or go back to the login page and sign in with what you have.'

// Waiting on the Supabase code exchange plus /users/me; past this the connection is treated as dropped.
const TIMEOUT_MS = 15_000

type FailKind = 'session' | Exclude<MeErrorKind, 'unauthorized'>

// What happened, why and the next step. Never provider details: those stay in the URL, which is cleared.
const ERROR_COPY: Record<FailKind, { title: string; body: string }> = {
  session: {
    title: "We couldn't finish signing you in.",
    body: 'The Google sign-in expired or was already used, so no account was opened. Go back to login and try again.',
  },
  'not-found': {
    title: "We couldn't find your profile.",
    body: 'Google confirmed your account, but no KRAL profile is saved for it. You were signed out. Go back to login and try again, or contact support if it keeps happening.',
  },
  network: {
    title: "We couldn't finish signing you in.",
    body: 'The connection dropped or took too long before we got a response. Check your connection and try again.',
  },
  'rate-limit': {
    title: "We couldn't finish signing you in.",
    body: 'Our servers are limiting requests right now. Wait a minute, then try again.',
  },
  server: {
    title: "We couldn't finish signing you in.",
    body: 'Something went wrong on our side. Try again in a moment.',
  },
}
const RETRYABLE: FailKind[] = ['network', 'rate-limit', 'server']

type View = { status: 'loading' } | { status: 'cancelled' } | { status: 'expired' } | { status: 'failed'; kind: FailKind }

// Supabase puts `code` (or an `error`) in the query, and tokens or an `error` in the hash for the implicit flow.
function readParams() {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const get = (key: string) => search.get(key) ?? hash.get(key)
  const error = get('error') ?? get('error_code')
  const errorCode = get('error_code')
  return {
    code: search.get('code'),
    accessToken: hash.get('access_token'),
    refreshToken: hash.get('refresh_token'),
    // An emailed invitation or password recovery link carries its kind here; those sessions go on to choose a password.
    setPassword: ['invite', 'recovery'].includes(hash.get('type') ?? search.get('type') ?? ''),
    error: error ? error.toLowerCase() : null,
    // An expired or reused invitation or recovery link also arrives as `access_denied`; only its code tells it from a cancelled Google sign-in.
    linkExpired: Boolean(errorCode && /otp|expired|flow_state|invalid|not_found|used/i.test(errorCode)),
  }
}

type Params = ReturnType<typeof readParams>

// Drops `code`, tokens and error text from the address bar and the history entry.
function cleanUrl() {
  window.history.replaceState(window.history.state, '', window.location.pathname)
}

// A dropped connection, not a rejected code: Supabase wraps fetch failures as AuthRetryableFetchError (status 0).
function isNetworkFailure(failure: unknown) {
  const { name, status } = (failure ?? {}) as { name?: string; status?: number }
  return failure instanceof TypeError || name === 'AuthRetryableFetchError' || status === 0
}

// The client is created with detectSessionInUrl off, so this is the only place a code or token becomes a session.
async function establishSession({ code, accessToken, refreshToken }: Params) {
  const supabase = await getSupabase().catch(() => {
    throw new MeError('server')
  })
  try {
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.setSession({ access_token: accessToken ?? '', refresh_token: refreshToken ?? '' })
    if (error) throw error
  } catch (failure) {
    throw new MeError(isNetworkFailure(failure) ? 'network' : 'unauthorized')
  }
  cleanUrl()
}

export function AuthCallbackPage() {
  // Read once: cleaning the URL later must not change the answer on a re-render or a StrictMode re-run.
  const [params] = useState(readParams)
  const hasResult = Boolean(params.code ?? params.accessToken)
  if (!hasResult && !params.error && getSession()) return <Navigate to="/profile" replace />
  // No result and no app session: a reload after the code was used. A Supabase session may still be waiting to finish.
  return <CallbackFlow params={params} resume={!hasResult && !params.error} />
}

function CallbackFlow({ params, resume }: { params: Params; resume: boolean }) {
  const { error } = params

  const navigate = useNavigate()
  const toast = useToast()
  // Read, not taken: StrictMode runs this twice, so the stash is cleared only once the flow ends.
  const [next] = useState(readStashedNext)
  const [view, setView] = useState<View>(() =>
    error
      ? params.linkExpired
        ? { status: 'expired' }
        : error === 'access_denied'
          ? { status: 'cancelled' }
          : { status: 'failed', kind: 'session' }
      : { status: 'loading' },
  )
  const [attempt, setAttempt] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // The exchange runs once per page load, so a StrictMode re-run or Try again reuses it.
  const exchange = useRef<Promise<void> | null>(null)
  // True from the exchange until the flow signs in or signs out, so leaving mid-way drops the Supabase token.
  const unfinished = useRef(false)
  const mounted = useRef(false)

  useMetaDescription(view.status === 'expired' ? EXPIRED_DESCRIPTION : META_DESCRIPTION)
  useDocumentTitle(
    view.status === 'expired'
      ? 'Link expired — KRAL'
      : view.status === 'cancelled'
        ? 'Google sign-in cancelled — KRAL'
        : view.status === 'failed'
          ? "Couldn't sign you in — KRAL"
          : 'Signing you in — KRAL',
  )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // StrictMode remounts at once, so look again after the tick.
      setTimeout(() => {
        if (mounted.current || !unfinished.current) return
        unfinished.current = false
        // A pending exchange would otherwise write its token after this sign-out.
        const pending = exchange.current
        if (pending) void pending.then(() => signOut(), () => signOut())
        else signOut()
      })
    }
  }, [])

  useEffect(() => {
    if (!error) return
    // The provider already answered, so there is nothing to exchange.
    cleanUrl()
    clearStashedNext()
  }, [error])

  useEffect(() => {
    if (error) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new MeError('network')), TIMEOUT_MS)
    })
    unfinished.current = true
    if (!resume) {
      exchange.current ??= establishSession(params).catch((failure: unknown) => {
        exchange.current = null
        throw failure
      })
    }
    Promise.race([
      (exchange.current ?? Promise.resolve()).then(() => (params.setPassword ? null : fetchMe({ signal: controller.signal }))),
      timeout,
    ]).then(
      (me) => {
        clearTimeout(timer)
        if (controller.signal.aborted) return
        unfinished.current = false
        if (!me) {
          // An invited or recovering person has a session but no password of their own yet.
          navigate('/auth/set-password', { replace: true })
          return
        }
        setSession({
          name: me.fullName ?? `${me.firstName} ${me.lastName}`,
          email: me.email,
          avatarUrl: me.avatarUrl ?? undefined,
          role: me.role,
        })
        clearStashedNext()
        toast.show({ kind: 'success', message: 'Signed in. Welcome back.' })
        // Replacing the entry also leaves the code out of history.
        navigate(safeNext(next, homeFor(me.role)), { replace: true })
      },
      (failure: unknown) => {
        clearTimeout(timer)
        if (controller.signal.aborted) return
        const kind = (failure as Partial<MeError> | null)?.kind ?? 'server'
        if (kind === 'unauthorized' && resume) {
          // A reload with nothing to finish: no valid session, so drop any orphan token and go to login.
          unfinished.current = false
          signOut()
          clearStashedNext()
          navigate('/login', { replace: true })
          return
        }
        const failed: FailKind = kind === 'unauthorized' ? 'session' : kind
        // No half sign-in: only a retryable failure keeps the Supabase session, so Try again can reuse it.
        if (!RETRYABLE.includes(failed)) {
          unfinished.current = false
          signOut()
        }
        cleanUrl()
        setView({ status: 'failed', kind: failed })
      },
    )
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [attempt, error, navigate, next, params, resume, toast])

  useEffect(() => {
    if (view.status !== 'loading') headingRef.current?.focus()
  }, [view.status])

  if (view.status === 'loading') return <CallbackSkeleton />

  const cancelled = view.status === 'cancelled'
  const expired = view.status === 'expired'
  const copy = expired
    ? {
        title: 'This link has expired or was already used',
        body: 'Invitation and reset links work once and stop working after a short time, so this one can no longer open your account. Send a new reset email to choose a password.',
      }
    : cancelled
      ? {
          title: 'You cancelled Google sign-in',
          body: 'Nothing was changed and no account was opened. Go back to login to try again whenever you are ready.',
        }
      : ERROR_COPY[view.kind]
  const retryable = view.status === 'failed' && RETRYABLE.includes(view.kind)

  return (
    <AuthSplit photo={false}>
      <div className={CALLBACK_BLOCK}>
        <span
          className={`flex size-10 items-center justify-center rounded-full border border-line-strong ${cancelled ? 'text-fg-muted' : 'text-danger'}`}
        >
          <AlertIcon size={20} />
        </span>
        <div role={cancelled ? undefined : 'alert'}>
          <h1 ref={headingRef} tabIndex={-1} className="display mt-4 text-3xl text-fg outline-none">
            {copy.title}
          </h1>
          <p className="mt-2 text-base leading-relaxed text-fg-muted">{copy.body}</p>
        </div>
        <div className="mt-auto flex flex-col gap-3 pt-6">
          {expired && (
            <Link to="/forgot-password" className={PRIMARY_BUTTON}>
              Send a new reset email
            </Link>
          )}
          {retryable && (
            <button
              type="button"
              onClick={() => {
                setView({ status: 'loading' })
                setAttempt((n) => n + 1)
              }}
              className={PRIMARY_BUTTON}
            >
              Try again
            </button>
          )}
          {/* Leaving also drops a Supabase session kept for Try again, so nothing half signed in is left behind. */}
          <Link
            to={`/login${nextQuery(next)}`}
            onClick={() => {
              unfinished.current = false
              signOut()
            }}
            className={retryable || expired ? SECONDARY_BUTTON : PRIMARY_BUTTON}
          >
            Back to login
          </Link>
        </div>
      </div>
    </AuthSplit>
  )
}
