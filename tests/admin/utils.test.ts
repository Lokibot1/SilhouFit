import { describe, expect, it } from 'vitest'
import { MOCK_CUSTOMERS, MOCK_STAFF } from '../../src/data/mockAccounts'
import { queryAccounts } from '../../src/utils/accountQuery'
import { normalizeAccountPhone, sanitizeAccountName, validateAccountForm, validateAccountPhone } from '../../src/utils/accountValidation'
import { wrapText } from '../../src/utils/credentialsImage'
import { canSkipPasswordChange, passwordGateSkipKey } from '../../src/config/accountPolicy'
import { signOut } from '../../src/service/signOut'
import { formatCredentials } from '../../src/service/credentials'

describe('accountQuery', () => {
  it('searches names, usernames, emails and phone digits', () => {
    expect(queryAccounts(MOCK_STAFF, { search: 'SAM.reyes' }).data.map((a) => a.username)).toEqual(['sam.reyes'])
    expect(queryAccounts(MOCK_STAFF, { search: 'liza' }).meta.total).toBe(1)
    const phone = MOCK_STAFF[0].phone
    expect(queryAccounts(MOCK_STAFF, { search: `${phone.slice(0, 6)} ${phone.slice(6)}` }).data[0].id).toBe(MOCK_STAFF[0].id)
  })

  it('matches phone digits only for phone-like queries, never for an email or a name', () => {
    const customer = MOCK_CUSTOMERS[0]
    const email = queryAccounts(MOCK_CUSTOMERS, { search: 'paolo.torres8@example.com', limit: 50 })
    expect(email.data.map((c) => c.email)).toEqual(['paolo.torres8@example.com'])
    expect(queryAccounts(MOCK_CUSTOMERS, { search: 'a8', limit: 50 }).data.every((c) => /a8/i.test(`${c.firstName} ${c.lastName} ${c.email}`))).toBe(true)
    expect(queryAccounts(MOCK_CUSTOMERS, { search: `(${customer.phone.replace(/\D/g, '').slice(-7)})` }).data.map((c) => c.id)).toContain(customer.id)
  })

  it('filters by status and pages with totals', () => {
    expect(queryAccounts(MOCK_STAFF, { status: 'archived' }).data.every((a) => a.status === 'archived')).toBe(true)
    const page = queryAccounts(MOCK_CUSTOMERS, { page: 3, limit: 10 })
    expect(page.data).toHaveLength(5)
    expect(page.meta).toEqual({ total: 25, page: 3, limit: 10, totalPages: 3 })
  })

  it('sorts by a number or a name, both ways, keeping ties in list order', () => {
    const spend = MOCK_CUSTOMERS.map((c, n) => ({ ...c, lifetimeSpend: n % 3 }))
    const desc = queryAccounts(spend, { sort: 'lifetimeSpend', dir: 'desc', limit: 25 }).data.map((c) => c.lifetimeSpend)
    expect(desc).toEqual([...desc].sort((a, b) => b - a))
    const names = queryAccounts(MOCK_CUSTOMERS, { sort: 'name', limit: 25 }).data.map((c) => c.lastName)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})

describe('accountValidation', () => {
  it('keeps letters in names and drops digits, symbols and emoji', () => {
    expect(sanitizeAccountName('Ma5ria😀 Sa_ntos')).toBe('Maria Santos')
  })

  it('requires both names and limits each word', () => {
    expect(validateAccountForm({ firstName: '', lastName: '', phone: '' })).toEqual({ firstName: 'First name is required.', lastName: 'Last name is required.' })
    expect(validateAccountForm({ firstName: 'A'.repeat(21), lastName: 'Santos', phone: '' }).firstName).toMatch(/at most 20/)
  })

  it('accepts a forgiving phone and normalizes it, and rejects letters and long numbers', () => {
    expect(validateAccountPhone('')).toBeNull()
    expect(validateAccountPhone('+63 (917) 123-4567')).toBeNull()
    expect(normalizeAccountPhone('+63 (917) 123-4567')).toBe('+639171234567')
    expect(normalizeAccountPhone('0917 123 4567')).toBe('09171234567')
    expect(validateAccountPhone('0917abc4567')).toMatch(/numbers/)
    expect(validateAccountPhone('09+171234567')).toMatch(/numbers/)
    expect(validateAccountPhone('123')).toMatch(/at least 7/)
    expect(validateAccountPhone('+63 917 123 45678')).toMatch(/at most 13/)
  })
})

describe('credentials card', () => {
  it('wraps words, and breaks a word that is wider than a line', () => {
    const measure = (text: string) => text.length * 10
    expect(wrapText(measure, 'aaa bbb ccc', 70)).toEqual(['aaa bbb', 'ccc'])
    expect(wrapText(measure, 'abcdefghij', 40)).toEqual(['abcd', 'efgh', 'ij'])
    expect(wrapText(measure, '', 40)).toEqual([])
  })

  it('formats the plain text copy', () => {
    expect(formatCredentials({ username: 'a.b', email: 'a.b@silhoufit.dev', password: 'Pw' })).toBe('Username: a.b\nSign-in email: a.b@silhoufit.dev\nTemporary password: Pw')
  })
})

describe('sign-out', () => {
  it('clears the skipped first-login screen flag so it returns at the next sign-in', () => {
    sessionStorage.setItem(passwordGateSkipKey('adm-001'), '1')
    sessionStorage.setItem('other', 'keep')
    signOut()
    expect(sessionStorage.getItem(passwordGateSkipKey('adm-001'))).toBeNull()
    expect(sessionStorage.getItem('other')).toBe('keep')
  })
})

describe('password change policy', () => {
  it('allows skipping unless the backend says the account cannot', () => {
    expect(canSkipPasswordChange({ mustChangePassword: true })).toBe(true)
    expect(canSkipPasswordChange({ mustChangePassword: true, passwordChangeSkippable: false })).toBe(false)
  })
})
