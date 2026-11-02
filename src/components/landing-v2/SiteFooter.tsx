import { Link, type To } from 'react-router-dom'
import { WORDMARK } from './wordmark'

type FooterLink = { label: string; to: To } | { label: string; href: string }

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Legal',
    links: [
      { label: 'Privacy policy', to: '/privacy-policy' },
      { label: 'Terms of service', to: '/terms-of-service' },
      { label: 'Refund policy', to: '/refund-policy' },
      { label: 'Cookie policy', to: '/cookie-policy' },
    ],
  },
  {
    title: 'Shop',
    links: [
      { label: 'Catalogue', to: '/shop' },
      { label: 'Wishlist', to: '/wishlist' },
      { label: 'Cart', to: '/cart' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', to: '/login' },
      { label: 'Create account', to: '/signup' },
      { label: 'Body measurements', to: '/profile/measurements' },
    ],
  },
  {
    title: 'Studio',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Study in fit', to: { hash: '#detail' } },
      { label: 'Lookbook', to: { hash: '#lookbook' } },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'FAQ', to: { hash: '#faq' } },
      { label: 'Email the team', href: 'mailto:team@silhoufit.dev' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="sv2-footer">
      <div className="sv2-wrap">
        <nav aria-label="Footer" className="sv2-cols">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="sv2-label sv2-label--tint">({col.title})</h2>
              <ul>
                {col.links.map((l) => (
                  <li key={l.label}>{'href' in l ? <a href={l.href}>{l.label}</a> : <Link to={l.to}>{l.label}</Link>}</li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <svg
          className="sv2-foot-mark"
          viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
          role="img"
          aria-label="KRAL"
        >
          <path fillRule="evenodd" d={WORDMARK.letters.map((l) => l.d).join('')} />
        </svg>

        <div className="sv2-foot-meta">
          <p className="sv2-label sv2-muted">
            KRAL® // BSIT CAPSTONE PROJECT // © {new Date().getFullYear()}
          </p>
          <p className="sv2-label sv2-muted">[ SYS // VER 2.0 ]</p>
        </div>
        <p className="sv2-label sv2-muted sv2-credit">Photography: Unsplash.</p>
      </div>
    </footer>
  )
}
