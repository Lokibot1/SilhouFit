import { Link, type To } from 'react-router-dom'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { SocialIcon, type SocialName } from './SocialIcons'
import { WORDMARK } from './wordmark'

type FooterLink = { label: string; to: To }

const SIGNED_OUT_ONLY: FooterLink[] = [
  { label: 'Login', to: '/login' },
  { label: 'Sign up', to: '/signup' },
]

const PAGES: FooterLink[] = [
  { label: 'Shop', to: '/shop' },
  { label: 'About', to: '/about' },
  { label: 'Contact us', to: '/contact' },
]

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
]

const SOCIALS: { name: SocialName; href: string }[] = [
  { name: 'Facebook', href: 'https://www.facebook.com/share/1E2aLE2NCR/' },
  { name: 'Shopee', href: 'https://ph.shp.ee/v9ZZMB9C' },
  { name: 'TikTok', href: 'https://www.tiktok.com/@kralzurcstuff?_r=1&_t=ZS-9BEh1UUUEXE' },
  { name: 'Instagram', href: 'https://www.instagram.com/kralzurcstuff?mdxt=MWNrdTFkbGF2N3JjNw==' },
  { name: 'Lazada', href: 'https://s.lazada.com.ph/s.ZqNO6c' },
]

export function SiteFooter() {
  const signedIn = useCurrentUser() !== null
  const columns = [...COLUMNS, { title: 'Pages', links: signedIn ? PAGES : [...PAGES, ...SIGNED_OUT_ONLY] }]
  return (
    <footer className="sv2-footer">
      <div className="sv2-wrap">
        <div className="sv2-top">
          <nav aria-label="Footer" className="sv2-cols">
            {columns.map((col) => (
              <div key={col.title}>
                <h2 className="sv2-label sv2-label--tint">({col.title})</h2>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.label}><Link to={l.to}><span className="sv2-link-text">{l.label}</span></Link></li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="sv2-social">
              <h2 className="sv2-label sv2-label--tint">(Social)</h2>
              <ul>
                {SOCIALS.map((s) => (
                  <li key={s.name}>
                    <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={`KRAL on ${s.name} (opens in a new tab)`}>
                      <SocialIcon name={s.name} />
                      <span className="sv2-link-text">{s.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
          <p className="sv2-label sv2-muted sv2-tagline">
            Made to Represent //
            <br />
            Mark of Identity®
          </p>
        </div>

        <svg
          className="sv2-foot-mark"
          viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
          preserveAspectRatio="none"
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
