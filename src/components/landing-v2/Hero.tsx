import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { WORDMARK } from './wordmark'

const PAD = 60
const { width: W, height: H, letters } = WORDMARK
// Far enough up that a retracted lid sits entirely above the letters.
const LID_TRAVEL = H + 2 * PAD + 10

const LINKS = [
  { label: 'Shop', to: '/shop' },
  { label: 'Study', to: { hash: '#detail' } },
  { label: 'Collection', to: { hash: '#collection' } },
  { label: 'Lookbook', to: { hash: '#lookbook' } },
  { label: 'FAQ', to: { hash: '#faq' } },
  { label: 'About', to: '/about' },
]

/** Full-viewport hero: an Obsidian band whose SILHOUFIT letters are cut out, so the stage behind (photo and chrome bust) shows through. */
export function Hero() {
  const heroRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  // Entrance: each letter's lid retracts upward left to right, then the copy rises in. Pre-paint, so nothing flashes.
  useLayoutEffect(() => {
    const root = heroRef.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animations: Animation[] = []
    root.querySelectorAll<SVGRectElement>('[data-lid]').forEach((lid, i) => {
      animations.push(
        lid.animate(
          [{ transform: 'translateY(0)' }, { transform: `translateY(${-LID_TRAVEL}px)` }],
          { duration: 900, delay: 150 + i * 90, easing: 'cubic-bezier(0.76, 0, 0.24, 1)', fill: 'backwards' },
        ),
      )
    })
    const rises = [...root.querySelectorAll<HTMLElement>('[data-rise]')].sort((a, b) => Number(a.dataset.rise) - Number(b.dataset.rise))
    rises.forEach((el, i) => {
      animations.push(
        el.animate(
          [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
          { duration: 700, delay: 800 + i * 110, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' },
        ),
      )
    })
    // Failsafe: a stalled timeline must never leave the band solid or the copy hidden.
    const failsafe = window.setTimeout(() => animations.forEach((a) => a.finish()), 4000)
    return () => {
      window.clearTimeout(failsafe)
      animations.forEach((a) => a.cancel())
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      menuRef.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <section ref={heroRef} className="sv2-hero" aria-label="SilhouFit introduction">
      <div className="sv2-stage">
        <img
          src="/images/gallery/tank-tops.webp"
          alt="Rail of tank tops in assorted colours"
          className="sv2-stage-img"
          fetchPriority="high"
        />
      </div>

      <div className="sv2-band">
        <div className="sv2-bar">
          <nav ref={navRef} className="sv2-nav" aria-label="Page sections" data-rise="0">
            <button
              ref={menuRef}
              type="button"
              className="sv2-menu-btn"
              aria-expanded={open}
              aria-controls="sv2-links"
              onClick={() => setOpen((o) => !o)}
            >
              Menu
            </button>
            <ul id="sv2-links" className="sv2-links" data-open={open || undefined} onClick={() => setOpen(false)}>
              {LINKS.map(({ label, to }) => (
                <li key={label}>
                  <Link to={to}>{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <p className="sv2-tag" data-rise="1">
            Because fit is what matters
          </p>
          <Link to="/shop" className="sv2-btn sv2-btn--red sv2-cta" data-rise="3">
            <span aria-hidden="true">//</span> Try it on
          </Link>
        </div>

        <svg className="sv2-mark" viewBox={`${-PAD} ${-PAD} ${W + 2 * PAD} ${H + 2 * PAD}`} role="img" aria-label="SilhouFit">
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
        <h1 className="sv2-hero-title" data-rise="2">
          <span>Try the fit //</span> <span>before it ships</span>
        </h1>
        <p className="sv2-hero-sub" data-rise="2">
          Preview how a garment sits on your own body, right in the browser. No headset, no kiosk.
        </p>
        <p className="sv2-meta" data-rise="4">
          <span>(Prototype // BSIT capstone)</span>
          <span>AR fit in your browser</span>
          <span>Online + in-store</span>
        </p>
      </div>
    </section>
  )
}
