import { lazy, Suspense, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useOnboarding } from '../../hooks/useOnboarding'
import { fetchMe } from '../../service/fetchMe'
import { getOnboardingStatus } from '../../service/onboarding'

// The tour code only loads for someone who is about to see it.
const OnboardingTour = lazy(() =>
  import('./OnboardingTour').then((m) => ({ default: m.OnboardingTour })).catch(() => ({ default: () => null })),
)

// Calm pages only: never the landing page or the checkout, where an interruption costs the most.
const START_PATHS = /^\/(profile|shop|cart|wishlist)\/?$|^\/shop\/[^/]+\/?$/

// The tour is for shoppers only. A role that cannot be read counts as not a customer, so staff never see it by mistake.
const customerByEmail = new Map<string, boolean>()

async function isCustomer(email: string, signal: AbortSignal) {
  const known = customerByEmail.get(email)
  if (known !== undefined) return known
  try {
    const customer = (await fetchMe({ signal })).role === 'customer'
    customerByEmail.set(email, customer)
    return customer
  } catch {
    return false
  }
}

/** Offers the first-run tour once to a signed-in customer who has not seen it, and renders it while it is open. */
export function OnboardingGate() {
  const user = useCurrentUser()
  const { pathname } = useLocation()
  const { phase, exited, startTour } = useOnboarding()
  const email = user?.email

  useEffect(() => {
    if (!email || exited || phase !== null || !START_PATHS.test(pathname)) return
    const controller = new AbortController()
    void getOnboardingStatus(email)
      .then((status) => (status === 'none' ? isCustomer(email, controller.signal) : false))
      .then((customer) => {
        if (customer && !controller.signal.aborted) startTour()
      })
    return () => controller.abort()
  }, [email, exited, phase, pathname, startTour])

  if (!user || phase === null) return null
  return (
    <Suspense fallback={null}>
      <OnboardingTour />
    </Suspense>
  )
}
