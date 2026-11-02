import { useLayoutEffect, useRef } from 'react'
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
// Scroll-in reveals: section headings and static grids fade and rise once. Featured's cards load asynchronously, so only its heading reveals.
const REVEAL = '.sv2-head, .sv2-specs > *, .sv2-mosaic > *, .sv2-quotes > *, .sv2-faq > *, .sv2-ar-copy'

export function LandingV2Page() {
  const rootRef = useRef<HTMLDivElement>(null)
  useDocumentTitle('SilhouFit — Omnichannel apparel commerce with browser-based AR fitting')
  useMetaDescription(META_DESCRIPTION)

  // The hidden state is only switched on once the observer exists, so content is never stranded without JS or IntersectionObserver.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const items = [...root.querySelectorAll<HTMLElement>(REVEAL)]
    items.forEach((el) => el.style.setProperty('--i', String([...(el.parentElement?.children ?? [])].indexOf(el))))
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return
          e.target.classList.add('sv2-in')
          io.unobserve(e.target)
        }),
      { rootMargin: '0px 0px -10% 0px' },
    )
    items.forEach((el) => {
      el.classList.add('sv2-reveal')
      io.observe(el)
    })
    return () => {
      io.disconnect()
      items.forEach((el) => el.classList.remove('sv2-reveal', 'sv2-in'))
    }
  }, [])

  return (
    <div className="sv2" ref={rootRef}>
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
