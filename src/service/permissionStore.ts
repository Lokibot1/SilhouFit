// The page permissions per role, kept in localStorage like the saved accounts. Stands in for the permissions API until the backend has it.
import { DEFAULT_PERMISSIONS, PERMISSION_ROLES, type PageKey, type PermissionRole, type Permissions } from '../config/pagePermissions'

export const PERMISSIONS_KEY = 'silhoufit.permissions.v1'

const ALL_KEYS = new Set<string>(Object.values(DEFAULT_PERMISSIONS).flat())

function load(): Permissions {
  try {
    const parsed = JSON.parse(localStorage.getItem(PERMISSIONS_KEY) ?? 'null') as Partial<Record<PermissionRole, unknown>> | null
    // Keys that no longer exist are dropped; a role with no saved list keeps its default.
    return Object.fromEntries(
      PERMISSION_ROLES.map(({ role }) => {
        const saved = parsed?.[role]
        return [role, Array.isArray(saved) ? saved.filter((key): key is PageKey => ALL_KEYS.has(key)) : [...DEFAULT_PERMISSIONS[role]]]
      }),
    ) as Permissions
  } catch {
    return structuredClone(DEFAULT_PERMISSIONS)
  }
}

let state = load()
const listeners = new Set<() => void>()

function commit(next: Permissions) {
  state = next
  // Storage can be blocked or full, so the permissions then live for this tab only.
  try {
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(state))
  } catch {
    // Keep the in-memory permissions.
  }
  listeners.forEach((listener) => listener())
}

// Another tab changed the permissions.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== PERMISSIONS_KEY && event.key !== null) return
    state = load()
    listeners.forEach((listener) => listener())
  })
}

export const getPermissions = () => state

export function subscribePermissions(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Saves the pages one role can open. REPLACE: PUT /superadmin/permissions/:role  { pages } */
export function setRolePermissions(role: PermissionRole, pages: PageKey[]) {
  commit({ ...state, [role]: [...pages] })
}

/** Back to the defaults. */
export function resetPermissions() {
  commit(structuredClone(DEFAULT_PERMISSIONS))
}
