import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AlertIcon } from '../../components/form/icons'
import { BodyMeasurements } from '../../components/profile/BodyMeasurements'
import { DeliveryAddress } from '../../components/profile/DeliveryAddress'
import { EditProfileForm } from '../../components/profile/EditProfileForm'
import { PROFILE_CARD, PROFILE_SHELL, ProfileSkeleton } from '../../components/profile/ProfileSkeleton'
import { useToast } from '../../components/toast/useToast'
import { Avatar } from '../../components/ui/Avatar'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { IconEditButton } from '../../components/ui/IconEditButton'
import { Modal } from '../../components/ui/Modal'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useOnboarding } from '../../hooks/useOnboarding'
import { fetchMe, type Me, type MeErrorKind } from '../../service/fetchMe'
import { setSession } from '../../service/session'
import { signOut } from '../../service/signOut'
import { isStaffRole } from '../../utils/staffRole'

const META_DESCRIPTION =
  'Review the name, email, join date and delivery address saved on your SilhouFit account, and sign out of this device when you are done shopping or fitting.'

const ERROR_COPY: Record<Exclude<MeErrorKind, 'unauthorized'>, { title: string; body: string }> = {
  network: {
    title: "We couldn't load your profile.",
    body: 'The connection dropped before we got a response. Check your connection and try again.',
  },
  'rate-limit': {
    title: "We couldn't load your profile.",
    body: 'Our servers are limiting requests right now. Wait a minute, then try again.',
  },
  server: {
    title: "We couldn't load your profile.",
    body: 'Something went wrong on our side. Try again in a moment.',
  },
  'not-found': {
    title: "We couldn't find your profile.",
    body: 'You are signed in, but no profile is saved for this account. Sign out and sign in again, or contact support if it keeps happening.',
  },
}

type State =
  | { status: 'loading' }
  | { status: 'error'; kind: Exclude<MeErrorKind, 'unauthorized'> }
  | { status: 'success'; me: Me }

/** First letter of the first name and of the last name, so "Anna Maria Cruz Jr." is "AC". */
const initialsOf = (me: Me) => `${me.firstName[0]}${me.lastName[0]}`.toUpperCase()

function formatDate(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function ProfilePage() {
  useDocumentTitle('Your profile — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const { pathname } = useLocation()
  const user = useCurrentUser()
  const toast = useToast()
  const { startTour } = useOnboarding()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Signed in when the page opened: losing the session later (Sign out here or in the navbar) ends at the login page.
  const [hadUser] = useState(user !== null)
  const [expired, setExpired] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetchMe({ signal: controller.signal }).then(
      (me) => {
        // Keep the navbar avatar in step with /me, including for sessions saved before avatarUrl was cached.
        setSession({
          name: me.fullName ?? `${me.firstName} ${me.lastName}`,
          email: me.email,
          avatarUrl: me.avatarUrl ?? undefined,
          initials: initialsOf(me),
          role: me.role,
        })
        setState({ status: 'success', me })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        const kind = (error as { kind?: MeErrorKind } | null)?.kind ?? 'server'
        if (kind === 'unauthorized') {
          expire()
          return
        }
        setState({ status: 'error', kind })
      },
    )
    return () => controller.abort()
  }, [attempt])

  // The token is no longer valid: end the session, then the guard sends the user to sign in again.
  function expire() {
    setExpired(true)
    signOut()
  }

  useEffect(() => {
    // The tour's welcome card may already hold focus; the heading must not take it back.
    if (state.status !== 'loading' && !document.querySelector('[aria-modal="true"]')) headingRef.current?.focus()
  }, [state.status])

  // Staff roles see their profile inside their own sidebar shell.
  if (state.status === 'success' && isStaffRole(state.me.role) && !pathname.startsWith(`/${state.me.role}/`)) {
    return <Navigate to={`/${state.me.role}/profile`} replace />
  }

  if (!user) {
    return <Navigate to={hadUser && !expired ? '/login' : '/login?next=%2Fprofile'} replace />
  }

  function retry() {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  function saved(me: Me) {
    setSession({
      name: me.fullName ?? `${me.firstName} ${me.lastName}`,
      email: me.email,
      avatarUrl: me.avatarUrl ?? undefined,
      initials: initialsOf(me),
      role: me.role,
    })
    setState({ status: 'success', me })
    setSaving(false)
    setEditing(false)
    toast.show({ kind: 'success', message: 'Profile updated' })
  }

  // The dialog stays open while a save is in flight, so its result is never lost.
  function closeEditor() {
    if (!saving) setEditing(false)
  }

  function leave() {
    signOut()
    toast.show({ kind: 'success', message: 'Signed out' })
  }

  if (state.status === 'loading') return <ProfileSkeleton />

  if (state.status === 'error') {
    const copy = ERROR_COPY[state.kind]
    const missing = state.kind === 'not-found'
    return (
      <div className={PROFILE_SHELL}>
        <div role="alert" className={`${PROFILE_CARD} flex items-start gap-3`}>
          <AlertIcon size={20} className="mt-1 shrink-0 text-danger" />
          <div className="min-w-0">
            <h1 ref={headingRef} tabIndex={-1} className="display text-2xl text-fg outline-none">
              {copy.title}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">{copy.body}</p>
            <button
              type="button"
              onClick={missing ? leave : retry}
              className={`${missing ? SECONDARY_BUTTON : PRIMARY_BUTTON} mt-6`}
            >
              {missing ? 'Sign out' : 'Try again'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { me } = state
  const name = me.fullName ?? `${me.firstName} ${me.lastName}`
  const since = formatDate(me.createdAt)

  return (
    <div className={PROFILE_SHELL}>
      <section aria-label="Your profile" className={PROFILE_CARD}>
        <div className="flex items-center gap-4">
          <Avatar name={name} src={me.avatarUrl ?? undefined} initials={initialsOf(me)} size="lg" />
          <div className="min-w-0 flex-1">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="display text-3xl wrap-break-word text-fg outline-none sm:text-4xl"
            >
              {name}
            </h1>
            <p className="text-base wrap-break-word text-fg-muted">{me.email}</p>
          </div>
          {me.role === 'customer' && (
            <IconEditButton label="Edit profile" onClick={() => setEditing(true)} className="-mt-2 -mr-2 self-start" />
          )}
        </div>
        {since && (
          <dl className="mt-6">
            <dt className="text-sm text-fg-muted">Member since</dt>
            <dd className="text-base text-fg">{since}</dd>
          </dl>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          {me.role === 'customer' && (
            <button type="button" onClick={() => startTour({ skipWelcome: true })} className={SECONDARY_BUTTON}>
              Replay the tour
            </button>
          )}
          <button type="button" onClick={leave} className={SECONDARY_BUTTON}>
            Sign out
          </button>
        </div>
      </section>
      {me.role === 'customer' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-start">
          <DeliveryAddress onUnauthorized={expire} />
          <BodyMeasurements />
        </div>
      )}
      {me.role === 'customer' && (
        <Modal open={editing} onClose={closeEditor} title="Edit your profile">
          <EditProfileForm me={me} onSaved={saved} onCancel={closeEditor} onUnauthorized={expire} onPendingChange={setSaving} />
        </Modal>
      )}
    </div>
  )
}
