import type { ComponentType } from 'react'
import { BagIcon, CartIcon, GridIcon, ListIcon, UserIcon } from '../form/icons'
import type { Area } from '../../utils/staffRole'

export interface NavItem {
  label: string
  /** Items without a route are listed as "Soon" until their page exists. */
  to?: string
  icon: ComponentType<{ size?: 16 | 20; className?: string }>
}

/** What each role's sidebar lists. Add an item here and the sidebar, drawer and top bar pick it up. */
export const NAV: Record<Area, NavItem[]> = {
  staff: [
    { label: 'Dashboard', to: '/staff', icon: GridIcon },
    { label: 'Inventory', icon: BagIcon },
    { label: 'Transactions', icon: ListIcon },
    // Online Orders has no backend module yet.
    { label: 'Online Orders', icon: CartIcon },
    { label: 'Profile', to: '/staff/profile', icon: UserIcon },
  ],
  admin: [
    { label: 'Dashboard', to: '/admin', icon: GridIcon },
    { label: 'Profile', to: '/admin/profile', icon: UserIcon },
  ],
  superadmin: [
    { label: 'Dashboard', to: '/superadmin', icon: GridIcon },
    { label: 'Profile', to: '/superadmin/profile', icon: UserIcon },
  ],
}
