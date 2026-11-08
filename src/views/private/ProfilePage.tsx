import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useOutletContext } from 'react-router-dom'
import { AlertIcon, LockIcon, LogOutIcon, SparkleIcon, UserIcon } from '../../components/form/icons'
import { BodyMeasurements } from '../../components/profile/BodyMeasurements'
import { ChangePasswordSheet } from '../../components/profile/ChangePasswordSheet'
import { DeliveryAddress } from '../../components/profile/DeliveryAddress'
import { EditProfileForm } from '../../components/profile/EditProfileForm'
import { KRAL_PANEL, KRAL_WRAP } from '../../components/profile/profileKral'
import { PROFILE_CARD, PROFILE_SHELL, ProfileSkeleton } from '../../components/profile/ProfileSkeleton'
import { ShopHeader } from '../../components/shop/ShopHeader'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { useToast } from '../../components/toast/useToast'
import { Avatar } from '../../components/ui/Avatar'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { IconEditButton } from '../../components/ui/IconEditButton'
import { Modal } from '../../components/ui/Modal'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useOnboarding } from '../../hooks/useOnboarding'
import { hasPasswordLogin } from '../../service/changePassword'
import { fetchMe, type Me, type MeErrorKind } from '../../service/fetchMe'
import { peekLoginNotice } from '../../service/loginNotice'
import { getSession, setSession } from '../../service/session'
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

/** A simulated account's session keeps its flags when the profile refreshes it, or the next /users/me call would go to Supabase and sign it out. */
const simulatedFlags = () => {
  const current = getSession()
  return current?.simulated ? { simulated: true, accountId: current.accountId } : {}
}

function formatDate(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** `tone="kral"` is the customer profile; staff, admin and owner profiles render it unset and keep the glass look. */
export function ProfilePage({ tone }: { tone?: 'kral' }) {
  const kral = tone === 'kral'
  useDocumentTitle('Your profile — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const { pathname } = useLocation()
  const user = useCurrentUser()
  const outlet = useOutletContext<{ onSignOut?: () => void } | null>()
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
  const [changingPassword, setChangingPassword] = useState(false)
  // An account that signs in only with Google has no password to change.
  const [passwordLogin, setPasswordLogin] = useState(true)

  useEffect(() => {
    void hasPasswordLogin().then(setPasswordLogin)
  }, [])

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
          ...simulatedFlags(),
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
    return <Navigate to={(hadUser && !expired) || peekLoginNotice() ? '/login' : '/login?next=%2Fprofile'} replace />
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
      ...simulatedFlags(),
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
    // Inside the staff shell, tell it this is a chosen sign out so it lands on a plain /login.
    outlet?.onSignOut?.()
    signOut()
    toast.show({ kind: 'success', message: 'Signed out' })
  }

  if (state.status === 'loading') return <ProfileSkeleton tone={tone} />

  if (state.status === 'error') {
    const copy = ERROR_COPY[state.kind]
    const missing = state.kind === 'not-found'
    if (kral) {
      return (
        <>
          <ShopHeader tone="kral" ref={headingRef} title="Your profile" crumb="Profile" icon={<UserIcon className="size-[1.1em]" />} />
          <div className={KRAL_WRAP}>
            <div role="alert" className={`${KRAL_PANEL} flex items-start gap-3`}>
              <AlertIcon size={20} className="mt-1 shrink-0 text-kral-red-ink" />
              <div className="min-w-0">
                <h2 className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">{copy.title}</h2>
                <p className="font-kral-mono mt-3 max-w-xl text-base leading-relaxed text-kral-muted">{copy.body}</p>
                <button type="button" onClick={missing ? leave : retry} className={`${missing ? KRAL_SECONDARY : KRAL_PRIMARY} mt-6 w-fit`}>
                  {missing ? <LogOutIcon size={16} /> : null}
                  {missing ? 'Sign out' : 'Try again'}
                </button>
              </div>
            </div>
          </div>
        </>
      )
    }
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
  const simulated = Boolean(getSession()?.simulated)

  if (kral) {
    return (
      <>
        <ShopHeader tone="kral" ref={headingRef} title={name} crumb="Profile" />
        <div className={KRAL_WRAP}>
          <section aria-label="Your profile" className={`${KRAL_PANEL} flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8`}>
            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center sm:gap-6 lg:flex-1">
              <Avatar tone="kral" name={name} src={me.avatarUrl ?? undefined} initials={initialsOf(me)} size="xl" />
              <div className="min-w-0 flex-1">
                <p className="font-kral-mono text-base text-kral-muted uppercase md:text-xs md:tracking-[0.08em]">(Email)</p>
                <div className="flex items-center gap-1">
                  <p className="font-kral-mono min-w-0 text-base font-medium wrap-anywhere text-kral-fg sm:text-lg">{me.email}</p>
                  {me.role === 'customer' && <IconEditButton tone="kral" label="Edit profile" onClick={() => setEditing(true)} className="shrink-0" />}
                </div>
                {(since || simulated) && (
                  <dl className="mt-2 grid gap-1">
                    {simulated && (
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <dt className="font-kral-mono text-base text-kral-muted uppercase md:text-xs md:tracking-[0.08em]">Role</dt>
                        <dd className="font-kral-mono text-base text-kral-fg capitalize before:mr-2 before:text-kral-muted before:content-['//']">{me.role}</dd>
                      </div>
                    )}
                    {simulated && me.phone && (
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <dt className="font-kral-mono text-base text-kral-muted uppercase md:text-xs md:tracking-[0.08em]">Phone</dt>
                        <dd className="font-kral-mono text-base text-kral-fg tabular-nums before:mr-2 before:text-kral-muted before:content-['//']">{me.phone}</dd>
                      </div>
                    )}
                    {since && (
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <dt className="font-kral-mono text-base text-kral-muted uppercase before:content-['('] after:content-[')'] md:text-xs md:tracking-[0.08em]">Member since</dt>
                        <dd className="font-kral-mono text-base text-kral-fg before:mr-2 before:text-kral-muted before:content-['//']">{since}</dd>
                      </div>
                    )}
                  </dl>
                )}
                {simulated && (
                  <p role="note" className="font-kral-mono mt-3 text-base text-kral-muted md:text-sm">
                    This is a demo account saved in this browser. Photo upload, body measurements and delivery addresses need the shop account, so they are not available here.
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-3 border-t border-kral-rule pt-6 sm:flex sm:flex-wrap lg:shrink-0 lg:justify-end lg:border-t-0 lg:pt-0">
              {me.role === 'customer' && (
                <button type="button" onClick={() => startTour({ skipWelcome: true })} className={KRAL_SECONDARY}>
                  <SparkleIcon size={16} />
                  Replay the tour
                </button>
              )}
              {passwordLogin && (
                <button type="button" onClick={() => setChangingPassword(true)} className={KRAL_SECONDARY}>
                  <LockIcon size={16} />
                  Change password
                </button>
              )}
              <button type="button" onClick={leave} className={`${KRAL_SECONDARY} border-transparent!`}>
                <LogOutIcon size={16} />
                Sign out
              </button>
            </div>
          </section>
          {me.role === 'customer' && (
            <div className="mt-6 grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
              {/* From lg the addresses fill the row at the height of Body measurements and scroll inside it. */}
              <div className="min-w-0 lg:relative lg:min-h-112">
                <DeliveryAddress onUnauthorized={expire} />
              </div>
              <BodyMeasurements />
            </div>
          )}
          {passwordLogin && <ChangePasswordSheet tone="kral" open={changingPassword} onClose={() => setChangingPassword(false)} />}
          {me.role === 'customer' && (
            <Modal tone="kral" compact open={editing} onClose={closeEditor} title="Edit your profile">
              <EditProfileForm me={me} onSaved={saved} onCancel={closeEditor} onUnauthorized={expire} onPendingChange={setSaving} />
            </Modal>
          )}
        </div>
      </>
    )
  }

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
        {(since || simulated) && (
          <dl className="mt-6 grid gap-3">
            {simulated && (
              <div>
                <dt className="text-sm text-fg-muted">Role</dt>
                <dd className="text-base text-fg capitalize">{me.role}</dd>
              </div>
            )}
            {simulated && me.phone && (
              <div>
                <dt className="text-sm text-fg-muted">Phone</dt>
                <dd className="text-base text-fg tabular-nums">{me.phone}</dd>
              </div>
            )}
            {since && (
              <div>
                <dt className="text-sm text-fg-muted">Member since</dt>
                <dd className="text-base text-fg">{since}</dd>
              </div>
            )}
          </dl>
        )}
        {simulated && (
          <p role="note" className="mt-4 text-sm text-fg-muted">
            This is a demo account saved in this browser. Photo upload, body measurements and delivery addresses need the shop account, so they are not available here.
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          {me.role === 'customer' && (
            <button type="button" onClick={() => startTour({ skipWelcome: true })} className={SECONDARY_BUTTON}>
              Replay the tour
            </button>
          )}
          {passwordLogin && (
            <button type="button" onClick={() => setChangingPassword(true)} className={`${SECONDARY_BUTTON} gap-2`}>
              <LockIcon size={16} />
              Change password
            </button>
          )}
          <button type="button" onClick={leave} className={`${SECONDARY_BUTTON} gap-2`}>
            <LogOutIcon size={16} />
            Sign out
          </button>
        </div>
      </section>
      {me.role === 'customer' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
          {/* From lg the addresses fill the row at the height of Body measurements and scroll inside it. */}
          <div className="lg:relative lg:min-h-112">
            <DeliveryAddress onUnauthorized={expire} />
          </div>
          <BodyMeasurements />
        </div>
      )}
      {passwordLogin && <ChangePasswordSheet open={changingPassword} onClose={() => setChangingPassword(false)} />}
      {me.role === 'customer' && (
        <Modal open={editing} onClose={closeEditor} title="Edit your profile">
          <EditProfileForm me={me} onSaved={saved} onCancel={closeEditor} onUnauthorized={expire} onPendingChange={setSaving} />
        </Modal>
      )}
    </div>
  )
}
