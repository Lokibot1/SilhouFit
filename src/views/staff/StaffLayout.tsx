import { Suspense, useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { AlertIcon } from '../../components/form/icons'
import { SkipLink } from '../../components/SkipLink'
import { StaffNav } from '../../components/staff/StaffNav'
import { StaffSidebar } from '../../components/staff/StaffSidebar'
import { STAFF_MAIN, StaffShellSkeleton } from '../../components/staff/StaffSkeleton'
import { StaffTopbar } from '../../components/staff/StaffTopbar'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { Modal } from '../../components/ui/Modal'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useSidebarCollapsed } from '../../hooks/useSidebarCollapsed'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { fetchMe, type Me, type MeErrorKind } from '../../service/fetchMe'
import { signOut } from '../../service/signOut'
import { homeFor, isStaffRole, type Area } from '../../utils/staffRole'

const ERROR_COPY: Record<'network' | 'rate-limit' | 'server' | 'not-found', { title: string; body: string }> = {
  network: {
    title: "We couldn't load your account.",
    body: 'The connection dropped before we got a response. Check your connection and try again.',
  },
  'rate-limit': {
    title: "We couldn't load your account.",
    body: 'Our servers are limiting requests right now. Wait a minute, then try again.',
  },
  server: {
    title: "We couldn't load your account.",
    body: 'Something went wrong on our side. Try again in a moment.',
  },
  'not-found': {
    title: "We couldn't find your account.",
    body: 'You are signed in, but no profile is saved for this account. Sign out and sign in again, or contact support if it keeps happening.',
  },
}

type State =
  | { status: 'loading' }
  | { status: 'error'; kind: keyof typeof ERROR_COPY }
  | { status: 'success'; me: Me }

/** The signed-in staff member, loaded once by StaffLayout. */
export const useStaffMe = () => useOutletContext<{ me: Me }>().me

/** Guards one area (signed in, and the role must match the area) and draws the sidebar shell around its pages. */
export function StaffLayout({ area = 'staff' }: { area?: Area }) {
  const user = useCurrentUser()
  const toast = useToast()
  const { pathname } = useLocation()
  const wide = useMediaQuery('(min-width: 1024px)')
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, toggleSidebar] = useSidebarCollapsed()
  const notified = useRef(false)
  const signedIn = user !== null
  const role = state.status === 'success' ? state.me.role : undefined
  const denied = state.status === 'success' && role !== area

  useEffect(() => {
    if (!signedIn) return
    const controller = new AbortController()
    fetchMe({ signal: controller.signal }).then(
      (me) => setState({ status: 'success', me }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        const kind = (error as { kind?: MeErrorKind } | null)?.kind ?? 'server'
        // The token is no longer valid: end the session, and the signed-out branch below sends the user to sign in.
        if (kind === 'unauthorized') signOut()
        else setState({ status: 'error', kind })
      },
    )
    return () => controller.abort()
  }, [attempt, signedIn])

  useEffect(() => {
    if (!denied || notified.current) return
    notified.current = true
    toast.show({
      kind: 'info',
      message: isStaffRole(role) ? 'That page is for another role. This is your dashboard.' : 'Staff pages need a staff account.',
    })
  }, [denied, role, toast])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  function leave() {
    setLeaving(true)
    signOut()
    toast.show({ kind: 'success', message: 'Signed out' })
  }

  if (!user) return <Navigate to={leaving ? '/login' : `/login?next=${encodeURIComponent(pathname)}`} replace />
  if (state.status === 'loading') return <StaffShellSkeleton />
  if (denied) return <Navigate to={homeFor(role)} replace />

  if (state.status === 'error') {
    const copy = ERROR_COPY[state.kind]
    const missing = state.kind === 'not-found'
    return (
      <main id="main-content" className="staff-shell grid min-h-svh place-items-center bg-canvas px-4 text-fg">
        <SkipLink />
        <div role="alert" className="flex w-full max-w-xl items-start gap-3 rounded-2xl border border-line bg-canvas-sub p-6 sm:p-8">
          <AlertIcon size={20} className="mt-1 shrink-0 text-danger" />
          <div className="min-w-0">
            <h1 className="display text-2xl text-fg">{copy.title}</h1>
            <p className="mt-3 text-base leading-relaxed text-fg-muted">{copy.body}</p>
            <button type="button" onClick={missing ? leave : retry} className={`${missing ? SECONDARY_BUTTON : PRIMARY_BUTTON} mt-6`}>
              {missing ? 'Sign out' : 'Try again'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  const { me } = state
  return (
    <div className="staff-shell min-h-svh bg-canvas text-fg">
      <SkipLink />
      <StaffTopbar
        area={area}
        user={user}
        wide={wide}
        collapsed={collapsed}
        onToggleSidebar={toggleSidebar}
        onMenu={() => setMenuOpen(true)}
        onSignOut={() => setLeaving(true)}
      />
      <div className="lg:flex">
        <StaffSidebar area={area} collapsed={collapsed} />
        <div className="min-w-0 flex-1">
          <main id="main-content" className={STAFF_MAIN}>
            <Suspense fallback={null}>
              <Outlet context={{ me }} />
            </Suspense>
          </main>
        </div>
      </div>
      <Modal open={menuOpen && !wide} onClose={() => setMenuOpen(false)} title="Menu" variant="sheet-left">
        <div className="staff-shell flex min-h-full flex-col pb-5">
          <StaffNav area={area} onNavigate={() => setMenuOpen(false)} />
        </div>
      </Modal>
    </div>
  )
}
