import type { ComponentType } from 'react'
import { ArIcon, BagIcon, BanknoteIcon, CartIcon, ClockIcon, GridIcon, ListIcon, LockIcon, MessageIcon, RestoreIcon, RulerIcon, UserIcon, UsersIcon } from '../form/icons'
import type { PageKey } from '../../config/pagePermissions'
import type { Area } from '../../utils/staffRole'

export interface NavItem {
  label: string
  /** Items without a route are listed as "Soon" until their page exists. */
  to?: string
  icon: ComponentType<{ size?: 16 | 20; className?: string }>
  /** Only in lists that are grouped: the sidebar draws a heading where the group changes. */
  group?: NavGroup
  /** The permission that shows or hides this item (see pagePermissions). Items without one are always listed. */
  page?: PageKey
}

export type NavGroup = 'operations' | 'admin' | 'superadmin'

export const NAV_GROUP_LABEL: Record<NavGroup, string> = { operations: 'Operations', admin: 'Admin tools', superadmin: 'Super admin tools' }

// An admin gets every staff page plus the admin tools.
const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', to: '/admin', icon: GridIcon, group: 'operations' },
  { label: 'Inventory', to: '/admin/inventory', icon: BagIcon, group: 'operations', page: 'inventory' },
  { label: 'Measurements', to: '/admin/measurements', icon: RulerIcon, group: 'operations', page: 'measurements' },
  { label: 'Transactions', to: '/admin/transactions', icon: ListIcon, group: 'operations', page: 'transactions' },
  { label: 'Online Orders', to: '/admin/online-orders', icon: CartIcon, group: 'operations', page: 'online-orders' },
  { label: 'Messages', to: '/admin/messages', icon: MessageIcon, group: 'operations', page: 'messages' },
  { label: 'User Management', to: '/admin/users', icon: UsersIcon, group: 'admin', page: 'user-management' },
  { label: 'Activity Logs', to: '/admin/activity-logs', icon: ClockIcon, group: 'admin', page: 'activity-logs' },
  { label: 'AR Insights', to: '/admin/ar-insights', icon: ArIcon, group: 'admin', page: 'ar-insights' },
  { label: 'Pricing & Promotions', to: '/admin/promotions', icon: BanknoteIcon, group: 'admin', page: 'promotions' },
  { label: 'Returns & Refunds', to: '/admin/refunds', icon: RestoreIcon, group: 'admin', page: 'refunds' },
]

/** What each role's sidebar lists. Add an item here and the sidebar, drawer and top bar pick it up. */
export const NAV: Record<Area, NavItem[]> = {
  staff: [
    { label: 'Dashboard', to: '/staff', icon: GridIcon },
    { label: 'Inventory', to: '/staff/inventory', icon: BagIcon, page: 'inventory' },
    { label: 'Measurements', to: '/staff/measurements', icon: RulerIcon, page: 'measurements' },
    { label: 'Transactions', to: '/staff/transactions', icon: ListIcon, page: 'transactions' },
    { label: 'Online Orders', to: '/staff/online-orders', icon: CartIcon, page: 'online-orders' },
    { label: 'Messages', to: '/staff/messages', icon: MessageIcon, page: 'messages' },
    // Admin tools a superadmin turned on for staff. They open under /admin and stay hidden until then.
    ...ADMIN_NAV.filter((item) => item.group === 'admin').map((item) => ({ ...item, group: undefined })),
    { label: 'Profile', to: '/staff/profile', icon: UserIcon },
  ],
  admin: ADMIN_NAV,
  // A superadmin gets every admin page, plus the tools only a superadmin has.
  superadmin: [
    ...ADMIN_NAV.map((item) => ({ ...item, to: item.to?.replace('/admin', '/superadmin') })),
    { label: 'Permissions', to: '/superadmin/permissions', icon: LockIcon, group: 'superadmin' },
    { label: 'Profile', to: '/superadmin/profile', icon: UserIcon },
  ],
}
