import type { ReactNode, Ref } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeftIcon } from '../form/icons'

interface ShopHeaderProps {
  /** Follows the current view: "All pieces" or a category. */
  title: string
  /** Shown before the title. */
  icon?: ReactNode
  summary?: ReactNode
  /** The last breadcrumb: the page this header belongs to. */
  crumb?: string
  /** A link back to the shop above the breadcrumb, for the pages reached from it (cart, wishlist). */
  backToShop?: boolean
  /** Tighter top padding and title for pages that must fit one screen (product page). */
  compact?: boolean
  /** The focus and scroll target after paging or clearing filters. */
  ref?: Ref<HTMLHeadingElement>
}

// Shared by the page and its route fallback so the swap does not shift the layout.
export function ShopHeader({ title, icon, summary, crumb = 'Shop', backToShop = false, compact = false, ref }: ShopHeaderProps) {
  return (
    <header className={`mx-auto max-w-6xl px-6 2xl:max-w-[88rem] ${compact ? 'w-full pt-[4.5rem] pb-2 max-lg:pt-16 max-lg:pb-0' : 'pt-20 pb-4'}`}>
      {backToShop && (
        <Link to="/shop" className={`tap relative after:absolute after:-inset-x-1.5 after:-inset-y-3.5 after:content-[''] font-ui mb-2 -ml-1 flex w-fit items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg pointer-coarse:min-h-11 ${compact ? 'max-lg:mb-0 max-lg:min-h-11' : ''}`}>
          <ChevronLeftIcon />
          Back to shop
        </Link>
      )}
      <nav aria-label="Breadcrumb" className={compact ? 'max-lg:hidden' : undefined}>
        <ol className="font-ui flex items-center gap-2 text-sm text-fg-muted">
          <li>
            <Link to="/" className={`tap relative after:absolute after:-inset-x-1.5 after:-inset-y-3.5 after:content-[''] hover:text-fg ${compact ? 'max-lg:flex max-lg:min-h-11 max-lg:min-w-11 max-lg:items-center' : ''}`}>
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="min-w-0 truncate">
            {crumb}
          </li>
        </ol>
      </nav>
      <div className={`mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 ${compact ? 'max-lg:mt-0' : ''}`}>
        <h1 ref={ref} tabIndex={-1} className={`display flex min-w-0 scroll-mt-32 items-center gap-3 [overflow-wrap:anywhere] ${compact ? 'text-3xl max-lg:sr-only' : 'text-3xl sm:text-4xl'} text-fg`}>
          {icon}
          {title}
        </h1>
        {summary}
      </div>
    </header>
  )
}
