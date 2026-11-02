import '../../components/landing-v2/landing-v2.css'
import { ArBanner } from '../../components/landing-v2/ArBanner'
import { Faq } from '../../components/landing-v2/Faq'
import { Featured } from '../../components/landing-v2/Featured'
import { Hero } from '../../components/landing-v2/Hero'
import { Lookbook, Reception, Study, Tape } from '../../components/landing-v2/Sections'
import { SiteFooter } from '../../components/landing-v2/SiteFooter'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'Try the fit before it ships. SilhouFit pairs browser-based AR try-on and sizing from your measurements with one live catalogue shared by store and shop floor.'

/** Landing page (KRAL-style identity), routed at /. It brings its own nav and footer, so it renders in the bare layout. */
export function LandingV2Page() {
  useDocumentTitle('SilhouFit — Omnichannel apparel commerce with browser-based AR fitting')
  useMetaDescription(META_DESCRIPTION)

  return (
    <div className="sv2">
      <Hero />
      <Tape />
      <Study />
      <Featured />
      <Lookbook />
      <Reception />
      <Faq />
      <ArBanner />
      <SiteFooter />
    </div>
  )
}
