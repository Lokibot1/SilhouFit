import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Page not found — SilhouFit')

  return (
    <div className="relative flex min-h-[60vh] items-center px-6 py-32">
      <div className="glass-solid relative mx-auto max-w-2xl rounded-2xl p-10">
        <span className="font-mono text-sm tabular-nums text-fg-muted">
          404
        </span>
        <h1 className="display mt-3 text-[clamp(2rem,4vw,3rem)] text-fg">
          This page does not exist.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-fg-muted">
          The link you followed may be broken, or the page may have moved.
        </p>
        <Link
          to="/"
          className="btn-lift font-ui mt-8 inline-block rounded-full border-2 border-fg bg-fg px-6 py-3 text-sm font-semibold text-canvas hover:border-chrome-strong hover:bg-chrome-strong"
        >
          Back to the homepage
        </Link>
      </div>
    </div>
  )
}
