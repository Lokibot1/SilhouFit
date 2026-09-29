import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { IntroLoader } from './components/IntroLoader'
import { Layout } from './components/Layout'
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
  const [introDone, setIntroDone] = useState(prefersReducedMotion())

  return (
    <>
      <AnimatePresence>
        {!introDone && (
          <IntroLoader key="intro" onFinished={() => setIntroDone(true)} />
        )}
      </AnimatePresence>

      <div inert={!introDone} aria-hidden={!introDone}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<LandingPage />} />
            <Route path="privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="terms-of-service" element={<TermsOfServicePage />} />
            <Route path="refund-policy" element={<RefundPolicyPage />} />
            <Route path="cookie-policy" element={<CookiePolicyPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </div>
    </>
  )
}

export default App
