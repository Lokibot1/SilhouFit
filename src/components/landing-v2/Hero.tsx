import { lazy, Suspense, useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react'
import { SiteHeader } from './SiteHeader'
import { WORDMARK } from './wordmark'

const HeroShader = lazy(() => import('./HeroShader'))

const PAD = 60
const { width: W, height: H, letters } = WORDMARK
// Far enough up that a retracted lid sits entirely above the letters.
const LID_TRAVEL = H + 2 * PAD + 10

/** Full-viewport hero: a band whose KRAL(R) letters are cut out, so the shader behind them shows through; the walkers stand on the same background below it. */
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
          <div className="sv2-figures">
            <img
              src="/images/brand/walkers-2x.webp"
              srcSet="/images/brand/walkers-1x.webp 1100w, /images/brand/walkers-2x.webp 1600w"
              sizes="(min-width: 1024px) 90vw, 150vw"
              width={1600}
              height={560}
              alt="A man in a puffer jacket, cap and realtree camouflage trousers stands still while blurred figures in the same outfit walk past"
              className="sv2-stage-img"
              loading="eager"
              fetchPriority="high"
            />
            <img
              src="/images/brand/walkers-2x.webp"
              srcSet="/images/brand/walkers-1x.webp 1100w, /images/brand/walkers-2x.webp 1600w"
              sizes="(min-width: 1024px) 90vw, 150vw"
              width={1600}
              height={560}
              alt=""
              aria-hidden="true"
              className="sv2-reflection"
            />
          </div>
        </div>

        <div className="sv2-band">
          {/* Behind the cut-out letters: a solid fill (the legible wordmark while the shader loads or if WebGL is missing), then the shader. */}
          <div className="sv2-glyph" aria-hidden="true">
            <Suspense fallback={null}>
              <HeroShader />
            </Suspense>
          </div>
          <svg className="sv2-mark" viewBox={`${-PAD} ${-PAD} ${W + 2 * PAD} ${H + 2 * PAD}`} role="img" aria-label="KRAL">
            <defs>
              <clipPath id="sv2-letters">
                {letters.map((l) => (
                  <path key={l.x} d={l.d} clipRule="evenodd" />
                ))}
              </clipPath>
              {/* Light theme: the motion-blurred edges are semi-transparent darker tan, which reads as grey smoke on Paper; steepen the alpha ramp a little. */}
              <filter id="sv2-edge" colorInterpolationFilters="sRGB">
                <feComponentTransfer>
                  <feFuncA type="linear" slope="1.5" intercept="-0.2" />
                </feComponentTransfer>
              </filter>
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
          <h1 ref={titleRef} tabIndex={-1} className="sr-only">
            KRAL
          </h1>
          <p className="sv2-hero-sub" data-rise="2">
            Preview how a garment sits on your own body, right in the browser. No headset, no kiosk.
          </p>
          <p className="sv2-meta" data-rise="4">
            <span className="sv2-name">SilhouFit</span>
          </p>
        </div>
      </section>
    </>
  )
}
