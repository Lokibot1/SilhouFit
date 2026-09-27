import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Page not found — SilhouFit')

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start px-6 py-32">
      <span className="font-mono text-sm tabular-nums text-ink/50 dark:text-bone/50">
        404
      </span>
      <h1 className="font-display mt-3 text-3xl font-semibold text-ink dark:text-bone">
        This page does not exist.
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink/70 dark:text-bone/75">
        The link you followed may be broken, or the page may have moved.
      </p>
      <Link
        to="/"
        className="mt-8 rounded-sm border-2 border-ink bg-ink px-6 py-3 text-sm font-semibold text-bone hover:border-garnet hover:bg-garnet dark:border-bone dark:bg-bone dark:text-ink dark:hover:border-garnet-light dark:hover:bg-garnet-light"
      >
        Back to the homepage
      </Link>
    </div>
  )
}
