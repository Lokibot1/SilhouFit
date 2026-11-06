import { describe, expect, it } from 'vitest'
import { MOCK_CUSTOMERS, MOCK_STAFF } from '../../src/data/mockAccounts'
import { fullName, queryAccounts } from '../../src/utils/accountQuery'
import { latestBirthday, sanitizeAccountEmail, sanitizeAccountName, sanitizeAccountSuffix, validateAccountForm } from '../../src/utils/accountValidation'
import { LIMITS } from '../../src/utils/signUpValidation'

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

  it('keeps emoji and spaces out of the email', () => {
    expect(sanitizeAccountEmail(' sam 😀@Example.com ')).toBe('sam@Example.com')
  })

  const FORM = { firstName: 'Sam', middleName: '', lastName: 'Santos', suffix: '', email: 'sam@example.com', birthday: '', gender: '' } as const

  it('requires both names and a valid email, and limits each word', () => {
    expect(validateAccountForm({ ...FORM, firstName: '', lastName: '' })).toEqual({ firstName: 'First name is required.', lastName: 'Last name is required.' })
    expect(validateAccountForm({ ...FORM, email: '' }).email).toBe('Email is required.')
    expect(validateAccountForm({ ...FORM, email: 'not-an-email' }).email).toMatch(/valid email/)
    expect(validateAccountForm({ ...FORM, firstName: 'A'.repeat(41) }).firstName).toMatch(/at most/)
    expect(validateAccountForm(FORM)).toEqual({})
  })

  it('treats middle name, suffix, birthday and gender as optional, within the backend limits (names 100, suffix 20)', () => {
    expect(validateAccountForm({ ...FORM, middleName: 'de la Cruz', suffix: 'Jr.', birthday: '1998-04-23', gender: 'other' })).toEqual({})
    expect(validateAccountForm({ ...FORM, middleName: 'Ma5ria' }).middleName).toMatch(/only contain letters/)
    expect(validateAccountForm({ ...FORM, middleName: 'A'.repeat(41) }).middleName).toMatch(/at most/)
    expect(validateAccountForm({ ...FORM, suffix: 'J1' }).suffix).toMatch(/letters and periods/)
    expect(validateAccountForm({ ...FORM, suffix: 'Junior' }).suffix).toMatch(/at most/)
    expect(LIMITS.nameMaxLength).toBeLessThanOrEqual(100)
    expect(LIMITS.suffixMaxLength).toBeLessThanOrEqual(20)
  })

  it('accepts only a past birthday: not today, not the future, not a day that does not exist', () => {
    const now = new Date(2026, 10, 6)
    expect(latestBirthday(now)).toBe('2026-11-05')
    expect(latestBirthday(new Date(2026, 0, 1))).toBe('2025-12-31')
    const day = new Date()
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(validateAccountForm({ ...FORM, birthday: iso(day) }).birthday).toMatch(/past date/)
    expect(validateAccountForm({ ...FORM, birthday: '2999-01-01' }).birthday).toMatch(/past date/)
    expect(validateAccountForm({ ...FORM, birthday: iso(new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1)) })).toEqual({})
    expect(validateAccountForm({ ...FORM, birthday: '1998-02-31' }).birthday).toMatch(/valid date/)
  })

  it('keeps emoji out of the suffix', () => {
    expect(sanitizeAccountSuffix('Jr.😀')).toBe('Jr.')
  })
})

describe('fullName', () => {
  it('joins first, middle, last and suffix like the backend, leaving out what is missing', () => {
    expect(fullName({ firstName: 'Jane', lastName: 'Doe' })).toBe('Jane Doe')
    expect(fullName({ firstName: 'Jane', middleName: 'Marie', lastName: 'Doe', suffix: 'Jr.' })).toBe('Jane Marie Doe Jr.')
  })
})
