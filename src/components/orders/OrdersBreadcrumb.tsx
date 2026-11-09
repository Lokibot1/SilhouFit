import { Link } from 'react-router-dom'

const LINK = "tap kral-focus relative hover:text-kral-fg after:absolute after:-inset-x-1.5 after:-inset-y-4 after:content-['']"

/** Home // Account // Orders, and one more crumb on an order's own page. The last crumb is the current page. */
export function OrdersBreadcrumb({ current, orders = false }: { current: string; /** The current page is inside Orders, so Orders links back. */ orders?: boolean }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="font-kral-mono flex flex-wrap items-center gap-x-2 text-base text-kral-muted uppercase md:text-xs md:tracking-[0.08em]">
        <li>
          <Link to="/" className={LINK}>
            Home
          </Link>
        </li>
        <li aria-hidden="true">//</li>
        <li>
          <Link to="/profile" className={LINK}>
            Account
          </Link>
        </li>
        <li aria-hidden="true">//</li>
        {orders && (
          <>
            <li>
              <Link to="/orders" className={LINK}>
                Orders
              </Link>
            </li>
            <li aria-hidden="true">//</li>
          </>
        )}
        <li aria-current="page" className="min-w-0 truncate text-kral-fg">
          {current}
        </li>
      </ol>
    </nav>
  )
}
