import type { AccountStatus, AdminAccount, Customer, StaffAccount, SuperadminAccount } from '../types/accounts'

export type AccountSort = 'name' | 'status' | 'createdAt' | 'lastSignInAt' | 'orderCount' | 'lifetimeSpend'
export type AccountDir = 'asc' | 'desc'

export const ACCOUNT_PER_PAGE = 10
export const ACCOUNT_PER_PAGE_OPTIONS = [10, 25, 50]
export const MAX_ACCOUNT_SEARCH = 60

export interface AccountQuery {
  search?: string
  status?: AccountStatus
  sort?: AccountSort
  dir?: AccountDir
  page?: number
  limit?: number
}

export interface AccountPage<T> {
  data: T[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

type Account = Customer | StaffAccount | AdminAccount | SuperadminAccount

/** First, middle, last and suffix, the order the backend builds its own fullName in; a missing middle name or suffix is left out. */
export const fullName = (account: Pick<Account, 'firstName' | 'lastName'> & { middleName?: string; suffix?: string }) =>
  [account.firstName, account.middleName, account.lastName, account.suffix].filter(Boolean).join(' ')

/** "jOHN o'neil-SMITH" -> "John O'Neil-Smith": each word starts with a capital, the rest is lower case. Display only; the stored name is untouched. */
export const titleCase = (text: string) => text.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase())

function sortValue(account: Account, key: AccountSort): string | number {
  if (key === 'name') return `${account.lastName} ${account.firstName}`.toLowerCase()
  const value = (account as unknown as Record<string, string | number | null | undefined>)[key]
  return value ?? ''
}

/** Search, filter, sort and page a list. Search matches the name, username, email and phone, ignoring case and spacing in the phone. */
export function queryAccounts<T extends Account>(items: T[], { search, status, sort = 'name', dir = 'asc', page = 1, limit = ACCOUNT_PER_PAGE }: AccountQuery): AccountPage<T> {
  const needle = search?.trim().toLowerCase()
  // Phone matching only for phone-like queries (digits, +, spaces, dashes, parentheses; at least 3 digits), never for names or emails.
  const digits = needle && /^[\d+\s\-()]+$/.test(needle) ? needle.replace(/\D/g, '') : ''
  const phoneLike = digits.length >= 3
  const matched = items
    .filter((account) => !status || account.status === status)
    .filter((account) => {
      if (!needle) return true
      const username = 'username' in account ? account.username : ''
      const text = `${fullName(account)} ${username} ${account.email}`.toLowerCase()
      return text.includes(needle) || (phoneLike && account.phone.replace(/\D/g, '').includes(digits))
    })
    .map((account, index) => ({ account, index }))
    .sort((a, b) => {
      const x = sortValue(a.account, sort)
      const y = sortValue(b.account, sort)
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return (dir === 'asc' ? 1 : -1) * order || a.index - b.index
    })
    .map(({ account }) => account)
  const totalPages = Math.ceil(matched.length / limit)
  return { data: matched.slice((page - 1) * limit, page * limit), meta: { total: matched.length, page, limit, totalPages } }
}
