import { ARFitting } from '../../components/landing/ARFitting'
import { Contact } from '../../components/landing/Contact'
import { Gallery } from '../../components/landing/Gallery'
import { Hero } from '../../components/landing/Hero'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'SilhouFit connects local apparel stores with real-time POS sync, browser-based AR try-on and retail analytics, so shoppers and boutiques see one catalogue.'

export function LandingPage() {
  useDocumentTitle(
    'SilhouFit — Omnichannel apparel commerce with browser-based AR fitting',
  )
  useMetaDescription(META_DESCRIPTION)

  return (
    <>
      <Hero />
      <Gallery />
      <ARFitting />
      <Contact />
    </>
  )
}
