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
    <div className="relative pt-32 pb-16">
      <article className="glass-solid relative mx-auto max-w-2xl rounded-2xl px-6 py-14 sm:px-12">
        <h1 className="display text-[clamp(2rem,4vw,3rem)] text-fg">
          {title}
        </h1>
        <p className="font-ui mt-2 text-sm text-fg-muted">
          Last updated {lastUpdated}
        </p>

        <div className="mt-8 border-l-2 border-chrome/40 pl-4 text-sm leading-relaxed text-fg-muted">
          {scopeNote}
        </div>

        <div className="mt-10 space-y-8 text-base leading-relaxed text-fg-muted">
          {children}
        </div>
      </article>
    </div>
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
      <h2 className="display text-2xl text-fg">
        {heading}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}
