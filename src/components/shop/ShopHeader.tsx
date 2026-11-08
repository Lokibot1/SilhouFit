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
  /** 'kral' sets the header in the KRAL type: mono breadcrumb with // separators, display-font title. */
  tone?: 'kral'
  /** The focus and scroll target after paging or clearing filters. */
  ref?: Ref<HTMLHeadingElement>
}

// Shared by the page and its route fallback so the swap does not shift the layout.
export function ShopHeader({ title, icon, summary, crumb = 'Shop', backToShop = false, compact = false, tone, ref }: ShopHeaderProps) {
  const kral = tone === 'kral'
  return (
    <header className={`mx-auto max-w-6xl px-6 2xl:max-w-[88rem] ${compact ? 'w-full pt-[4.5rem] pb-2 max-lg:pt-16 max-lg:pb-0' : 'pt-20 pb-4'}`}>
      {backToShop && (
        <Link to="/shop" className={`tap relative after:absolute after:-inset-x-1.5 after:-inset-y-3.5 after:content-[''] ${kral ? 'kral-focus font-kral-mono text-base uppercase md:text-xs md:tracking-[0.08em] text-kral-muted hover:text-kral-fg' : 'font-ui text-sm font-medium text-fg-muted hover:text-fg'} mb-2 -ml-1 flex w-fit items-center gap-1 pointer-coarse:min-h-11 ${compact ? 'max-lg:mb-0 max-lg:min-h-11' : ''}`}>
          <ChevronLeftIcon />
          Back to shop
        </Link>
      )}
      <nav aria-label="Breadcrumb" className={compact ? 'max-lg:hidden' : undefined}>
        <ol className={`flex items-center gap-2 ${kral ? 'font-kral-mono text-base uppercase text-kral-muted md:text-xs md:tracking-[0.08em]' : 'font-ui text-sm text-fg-muted'}`}>
          <li>
            <Link to="/" className={`tap relative after:absolute after:-inset-x-1.5 after:-inset-y-3.5 after:content-[''] ${kral ? 'kral-focus hover:text-kral-fg' : 'hover:text-fg'} ${compact ? 'max-lg:flex max-lg:min-h-11 max-lg:min-w-11 max-lg:items-center' : ''}`}>
              Home
            </Link>
          </li>
          <li aria-hidden="true">{kral ? '//' : '/'}</li>
          <li aria-current="page" className={`min-w-0 truncate ${kral ? 'text-kral-fg' : ''}`}>
            {crumb}
          </li>
        </ol>
      </nav>
      <div className={`mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 ${compact ? 'max-lg:mt-0' : ''}`}>
        <h1 ref={ref} tabIndex={-1} className={`${kral ? 'font-kral-display font-extrabold uppercase leading-[1.05] text-kral-fg' : 'display text-fg'} flex min-w-0 scroll-mt-32 items-center gap-3 [overflow-wrap:anywhere] ${
            compact ? `${kral ? 'text-2xl' : 'text-3xl'} max-lg:sr-only` : kral ? 'text-2xl sm:text-4xl lg:text-5xl' : 'text-3xl sm:text-4xl'
          }`}>
          {icon}
          {title}
        </h1>
        {summary}
      </div>
    </header>
  )
}
