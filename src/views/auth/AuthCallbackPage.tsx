import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AlertIcon } from '../../components/form/icons'
import { CALLBACK_CARD, CALLBACK_SHELL, CallbackSkeleton } from '../../components/form/CallbackSkeleton'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { fetchMe, MeError, type MeErrorKind } from '../../service/fetchMe'
import { clearStashedNext, readStashedNext } from '../../service/googleAuth'
import { getSession, setSession } from '../../service/session'
import { signOut } from '../../service/signOut'
import { nextQuery, safeNext } from '../../utils/safeNext'

const META_DESCRIPTION =
  'Finishing your Google sign-in to SilhouFit. If something went wrong, you can head back to the login page and try again whenever you are ready to continue.'

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
    body: 'Google confirmed your account, but no SilhouFit profile is saved for it. You were signed out. Go back to login and try again, or contact support if it keeps happening.',
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

type View = { status: 'loading' } | { status: 'cancelled' } | { status: 'failed'; kind: FailKind }

// Supabase puts `code` (or an `error`) in the query, and tokens or an `error` in the hash for the implicit flow.
function readParams() {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const get = (key: string) => search.get(key) ?? hash.get(key)
  const error = get('error') ?? get('error_code')
  return {
    hasResult: Boolean(get('code') ?? get('access_token')),
    error: error ? error.toLowerCase() : null,
  }
}

// Drops `code`, tokens and error text from the address bar and the history entry.
function cleanUrl() {
  window.history.replaceState(window.history.state, '', window.location.pathname)
}

export function AuthCallbackPage() {
  // Read once: cleaning the URL later must not change the answer on a re-render or a StrictMode re-run.
  const [params] = useState(readParams)
  if (!params.hasResult && !params.error) {
    return <Navigate to={getSession() ? '/profile' : '/login'} replace />
  }
  return <CallbackFlow error={params.error} />
}

function CallbackFlow({ error }: { error: string | null }) {
  useDocumentTitle('Signing you in — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const navigate = useNavigate()
  const toast = useToast()
  // Read, not taken: StrictMode runs this twice, so the stash is cleared only once the flow ends.
  const [next] = useState(readStashedNext)
  const [view, setView] = useState<View>(() =>
    error
      ? error === 'access_denied'
        ? { status: 'cancelled' }
        : { status: 'failed', kind: 'session' }
      : { status: 'loading' },
  )
  const [attempt, setAttempt] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

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
    // supabase-js exchanges the code once, when its client is created; fetchMe waits for that through getSession.
    Promise.race([fetchMe({ signal: controller.signal }), timeout]).then(
      (me) => {
        clearTimeout(timer)
        if (controller.signal.aborted) return
        setSession({ name: me.fullName ?? `${me.firstName} ${me.lastName}`, email: me.email })
        clearStashedNext()
        toast.show({ kind: 'success', message: 'Signed in. Welcome back.' })
        // Replacing the entry also leaves the code out of history.
        navigate(safeNext(next, '/profile'), { replace: true })
      },
      (failure: unknown) => {
        clearTimeout(timer)
        if (controller.signal.aborted) return
        const kind = (failure as Partial<MeError> | null)?.kind ?? 'server'
        const failed: FailKind = kind === 'unauthorized' ? 'session' : kind
        // No half sign-in: only a retryable failure keeps the Supabase session, so Try again can reuse it.
        if (!RETRYABLE.includes(failed)) signOut()
        cleanUrl()
        setView({ status: 'failed', kind: failed })
      },
    )
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [attempt, error, navigate, next, toast])

  useEffect(() => {
    if (view.status !== 'loading') headingRef.current?.focus()
  }, [view.status])

  if (view.status === 'loading') return <CallbackSkeleton />

  const cancelled = view.status === 'cancelled'
  const copy = cancelled
    ? {
        title: 'You cancelled Google sign-in',
        body: 'Nothing was changed and no account was opened. Go back to login to try again whenever you are ready.',
      }
    : ERROR_COPY[view.kind]
  const retryable = !cancelled && RETRYABLE.includes(view.kind)

  return (
    <div className={CALLBACK_SHELL}>
      <div className={CALLBACK_CARD}>
        <span
          className={`flex size-10 items-center justify-center rounded-full border border-line-strong ${cancelled ? 'text-fg-muted' : 'text-danger'}`}
        >
          <AlertIcon size={20} />
        </span>
        <div role={cancelled ? undefined : 'alert'}>
          <h1 ref={headingRef} tabIndex={-1} className="display mt-4 text-2xl text-fg outline-none">
            {copy.title}
          </h1>
          <p className="mt-2 text-base leading-relaxed text-fg-muted">{copy.body}</p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row *:flex-1">
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
            onClick={signOut}
            className={retryable ? SECONDARY_BUTTON : PRIMARY_BUTTON}
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
