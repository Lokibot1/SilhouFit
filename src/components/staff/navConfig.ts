import type { ComponentType } from 'react'
import { BagIcon, CartIcon, ClockIcon, GridIcon, ListIcon, RulerIcon, UserIcon, UsersIcon } from '../form/icons'
import type { Area } from '../../utils/staffRole'

export interface NavItem {
  label: string
  /** Items without a route are listed as "Soon" until their page exists. */
  to?: string
  icon: ComponentType<{ size?: 16 | 20; className?: string }>
  /** Only in lists that are grouped: the sidebar draws a heading where the group changes. */
  group?: NavGroup
}

export type NavGroup = 'operations' | 'admin'

export const NAV_GROUP_LABEL: Record<NavGroup, string> = { operations: 'Operations', admin: 'Admin tools' }

/** What each role's sidebar lists. Add an item here and the sidebar, drawer and top bar pick it up. */
export const NAV: Record<Area, NavItem[]> = {
  staff: [
    { label: 'Dashboard', to: '/staff', icon: GridIcon },
    { label: 'Inventory', to: '/staff/inventory', icon: BagIcon },
    { label: 'Measurements', to: '/staff/measurements', icon: RulerIcon },
    { label: 'Transactions', to: '/staff/transactions', icon: ListIcon },
    { label: 'Online Orders', to: '/staff/online-orders', icon: CartIcon },
    { label: 'Profile', to: '/staff/profile', icon: UserIcon },
  ],
  // An admin gets every staff page plus the admin tools.
  admin: [
    { label: 'Dashboard', to: '/admin', icon: GridIcon, group: 'operations' },
    { label: 'Inventory', to: '/admin/inventory', icon: BagIcon, group: 'operations' },
    { label: 'Measurements', to: '/admin/measurements', icon: RulerIcon, group: 'operations' },
    { label: 'Transactions', to: '/admin/transactions', icon: ListIcon, group: 'operations' },
    { label: 'Online Orders', to: '/admin/online-orders', icon: CartIcon, group: 'operations' },
    { label: 'Profile', to: '/admin/profile', icon: UserIcon, group: 'operations' },
    { label: 'User Management', to: '/admin/users', icon: UsersIcon, group: 'admin' },
    { label: 'Activity Logs', to: '/admin/activity-logs', icon: ClockIcon, group: 'admin' },
  ],
  superadmin: [
    { label: 'Dashboard', to: '/superadmin', icon: GridIcon },
    { label: 'Profile', to: '/superadmin/profile', icon: UserIcon },
  ],
}
