import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'Contact SilhouFit: our contact channels are being set up and will appear here soon. Until then, you can reach the team by email or head back to the main floor.'

export function ContactPage() {
  useDocumentTitle('Contact us, coming soon — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  return (
    <section className="mx-auto max-w-6xl px-6 pt-40 pb-24">
      <p className="font-mono text-xs tracking-[0.2em] text-chrome-strong uppercase sm:text-sm">
        Contact · Coming soon
      </p>
      <h1 className="display mt-4 text-[clamp(2.25rem,6.5vw,5rem)] text-fg">Contact us</h1>
      <p className="mt-6 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
        Our contact channels are being set up. For now, reach the team at{' '}
        <a href="mailto:team@silhoufit.dev" className="tap text-fg underline underline-offset-4 hover:text-chrome-strong">
          team@silhoufit.dev
        </a>
        .
      </p>
      <Link
        to="/"
        className="btn-lift font-ui mt-10 inline-block min-h-11 rounded-full border-2 border-fg bg-fg px-8 py-3 text-sm font-semibold text-canvas hover:border-chrome-strong hover:bg-chrome-strong"
      >
        Back to home
      </Link>
    </section>
  )
}
