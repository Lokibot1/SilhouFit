// The saved accounts, kept in localStorage so a reload and other tabs agree. Stands in for the accounts tables until the backend has them.
// Passwords are plain text here on purpose (demo only, never a real password), and live apart from the accounts so no list can leak one.
import { MOCK_ADMINS, MOCK_CUSTOMERS, MOCK_PASSWORDS, MOCK_STAFF } from '../data/mockAccounts'
import type { ActivityEntry, AdminAccount, Customer, StaffAccount } from '../types/accounts'

export const ACCOUNTS_KEY = 'silhoufit.accounts.v1'

export interface AccountsState {
  customers: Customer[]
  staff: StaffAccount[]
  admins: AdminAccount[]
  /** Account id to password. */
  passwords: Record<string, string>
  /** Newest first. */
  activity: ActivityEntry[]
}

export const MAX_ACTIVITY = 20

const seed = (): AccountsState =>
  structuredClone({ customers: MOCK_CUSTOMERS, staff: MOCK_STAFF, admins: MOCK_ADMINS, passwords: MOCK_PASSWORDS, activity: [] })

const isList = (value: unknown, role: string) =>
  Array.isArray(value) && value.every((item) => (item as { role?: string } | null)?.role === role && typeof (item as { id?: unknown }).id === 'string')

function load(): AccountsState {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? 'null') as Partial<AccountsState> | null
    if (
      parsed &&
      isList(parsed.customers, 'customer') &&
      isList(parsed.staff, 'staff') &&
      isList(parsed.admins, 'admin') &&
      parsed.admins!.length > 0 &&
      parsed.passwords &&
      typeof parsed.passwords === 'object' &&
      Array.isArray(parsed.activity)
    ) {
      // Activity saved before entries had a kind cannot be drawn.
      return { ...parsed, activity: parsed.activity!.filter((entry) => entry?.kind) } as AccountsState
    }
  } catch {
    // Unreadable or blocked storage: start again from the sample accounts.
  }
  return seed()
}

let state = load()
const listeners = new Set<() => void>()

function persist() {
  // Storage can be blocked or full, so the accounts then live for this tab only.
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(state))
  } catch {
    // Keep the in-memory accounts.
  }
}
persist()

// Another tab changed the accounts.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== ACCOUNTS_KEY && event.key !== null) return
    state = load()
    listeners.forEach((listener) => listener())
  })
}

export const getAccounts = () => state

/** Applies a change to a copy of the accounts, saves it and tells subscribers. A change that throws leaves the accounts as they were. */
export function updateAccounts(change: (draft: AccountsState) => void) {
  const draft = structuredClone(state)
  change(draft)
  state = draft
  persist()
  listeners.forEach((listener) => listener())
}

export function subscribeAccounts(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Back to the sample accounts. */
export function resetAccounts() {
  state = seed()
  persist()
  listeners.forEach((listener) => listener())
}

/** Re-reads storage, for a test that wrote it by hand. Unreadable storage falls back to the sample accounts. */
export function reloadAccounts() {
  state = load()
  persist()
  listeners.forEach((listener) => listener())
}
