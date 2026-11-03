import { useSyncExternalStore } from 'react'
import { canView, type PageKey } from '../config/pagePermissions'
import type { Me } from '../service/fetchMe'
import { getPermissions, subscribePermissions } from '../service/permissionStore'

/** The page permissions per role, live: a change on the Permissions page reaches every open page and tab. */
export const usePermissions = () => useSyncExternalStore(subscribePermissions, getPermissions)

/** Returns a checker for the given role; a page without a key (nobody can turn it off) is always allowed. */
export function useCanView(role: Me['role']) {
  const permissions = usePermissions()
  return (key: PageKey | null | undefined) => !key || canView(role, key, permissions)
}
