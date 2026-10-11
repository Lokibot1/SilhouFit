import { lazy, Suspense } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { NearViewport } from './NearViewport'
import { SilhouetteMark } from './landing/SilhouetteMark'

// three.js is fetched for the rack only when the footer renders.
const ClothingRack = lazy(() =>
  import('./ClothingRack').then((m) => ({ default: m.ClothingRack })),
)

// The rack belongs to the landing and about pages only.
const RACK_PATHS = ['/', '/about']

const EXPLORE_LINKS = [
  { label: 'Shop', href: '/shop' },
  { label: 'Wishlist', href: '/wishlist' },
  { label: 'About SilhouFit', href: '/about' },
]

const LEGAL_LINKS = [
  { label: 'Privacy policy', to: '/privacy-policy' },
  { label: 'Terms of service', to: '/terms-of-service' },
  { label: 'Refund policy', to: '/refund-policy' },
  { label: 'Cookie policy', to: '/cookie-policy' },
]

const LINK_CLASS =
  'tap group relative inline-flex text-base text-fg/80 transition-colors duration-200 hover:text-fg'

const LINK_UNDERLINE =
  'pointer-events-none absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-current/50 transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100'

function BackToTop() {
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="tap glass-clear glass-btn btn-lift font-ui flex items-center self-start sm:self-auto gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-fg hover:text-chrome-strong"
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
  const showRack = RACK_PATHS.includes(useLocation().pathname.replace(/\/$/, '') || '/')

  // The rack is the footer's own ground: canvas pinned to the bottom, behind the lower content.
  return (
    <footer className="relative overflow-hidden">
      {showRack && (
        <NearViewport className="absolute inset-x-0 bottom-0 h-[calc(clamp(18rem,52svh,34rem)+14rem)]">
          <Suspense fallback={null}>
            <ClothingRack className="h-full w-full" />
          </Suspense>
        </NearViewport>
      )}

      <div className={`relative mx-auto max-w-6xl px-6 pt-24 ${showRack ? 'pb-[clamp(18rem,52svh,34rem)]' : 'pb-12'}`}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 sm:gap-x-10 sm:gap-y-12 lg:grid-cols-[1.4fr_0.85fr_0.85fr_0.85fr] lg:gap-y-0">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <SilhouetteMark className="h-10 w-8 text-chrome-strong" />
            <span className="display mt-3 block text-[1.75rem] text-fg sm:text-3xl">
              SilhouFit
            </span>
            <p className="mt-3 max-w-[26ch] text-sm leading-relaxed text-fg-muted">
              Omnichannel store platform with browser-based AR fitting and
              retail analytics. A capstone project, not a live storefront.
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1">
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
            <span className="font-ui block text-[11px] font-semibold tracking-[0.14em] text-fg uppercase">
              Explore
            </span>
            <ul className="mt-3 space-y-2.5">
              {EXPLORE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link to={link.href} className={`${LINK_CLASS} font-ui`}>
                    {link.label}
                    <span aria-hidden="true" className={LINK_UNDERLINE} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <span className="font-ui block text-[11px] font-semibold tracking-[0.14em] text-fg uppercase">
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
            {/* Required by the model's CC BY 4.0 licence. */}
            <span className="mt-1 block">
              Hero 3D model:{' '}
              <a
                href="https://sketchfab.com/3d-models/human-body-f022e4a3641943328b2fbfdf0f7c3e1e"
                className="underline hover:text-fg"
              >
                &ldquo;HUMAN_BODY&rdquo; by vistaalienprime
              </a>
              , licensed under{' '}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                className="underline hover:text-fg"
              >
                CC BY 4.0
              </a>
              , recoloured and cropped.
            </span>
          </p>
          <BackToTop />
        </div>
      </div>
    </footer>
  )
}
