import { lazy, Suspense, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useCookieConsent } from '../../contexts/CookieConsentContext'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useOnboarding } from '../../hooks/useOnboarding'
import { getOnboardingStatus } from '../../service/onboarding'

// The tour code only loads for someone who is about to see it.
const OnboardingTour = lazy(() =>
  import('./OnboardingTour').then((m) => ({ default: m.OnboardingTour })).catch(() => ({ default: () => null })),
)

// Calm pages only: never the landing page or the checkout, where an interruption costs the most.
const START_PATHS = /^\/(profile|shop|cart|wishlist)\/?$|^\/shop\/[^/]+\/?$/

/** Offers the first-run tour once to a signed-in user who has not seen it, and renders it while it is open. */
export function OnboardingGate() {
  const user = useCurrentUser()
  const { status: consent } = useCookieConsent()
  const { pathname } = useLocation()
  const { phase, exited, startTour } = useOnboarding()
  const email = user?.email

  useEffect(() => {
    if (!email || consent === null || exited || phase !== null || !START_PATHS.test(pathname)) return
    let stale = false
    void getOnboardingStatus(email).then((status) => {
      if (!stale && status === 'none') startTour()
    })
    return () => {
      stale = true
    }
  }, [email, consent, exited, phase, pathname, startTour])

  if (!user || phase === null) return null
  return (
    <Suspense fallback={null}>
      <OnboardingTour />
    </Suspense>
  )
}
