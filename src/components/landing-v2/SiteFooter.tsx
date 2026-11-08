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
      { label: 'Study in fit', to: { pathname: '/', hash: '#detail' } },
      { label: 'Lookbook', to: { pathname: '/', hash: '#lookbook' } },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'FAQ', to: { pathname: '/', hash: '#faq' } },
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
          <p className="sv2-label sv2-muted sv2-foot-right">
            <span className="sv2-label--tint">[ SYS // VER 2.0 ]</span>
            <span>Photography // Unsplash</span>
          </p>
        </div>

        {/* Required by the CC BY 4.0 licence of the 3D models (moved here from the old storefront footer). */}
        <p className="sv2-label sv2-muted sv2-credit">
          Avatar models:{' '}
          <a href="https://sketchfab.com/3d-models/anatomy-study-20-basemesh-human-male-body-c3f13a4baa2f4ea5a0a88d29e7fa1779">
            &ldquo;Anatomy study 2.0 Basemesh Human Male Body&rdquo; by zeroran
          </a>{' '}
          and{' '}
          <a href="https://sketchfab.com/3d-models/base-female-body-meshy-5f7e670fb878491aa04d34e5e4f0e7c3">
            &ldquo;BASE FEMALE BODY [MESHY]&rdquo; by EthanFromEngland
          </a>
          , licensed under <a href="https://creativecommons.org/licenses/by/4.0/" className="whitespace-nowrap">CC BY 4.0</a>, merged, resized and compressed.
        </p>
      </div>
    </footer>
  )
}
