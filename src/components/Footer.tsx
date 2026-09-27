import { Link } from 'react-router-dom'

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

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-ink/15 bg-bone dark:border-white/15 dark:bg-ink">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 sm:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <span className="font-display text-lg font-semibold text-ink dark:text-bone">
              SilhouFit
            </span>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink/60 dark:text-bone/60">
              Omnichannel store platform with browser-based AR fitting and
              retail analytics. A capstone project, not a live storefront.
            </p>
          </div>

          <div>
            <span className="text-sm font-semibold text-ink dark:text-bone">
              Project
            </span>
            <ul className="mt-4 space-y-3">
              {PROJECT_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-ink/70 hover:text-garnet dark:text-bone/70 dark:hover:text-garnet-light"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <span className="text-sm font-semibold text-ink dark:text-bone">
              Legal
            </span>
            <ul className="mt-4 space-y-3">
              {LEGAL_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-ink/70 hover:text-garnet dark:text-bone/70 dark:hover:text-garnet-light"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-2 border-t border-ink/15 pt-8 text-sm text-ink/55 sm:flex-row sm:items-center sm:justify-between dark:border-white/15 dark:text-bone/55">
          <p>
            &copy; {year} SilhouFit. A Quezon City University BS Information
            Technology capstone project.
          </p>
          <a
            href="mailto:team@silhoufit.dev"
            className="hover:text-garnet dark:hover:text-garnet-light"
          >
            team@silhoufit.dev
          </a>
        </div>
      </div>
    </footer>
  )
}
