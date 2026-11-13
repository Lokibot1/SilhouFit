// Which pages each role can open. A superadmin sets this on the Permissions page and always sees every page.
// Dashboards, profiles and the landing, login and legal pages are not listed: nobody can be locked out of those.

export type PageKey =
  | 'shop'
  | 'wishlist'
  | 'cart'
  | 'checkout'
  | 'body-setup'
  | 'inventory'
  | 'measurements'
  | 'transactions'
  | 'online-orders'
  | 'messages'
  | 'reviews'
  | 'user-management'
  | 'activity-logs'
  | 'ar-insights'
  | 'promotions'
  | 'refunds'
  | 'chatbot'

/** The roles a superadmin can set. A superadmin has no row: every page is always on. */
export type PermissionRole = 'customer' | 'staff' | 'admin'

export const PERMISSION_ROLES: ReadonlyArray<{ role: PermissionRole; label: string; description: string }> = [
  { role: 'customer', label: 'Customer', description: 'Shoppers, and visitors who are not signed in. Access to the storefront and AR fitting.' },
  { role: 'staff', label: 'Staff', description: 'Boutique staff. Access to the operations pages, and to admin tools when you turn them on.' },
  { role: 'admin', label: 'Admin', description: 'Store admins. Access to operations and admin tools, and to user management unless you turn it off.' },
]

export interface PageGroup {
  id: string
  label: string
  /** The roles whose card lists this group. */
  roles: PermissionRole[]
  pages: ReadonlyArray<{ key: PageKey; label: string }>
}

export const PAGE_GROUPS: ReadonlyArray<PageGroup> = [
  {
    id: 'storefront',
    label: 'Storefront',
    roles: ['customer'],
    pages: [
      { key: 'shop', label: 'Shop' },
      { key: 'wishlist', label: 'Wishlist' },
      { key: 'cart', label: 'Cart' },
      { key: 'checkout', label: 'Checkout' },
      { key: 'body-setup', label: 'Body measurements' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    roles: ['staff', 'admin'],
    pages: [
      { key: 'inventory', label: 'Inventory' },
      { key: 'measurements', label: 'Measurements' },
      { key: 'transactions', label: 'Transactions' },
      { key: 'online-orders', label: 'Online Orders' },
      { key: 'messages', label: 'Messages' },
      { key: 'reviews', label: 'Reviews' },
    ],
  },
  {
    id: 'admin-tools',
    label: 'Admin tools',
    roles: ['staff', 'admin'],
    pages: [
      { key: 'user-management', label: 'User Management' },
      { key: 'activity-logs', label: 'Activity Logs' },
      { key: 'ar-insights', label: 'AR Insights' },
      { key: 'promotions', label: 'Pricing & Promotions' },
      { key: 'refunds', label: 'Returns & Refunds' },
      { key: 'chatbot', label: 'Help Chatbot' },
    ],
  },
]

export type Permissions = Record<PermissionRole, PageKey[]>

const keysOf = (...ids: string[]) => PAGE_GROUPS.filter((group) => ids.includes(group.id)).flatMap((group) => group.pages.map((page) => page.key))

export const DEFAULT_PERMISSIONS: Permissions = {
  customer: keysOf('storefront'),
  staff: keysOf('operations'),
  admin: keysOf('operations', 'admin-tools'),
}

const STOREFRONT = new Set<PageKey>(keysOf('storefront'))

const DASHBOARD_PAGE: Record<string, PageKey> = {
  inventory: 'inventory',
  measurements: 'measurements',
  transactions: 'transactions',
  'online-orders': 'online-orders',
  messages: 'messages',
  reviews: 'reviews',
  users: 'user-management',
  'activity-logs': 'activity-logs',
  'ar-insights': 'ar-insights',
  promotions: 'promotions',
  refunds: 'refunds',
  chatbot: 'chatbot',
}

const STOREFRONT_PAGE: Record<string, PageKey> = { shop: 'shop', wishlist: 'wishlist', cart: 'cart', checkout: 'checkout' }

/** The permission a URL falls under, or null for a page nobody can turn off. */
export function pageKeyFor(pathname: string): PageKey | null {
  const [, first, second] = pathname.replace(/\/$/, '').split('/')
  if (first === 'staff' || first === 'admin' || first === 'superadmin') return DASHBOARD_PAGE[second] ?? null
  if (first === 'profile' && second === 'measurements') return 'body-setup'
  return STOREFRONT_PAGE[first] ?? null
}

/** Whether a role may open a page. Signed-out visitors count as customers. Staff and admins are not held to the storefront list, and customers never reach dashboard pages. */
export function canView(role: 'superadmin' | 'admin' | 'staff' | 'customer' | undefined, key: PageKey, permissions: Permissions): boolean {
  if (role === 'superadmin') return true
  if (STOREFRONT.has(key)) return role === 'staff' || role === 'admin' || permissions.customer.includes(key)
  return (role === 'staff' || role === 'admin') && permissions[role].includes(key)
}
