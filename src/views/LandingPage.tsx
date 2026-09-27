import { ARFitting } from '../components/landing/ARFitting'
import { Capabilities } from '../components/landing/Capabilities'
import { Contact } from '../components/landing/Contact'
import { ForBoutiques } from '../components/landing/ForBoutiques'
import { Hero } from '../components/landing/Hero'
import { HowItWorks } from '../components/landing/HowItWorks'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function LandingPage() {
  useDocumentTitle(
    'SilhouFit — Omnichannel apparel commerce with browser-based AR fitting',
  )

  return (
    <>
      <Hero />
      <Capabilities />
      <ARFitting />
      <HowItWorks />
      <ForBoutiques />
      <Contact />
    </>
  )
}
