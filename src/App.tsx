import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { CookiePolicyPage } from './views/CookiePolicyPage'
import { LandingPage } from './views/LandingPage'
import { NotFoundPage } from './views/NotFoundPage'
import { PrivacyPolicyPage } from './views/PrivacyPolicyPage'
import { RefundPolicyPage } from './views/RefundPolicyPage'
import { TermsOfServicePage } from './views/TermsOfServicePage'

function App() {
  return (
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
  )
}

export default App
