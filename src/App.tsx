import { AnimatePresence } from 'motion/react'
import { lazy, Suspense, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { LandingCometCursor } from './components/CometCursor'
import { IntroLoader } from './components/IntroLoader'
import { SignUpSkeleton } from './components/form/SignUpSkeleton'
import { Layout } from './components/Layout'
import { AboutPage } from './views/AboutPage'
import { CookiePolicyPage } from './views/CookiePolicyPage'
import { LandingPage } from './views/LandingPage'
import { NotFoundPage } from './views/NotFoundPage'
import { PrivacyPolicyPage } from './views/PrivacyPolicyPage'
import { RefundPolicyPage } from './views/RefundPolicyPage'
import { TermsOfServicePage } from './views/TermsOfServicePage'

const SignUpPage = lazy(() =>
  import('./views/SignUpPage').then((m) => ({ default: m.SignUpPage })),
)

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function App() {
  const { pathname } = useLocation()
  const [introDone, setIntroDone] = useState(prefersReducedMotion() || pathname !== '/')

  return (
    <>
      <LandingCometCursor />
      <AnimatePresence>
        {!introDone && (
          <IntroLoader key="intro" onFinished={() => setIntroDone(true)} />
        )}
      </AnimatePresence>

      <div inert={!introDone} aria-hidden={!introDone}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<LandingPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route
              path="signup"
              element={
                <Suspense fallback={<SignUpSkeleton />}>
                  <SignUpPage />
                </Suspense>
              }
            />
            <Route path="privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="terms-of-service" element={<TermsOfServicePage />} />
            <Route path="refund-policy" element={<RefundPolicyPage />} />
            <Route path="cookie-policy" element={<CookiePolicyPage />} />
          </Route>
          <Route element={<Layout bare />}>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </div>
    </>
  )
}

export default App
