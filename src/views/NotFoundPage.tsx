import { Link } from 'react-router-dom'
import { TexturedBackdrop } from '../components/TexturedBackdrop'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Page not found — SilhouFit')

  return (
    <div className="relative flex min-h-[60vh] items-center overflow-hidden bg-bone-soft px-6 py-32 dark:bg-ink-soft">
      <TexturedBackdrop image="/images/fabric-texture.jpg" speed={0.05} />
      <div className="glass-solid relative mx-auto max-w-2xl rounded-2xl p-10">
        <span className="font-mono text-sm tabular-nums text-ink/50 dark:text-bone/50">
          404
        </span>
        <h1 className="display mt-3 text-[clamp(2rem,4vw,3rem)] text-ink dark:text-bone">
          This page does not exist.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink/70 dark:text-bone/75">
          The link you followed may be broken, or the page may have moved.
        </p>
        <Link
          to="/"
          className="btn-lift font-ui mt-8 inline-block rounded-full border-2 border-ink bg-ink px-6 py-3 text-sm font-semibold text-bone hover:border-bronze hover:bg-bronze dark:border-bone dark:bg-bone dark:text-ink dark:hover:border-bronze-light dark:hover:bg-bronze-light"
        >
          Back to the homepage
        </Link>
      </div>
    </div>
  )
}
