import { beforeEach, describe, expect, it } from 'vitest'
import { DEV_ADMIN } from '../../src/data/mockAccounts'
import { changePassword } from '../../src/service/accountService'
import { ACCOUNTS_KEY, getAccounts, reloadAccounts, resetAccounts } from '../../src/service/accountStore'

const fast = { delayMs: 0 }

beforeEach(() => {
  localStorage.clear()
  resetAccounts()
})

describe('changing the password', () => {
  it('clears the flag and stores the new password', async () => {
    const pending = getAccounts().staff.find((a) => a.mustChangePassword)!
    const current = getAccounts().passwords[pending.id]
    await changePassword(pending.id, current, 'Fresh#Pass1', fast)
    expect(getAccounts().staff.find((a) => a.id === pending.id)!.mustChangePassword).toBe(false)
    expect(getAccounts().passwords[pending.id]).toBe('Fresh#Pass1')
  })

  it('rejects a weak password and keeps the flag', async () => {
    const pending = getAccounts().staff.find((a) => a.mustChangePassword)!
    await expect(changePassword(pending.id, getAccounts().passwords[pending.id], 'weak', fast)).rejects.toMatchObject({ kind: 'validation' })
    expect(getAccounts().staff.find((a) => a.id === pending.id)!.mustChangePassword).toBe(true)
  })

  it('rejects a wrong current password and the same password, and keeps the flag', async () => {
    const pending = getAccounts().staff.find((a) => a.mustChangePassword)!
    const current = getAccounts().passwords[pending.id]
    await expect(changePassword(pending.id, 'Wrong#Pass1', 'Fresh#Pass1', fast)).rejects.toMatchObject({ kind: 'wrong-password' })
    await expect(changePassword(pending.id, current, current, fast)).rejects.toMatchObject({ kind: 'same' })
    expect(getAccounts().staff.find((a) => a.id === pending.id)!.mustChangePassword).toBe(true)
    expect(getAccounts().passwords[pending.id]).toBe(current)
  })
})

describe('persistence', () => {
  it('survives a reload of the store', () => {
    resetAccounts()
    reloadAccounts()
    expect(getAccounts().staff.length).toBeGreaterThan(0)
  })

  it('starts again from the sample accounts when storage is corrupted', () => {
    localStorage.setItem(ACCOUNTS_KEY, '{not json')
    reloadAccounts()
    expect(getAccounts().admins[0].email).toBe(DEV_ADMIN.email)
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify({ customers: 'nope' }))
    reloadAccounts()
    expect(getAccounts().staff.length).toBeGreaterThan(0)
  })
})
