import { useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react'
import { SiteHeader } from './SiteHeader'
import { WORDMARK } from './wordmark'

const PAD = 60
const { width: W, height: H, letters } = WORDMARK
// Far enough up that a retracted lid sits entirely above the letters.
const LID_TRAVEL = H + 2 * PAD + 10

/** Full-viewport hero: an Obsidian band whose KRAL(R) letters are cut out, so the photo stage behind shows through. */
export function Hero() {
  const heroRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Entrance: each letter's lid retracts upward left to right, then the copy rises in. At "/" the page sits inert under the
  // intro loader, so the entrance waits until that wrapper is released; the copy stays hidden and the lids keep the band solid.
  useLayoutEffect(() => {
    const root = heroRef.current
    const header = headerRef.current
    if (!root || !header || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rises = [...header.querySelectorAll<HTMLElement>('[data-rise]'), ...root.querySelectorAll<HTMLElement>('[data-rise]')].sort((a, b) => Number(a.dataset.rise) - Number(b.dataset.rise))
    const animations: Animation[] = []
    let failsafe = 0

    const play = () => {
      root.querySelectorAll<SVGRectElement>('[data-lid]').forEach((lid, i) => {
        animations.push(
          lid.animate(
            [{ transform: 'translateY(0)' }, { transform: `translateY(${-LID_TRAVEL}px)` }],
            { duration: 900, delay: 150 + i * 90, easing: 'cubic-bezier(0.76, 0, 0.24, 1)', fill: 'backwards' },
          ),
        )
      })
      rises.forEach((el, i) => {
        animations.push(
          el.animate(
            [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
            { duration: 700, delay: 800 + i * 110, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' },
          ),
        )
      })
      rises.forEach((el) => el.style.removeProperty('opacity'))
      // Failsafe, armed once the entrance starts: a stalled timeline must never leave the band solid or the copy hidden.
      failsafe = window.setTimeout(() => animations.forEach((a) => a.finish()), 4000)
    }

    const gate = root.closest('[inert]')
    let observer: MutationObserver | undefined
    if (gate) {
      rises.forEach((el) => (el.style.opacity = '0'))
      observer = new MutationObserver(() => {
        if (gate.hasAttribute('inert')) return
        observer?.disconnect()
        play()
      })
      observer.observe(gate, { attributes: true, attributeFilter: ['inert'] })
    } else {
      play()
    }
    return () => {
      observer?.disconnect()
      window.clearTimeout(failsafe)
      animations.forEach((a) => a.cancel())
      rises.forEach((el) => el.style.removeProperty('opacity'))
    }
  }, [])

  // Sticky bar: its hairline appears once the hero band has scrolled away.
  useEffect(() => {
    const header = headerRef.current
    const band = heroRef.current?.querySelector('.sv2-band')
    if (!header || !band || !('IntersectionObserver' in window)) return
    const stuck = new IntersectionObserver(([e]) => header.toggleAttribute('data-stuck', !e.isIntersecting), { rootMargin: `-${header.offsetHeight}px 0px 0px 0px` })
    stuck.observe(band)
    return () => stuck.disconnect()
  }, [])

  const toTop = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    if (window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }
    titleRef.current?.focus({ preventScroll: true })
  }

  return (
    <>
      <SiteHeader ref={headerRef} landing onLogoClick={toTop} />

      <section ref={heroRef} className="sv2-hero" aria-label="KRAL introduction">
        <div className="sv2-stage">
          <img
            src="/images/gallery/tank-tops.webp"
            alt="Rail of tank tops in assorted colours"
            className="sv2-stage-img"
            fetchPriority="high"
          />
        </div>

        <div className="sv2-band">
          <svg className="sv2-mark" viewBox={`${-PAD} ${-PAD} ${W + 2 * PAD} ${H + 2 * PAD}`} role="img" aria-label="KRAL">
            <defs>
              <clipPath id="sv2-letters">
                {letters.map((l) => (
                  <path key={l.x} d={l.d} clipRule="evenodd" />
                ))}
              </clipPath>
            </defs>
            <path
              className="sv2-mark-band"
              fillRule="evenodd"
              d={`M${-PAD} ${-PAD}H${W + PAD}V${H + PAD}H${-PAD}Z${letters.map((l) => l.d).join('')}`}
            />
            <g clipPath="url(#sv2-letters)">
              {letters.map((l) => (
                <rect
                  key={l.x}
                  data-lid
                  className="sv2-mark-band"
                  x={l.x}
                  y={-PAD}
                  width={l.w}
                  height={H + 2 * PAD}
                  style={{ transform: `translateY(${-LID_TRAVEL}px)` }}
                />
              ))}
            </g>
          </svg>
        </div>

        <div className="sv2-foot">
          <h1 ref={titleRef} tabIndex={-1} className="sv2-hero-title" data-rise="2">
            <span>Try the fit //</span> <span>before it ships</span>
          </h1>
          <p className="sv2-hero-sub" data-rise="2">
            Preview how a garment sits on your own body, right in the browser. No headset, no kiosk.
          </p>
          <p className="sv2-meta" data-rise="4">
            <span className="sv2-name">SilhouFit</span>
            <span>AR fit in your browser</span>
          </p>
        </div>
      </section>
    </>
  )
}
