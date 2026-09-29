import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { SilhouetteMark } from './landing/SilhouetteMark'

const PROJECT_LINKS = [
  { label: 'Capabilities', href: '/#capabilities' },
  { label: 'AR fitting', href: '/#ar-fitting' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'For boutiques', href: '/#boutiques' },
]

const LEGAL_LINKS = [
  { label: 'Privacy policy', to: '/privacy-policy' },
  { label: 'Terms of service', to: '/terms-of-service' },
  { label: 'Refund policy', to: '/refund-policy' },
  { label: 'Cookie policy', to: '/cookie-policy' },
]

const LINK_CLASS =
  'group relative inline-flex text-base text-fg/80 transition-colors duration-200 hover:text-fg'

const LINK_UNDERLINE =
  'pointer-events-none absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-current/50 transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100'

function BackToTop() {
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="glass-clear glass-btn btn-lift font-ui flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-fg hover:text-chrome-strong"
    >
      Back to top
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="M8 13V3M3 7l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export function Footer() {
  const year = new Date().getFullYear()
  const footerRef = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: footerRef,
    offset: ['start end', 'end end'],
  })
  // The figure from the hero card, arriving at the bottom of the page still
  // settling. It is the one element that moves across a section boundary, so
  // the page closes on the mark it opened with rather than on a flat panel.
  const markY = useTransform(scrollYProgress, [0, 1], [reduced ? 0 : -90, 0])

  return (
    <footer
      ref={footerRef}
      className="relative overflow-hidden bg-canvas-sub"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_18%_0%,rgb(var(--glass-tint)/0.05),transparent)]"
      />

      <motion.div
        aria-hidden="true"
        style={{ y: markY }}
        className="pointer-events-none absolute -top-16 -right-20 hidden will-change-transform sm:-top-20 sm:-right-28 sm:block lg:-top-24 lg:-right-32"
      >
        <SilhouetteMark className="h-[28rem] w-[22rem] text-fg/[0.05] sm:h-[36rem] sm:w-[28rem] lg:h-[42rem] lg:w-[34rem]" />
      </motion.div>

      <div className="relative mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:py-24">
        <div className="grid grid-cols-1 gap-y-12 sm:grid-cols-2 sm:gap-x-10 sm:gap-y-14 lg:grid-cols-[1.4fr_0.85fr_0.85fr_0.85fr] lg:gap-x-10 lg:gap-y-0">
          <div>
            <SilhouetteMark className="h-10 w-8 text-chrome-strong" />
            <span className="display mt-3 block text-[1.75rem] text-fg sm:text-3xl">
              SilhouFit
            </span>
            <p className="mt-3 max-w-[26ch] text-sm leading-relaxed text-fg-muted">
              Omnichannel store platform with browser-based AR fitting and
              retail analytics. A capstone project, not a live storefront.
            </p>
          </div>

          <div>
            <span className="font-ui block text-[11px] font-semibold tracking-[0.14em] text-fg uppercase">
              Contact
            </span>
            <a
              href="mailto:team@silhoufit.dev"
              className={`${LINK_CLASS} font-ui mt-3 hover:text-chrome-strong`}
            >
              team@silhoufit.dev
              <span aria-hidden="true" className={LINK_UNDERLINE} />
            </a>
            <p className="font-ui mt-3 text-sm text-chrome-strong">
              Capstone project
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              BS Information Technology, Quezon City University
            </p>
          </div>

          <div>
            <span className="font-ui text-[11px] font-semibold tracking-[0.14em] text-fg uppercase">
              Project
            </span>
            <ul className="mt-3 space-y-2.5">
              {PROJECT_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className={`${LINK_CLASS} font-ui`}>
                    {link.label}
                    <span aria-hidden="true" className={LINK_UNDERLINE} />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <span className="font-ui text-[11px] font-semibold tracking-[0.14em] text-fg uppercase">
              Legal
            </span>
            <ul className="mt-3 space-y-2.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className={`${LINK_CLASS} font-ui`}>
                    {link.label}
                    <span aria-hidden="true" className={LINK_UNDERLINE} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-ui text-xs text-fg-muted">
            &copy; {year} SilhouFit. A Quezon City University BS Information
            Technology capstone project.
          </p>
          <BackToTop />
        </div>
      </div>
    </footer>
  )
}
