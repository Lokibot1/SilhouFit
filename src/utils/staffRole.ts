import type { Me } from '../service/fetchMe'

type Role = Me['role']

/** The sidebar areas, one per role. Each opens only for its own role. */
export type Area = 'staff' | 'admin' | 'superadmin'

const AREAS: ReadonlyArray<Role> = ['staff', 'admin', 'superadmin']

/** Roles that have a dashboard. A missing role (older API response) counts as a customer. */
export const isStaffRole = (role?: Role) => AREAS.includes(role)

/** Where a signed-in user lands by default: their own dashboard, or the profile for customers. */
export const homeFor = (role?: Role) => (isStaffRole(role) ? `/${role}` : '/profile')
