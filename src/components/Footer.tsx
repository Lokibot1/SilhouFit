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

function BackToTop() {
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="glass glass-btn font-ui flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-ink hover:text-bronze dark:text-bone dark:hover:text-bronze-light"
    >
      Back to top
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
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

  return (
    <footer className="relative overflow-hidden bg-bone-soft dark:bg-ink-soft">
      <SilhouetteMark className="pointer-events-none absolute -right-24 -top-16 h-[36rem] w-[28rem] text-ink/[0.05] dark:text-bone/[0.06]" />

      <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="grid gap-16 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <SilhouetteMark className="h-14 w-11 text-bronze-deep dark:text-bronze-light" />
            <span className="display mt-4 block text-[clamp(2rem,4.5vw,3.5rem)] text-ink dark:text-bone">
              SilhouFit
            </span>
            <p className="mt-4 max-w-sm text-base leading-relaxed text-ink/60 dark:text-bone/60">
              Omnichannel store platform with browser-based AR fitting and
              retail analytics. A capstone project, not a live storefront.
            </p>
          </div>

          <div>
            <span className="font-ui text-xs font-semibold tracking-[0.08em] text-ink/45 uppercase dark:text-bone/45">
              Contact
            </span>
            <a
              href="mailto:team@silhoufit.dev"
              className="font-ui mt-4 block text-base text-ink hover:text-bronze dark:text-bone dark:hover:text-bronze-light"
            >
              team@silhoufit.dev
            </a>
            <p className="font-ui mt-2 text-sm text-bronze-deep dark:text-bronze-light">
              Capstone project
            </p>
            <p className="mt-1 text-sm text-ink/55 dark:text-bone/55">
              BS Information Technology, Quezon City University
            </p>
          </div>

          <div>
            <span className="font-ui text-xs font-semibold tracking-[0.08em] text-ink/45 uppercase dark:text-bone/45">
              Project
            </span>
            <ul className="mt-4 space-y-3">
              {PROJECT_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="font-ui text-base text-ink/75 hover:text-bronze dark:text-bone/75 dark:hover:text-bronze-light"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <span className="font-ui text-xs font-semibold tracking-[0.08em] text-ink/45 uppercase dark:text-bone/45">
              Legal
            </span>
            <ul className="mt-4 space-y-3">
              {LEGAL_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="font-ui text-base text-ink/75 hover:text-bronze dark:text-bone/75 dark:hover:text-bronze-light"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-6 border-t border-ink/15 pt-8 sm:flex-row sm:items-center sm:justify-between dark:border-white/15">
          <p className="font-ui text-sm text-ink/55 dark:text-bone/55">
            &copy; {year} SilhouFit. A Quezon City University BS Information
            Technology capstone project.
          </p>
          <BackToTop />
        </div>
      </div>
    </footer>
  )
}
