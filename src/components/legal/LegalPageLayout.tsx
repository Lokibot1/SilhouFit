import type { ReactNode } from 'react'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

interface LegalPageLayoutProps {
  title: string
  lastUpdated: string
  scopeNote: string
  children: ReactNode
}

export function LegalPageLayout({
  title,
  lastUpdated,
  scopeNote,
  children,
}: LegalPageLayoutProps) {
  useDocumentTitle(`${title} — SilhouFit`)

  return (
    <article className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-bone">
        {title}
      </h1>
      <p className="mt-2 text-sm text-ink/55 dark:text-bone/55">
        Last updated {lastUpdated}
      </p>

      <div className="mt-8 border-l-2 border-ink/15 pl-4 text-sm leading-relaxed text-ink/70 dark:border-white/15 dark:text-bone/75">
        {scopeNote}
      </div>

      <div className="prose-legal mt-10 space-y-8 text-base leading-relaxed text-ink/80 dark:text-bone/80">
        {children}
      </div>
    </article>
  )
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string
  children: ReactNode
}) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-ink dark:text-bone">
        {heading}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}
