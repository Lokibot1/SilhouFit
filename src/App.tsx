import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { CometCursor } from './components/CometCursor'
import { IntroLoader } from './components/IntroLoader'
import { Layout } from './components/Layout'
import { AboutPage } from './views/AboutPage'
import { CookiePolicyPage } from './views/CookiePolicyPage'
import { LandingPage } from './views/LandingPage'
import { NotFoundPage } from './views/NotFoundPage'
import { PrivacyPolicyPage } from './views/PrivacyPolicyPage'
import { RefundPolicyPage } from './views/RefundPolicyPage'
import { TermsOfServicePage } from './views/TermsOfServicePage'

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function App() {
  // The intro is the landing page's opening, not the site's loading bar: it
  // plays only when the visit begins on the home page. A page opened directly
  // -- a 404, an about link, a policy -- goes straight to its content, and so
  // does every in-app navigation, which never reloads the app in the first
  // place. Initial state only; later route changes never bring it back.
  const { pathname } = useLocation()
  const [introDone, setIntroDone] = useState(prefersReducedMotion() || pathname !== '/')

  return (
    <>
      <CometCursor />
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
            <Route path="privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="terms-of-service" element={<TermsOfServicePage />} />
            <Route path="refund-policy" element={<RefundPolicyPage />} />
            <Route path="cookie-policy" element={<CookiePolicyPage />} />
          </Route>
          <Route element={<Layout hideFooter />}>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </div>
    </>
  )
}

export default App
