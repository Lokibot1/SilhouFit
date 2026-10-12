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
  /** The focus and scroll target after paging or clearing filters. */
  ref?: Ref<HTMLHeadingElement>
}

// Shared by the page and its route fallback so the swap does not shift the layout.
export function ShopHeader({ title, icon, summary, crumb = 'Shop', backToShop = false, ref }: ShopHeaderProps) {
  return (
    <header className="mx-auto max-w-6xl px-6 pt-20 pb-4 2xl:max-w-[88rem]">
      {backToShop && (
        <Link to="/shop" className="tap font-ui mb-2 -ml-1 flex w-fit items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg pointer-coarse:min-h-11">
          <ChevronLeftIcon />
          Back to shop
        </Link>
      )}
      <nav aria-label="Breadcrumb">
        <ol className="font-ui flex items-center gap-2 text-sm text-fg-muted">
          <li>
            <Link to="/" className="tap hover:text-fg">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{crumb}</li>
        </ol>
      </nav>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 ref={ref} tabIndex={-1} className="display flex scroll-mt-32 items-center gap-3 text-3xl text-fg sm:text-4xl">
          {icon}
          {title}
        </h1>
        {summary}
      </div>
    </header>
  )
}
