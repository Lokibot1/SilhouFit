import type { ReactNode, Ref } from 'react'
import { Link } from 'react-router-dom'

interface ShopHeaderProps {
  /** Follows the current view: "All pieces", a category, or "Saved pieces". */
  title: string
  summary?: ReactNode
  /** The focus and scroll target after paging or clearing filters. */
  ref?: Ref<HTMLHeadingElement>
}

// Shared by the page and its route fallback so the swap does not shift the layout.
export function ShopHeader({ title, summary, ref }: ShopHeaderProps) {
  return (
    <header className="mx-auto max-w-6xl px-6 pt-20 pb-4">
      <nav aria-label="Breadcrumb">
        <ol className="font-ui flex items-center gap-2 text-sm text-fg-muted">
          <li>
            <Link to="/" className="tap hover:text-fg">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Shop</li>
        </ol>
      </nav>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 ref={ref} tabIndex={-1} className="display scroll-mt-32 text-3xl text-fg sm:text-4xl">
          {title}
        </h1>
        {summary}
      </div>
    </header>
  )
}
