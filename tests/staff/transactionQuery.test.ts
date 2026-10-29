import { describe, expect, it } from 'vitest'
import { rangeDates, readTransactionQuery, withTransactionParams } from '../../src/utils/transactionQuery'

const read = (search: string) => readTransactionQuery(new URLSearchParams(search))

describe('readTransactionQuery', () => {
  it('defaults to all time, newest first, 25 per page', () => {
    expect(read('')).toEqual({ q: '', range: '', from: '', to: '', status: '', sort: 'date', dir: 'desc', page: 1, per: 25 })
  })

  it('falls back to the default for anything off the whitelist', () => {
    expect(read('sort=id&dir=sideways&per=7&page=-3&range=year')).toMatchObject({ sort: 'date', dir: 'desc', per: 25, page: 1, range: '' })
    expect(read('page=abc').page).toBe(1)
    expect(read('page=4.9').page).toBe(4)
    expect(read('per=50').per).toBe(50)
  })

  it('gives each sort its own first direction, and honours dir', () => {
    expect(read('sort=total').dir).toBe('desc')
    expect(read('sort=customer').dir).toBe('asc')
    expect(read('sort=customer&dir=desc').dir).toBe('desc')
  })

  it('trims the search and caps its length', () => {
    expect(read('q=%20SF-10187%20').q).toBe('SF-10187')
    expect(read('q=' + 'a'.repeat(300)).q).toHaveLength(100)
  })

  it('keeps from and to only for a custom range, and only real dates', () => {
    expect(read('range=custom&from=2026-09-01&to=2026-09-30')).toMatchObject({ range: 'custom', from: '2026-09-01', to: '2026-09-30' })
    expect(read('range=week&from=2026-09-01&to=2026-09-30')).toMatchObject({ range: 'week', from: '', to: '' })
    expect(read('from=2026-09-01')).toMatchObject({ range: '', from: '' })
    expect(read('range=custom&from=2026-02-30&to=09-30-2026')).toMatchObject({ range: 'custom', from: '', to: '' })
    expect(read('range=custom&from=2026-09-01')).toMatchObject({ from: '2026-09-01', to: '' })
  })

  it('drops a range that ends before it starts', () => {
    expect(read('range=custom&from=2026-10-05&to=2026-10-01')).toMatchObject({ range: 'custom', from: '', to: '' })
    expect(read('range=custom&from=2026-10-05&to=2026-10-05')).toMatchObject({ from: '2026-10-05', to: '2026-10-05' })
  })
})

describe('rangeDates', () => {
  // 3:45 PM in Manila on Wed Oct 21, 2026.
  const now = new Date('2026-10-21T07:45:00Z')
  const none = { from: '', to: '' }

  it('works the presets out from today in Manila', () => {
    expect(rangeDates({ range: 'today', ...none }, now)).toEqual({ from: '2026-10-21', to: '2026-10-21' })
    expect(rangeDates({ range: 'week', ...none }, now)).toEqual({ from: '2026-10-15', to: '2026-10-21' })
    expect(rangeDates({ range: 'month', ...none }, now)).toEqual({ from: '2026-10-01', to: '2026-10-21' })
    expect(rangeDates({ range: '', ...none }, now)).toEqual({})
  })

  it('uses Manila, not UTC, for the day', () => {
    // 11 PM UTC on Oct 21 is already Oct 22 in Manila.
    expect(rangeDates({ range: 'today', ...none }, new Date('2026-10-21T23:00:00Z'))).toEqual({ from: '2026-10-22', to: '2026-10-22' })
  })

  it('leaves either end of a custom range open', () => {
    expect(rangeDates({ range: 'custom', from: '2026-09-01', to: '' }, now)).toEqual({ from: '2026-09-01', to: undefined })
    expect(rangeDates({ range: 'custom', ...none }, now)).toEqual({ from: undefined, to: undefined })
  })
})

describe('withTransactionParams', () => {
  const params = (search: string) => new URLSearchParams(search)

  it('removes a key when its value is empty', () => {
    expect(withTransactionParams(params('q=a&sort=total'), { q: '' }).toString()).toBe('sort=total')
  })

  it('goes back to page 1 when the search, range or page size changes, but not when sorting', () => {
    expect(withTransactionParams(params('page=3'), { q: 'maria' }).has('page')).toBe(false)
    expect(withTransactionParams(params('page=3'), { range: 'today' }).has('page')).toBe(false)
    expect(withTransactionParams(params('page=3'), { range: 'custom', from: '2026-09-01' }).has('page')).toBe(false)
    expect(withTransactionParams(params('page=3'), { per: '50' }).has('page')).toBe(false)
    expect(withTransactionParams(params('page=3'), { sort: 'total', dir: 'desc' }).get('page')).toBe('3')
    expect(withTransactionParams(params('page=3'), { q: 'maria', page: '2' }).get('page')).toBe('2')
  })

  it('drops from and to when a preset other than custom is chosen', () => {
    const custom = params('range=custom&from=2026-09-01&to=2026-09-30')
    expect(withTransactionParams(custom, { range: 'week' }).toString()).toBe('range=week')
    expect(withTransactionParams(custom, { range: '' }).toString()).toBe('')
    expect(withTransactionParams(custom, { range: 'custom', to: '2026-09-15' }).toString()).toBe('range=custom&from=2026-09-01&to=2026-09-15')
  })
})
