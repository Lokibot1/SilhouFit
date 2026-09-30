import { ARFitting } from '../components/landing/ARFitting'
import { Contact } from '../components/landing/Contact'
import { Gallery } from '../components/landing/Gallery'
import { Hero } from '../components/landing/Hero'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function LandingPage() {
  useDocumentTitle(
    'SilhouFit — Omnichannel apparel commerce with browser-based AR fitting',
  )

  return (
    <>
      <Hero />
      <Gallery />
      <ARFitting />
      <Contact />
    </>
  )
}
