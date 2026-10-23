import { describe as suite, expect, it } from 'vitest'
import { addDays, defaultFilter, describe, describeSales, manilaToday, resolvePeriod, resolveSalesWindow, yearOptions, type Period } from '../../src/utils/period'

// 1:00 PM in Manila on Friday, Oct 23, 2026.
const NOW = new Date('2026-10-23T05:00:00Z')
const at = (manilaDate: string) => new Date(`${manilaDate}T12:00:00+08:00`)
const range = (period: Period, year: number, now = NOW) => {
  const { start, end } = resolvePeriod({ period, year }, now)
  return [start, end]
}

suite('manilaToday', () => {
  it('reads the date in Manila, not UTC', () => {
    expect(manilaToday(new Date('2026-12-31T17:00:00Z'))).toEqual({ date: '2027-01-01', minutes: 60, year: 2027 })
    expect(manilaToday(new Date('2026-12-31T15:59:00Z'))).toMatchObject({ date: '2026-12-31', minutes: 23 * 60 + 59 })
    expect(manilaToday(NOW)).toEqual({ date: '2026-10-23', minutes: 13 * 60, year: 2026 })
  })
})

suite('defaults and years', () => {
  it('starts on this month of this year', () => {
    expect(defaultFilter(NOW)).toEqual({ period: 'month', year: 2026 })
    expect(range('month', 2026)).toEqual(['2026-10-01', '2026-10-23'])
    expect(resolvePeriod(defaultFilter(NOW), NOW)).toMatchObject({ scope: 'October 2026', when: 'this month', isCurrent: true })
  })
  it('offers this year and the two before', () => {
    expect(yearOptions(NOW)).toEqual([2026, 2025, 2024])
  })
})

suite('current year', () => {
  it('day is today', () => {
    expect(resolvePeriod({ period: 'day', year: 2026 }, NOW)).toMatchObject({ start: '2026-10-23', end: '2026-10-23', scope: 'Today, Oct 23', when: 'today' })
  })
  it('week starts on Monday and ends today', () => {
    expect(resolvePeriod({ period: 'week', year: 2026 }, NOW)).toMatchObject({ start: '2026-10-19', end: '2026-10-23', scope: 'Oct 19 to 23', when: 'this week' })
  })
  it('keeps a Sunday in the Monday to Sunday week', () => {
    expect(range('week', 2026, at('2026-10-25'))).toEqual(['2026-10-19', '2026-10-25'])
    expect(range('week', 2026, at('2026-10-26'))).toEqual(['2026-10-26', '2026-10-26'])
  })
  it('clips the first week to Jan 1 when it starts on a Thursday', () => {
    expect(range('week', 2026, at('2026-01-03'))).toEqual(['2026-01-01', '2026-01-03'])
  })
  it('names a week that crosses a month', () => {
    expect(resolvePeriod({ period: 'week', year: 2026 }, at('2026-11-01')).scope).toBe('Oct 26 to Nov 1')
  })
  it('handles Feb 29 in a leap year', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01')
    expect(range('month', 2028, at('2028-02-29'))).toEqual(['2028-02-01', '2028-02-29'])
    expect(range('week', 2028, at('2028-03-01'))).toEqual(['2028-02-28', '2028-03-01'])
  })
  it('switches quarter at each boundary', () => {
    const quarter = (date: string) => resolvePeriod({ period: 'quarter', year: Number(date.slice(0, 4)) }, at(date))
    expect(quarter('2026-03-31')).toMatchObject({ start: '2026-01-01', scope: 'Q1 2026 so far' })
    expect(quarter('2026-04-01')).toMatchObject({ start: '2026-04-01', scope: 'Q2 2026 so far' })
    expect(quarter('2026-06-30')).toMatchObject({ start: '2026-04-01' })
    expect(quarter('2026-07-01')).toMatchObject({ start: '2026-07-01', scope: 'Q3 2026 so far' })
    expect(quarter('2026-09-30')).toMatchObject({ start: '2026-07-01' })
    expect(quarter('2026-10-01')).toMatchObject({ start: '2026-10-01', end: '2026-10-01', scope: 'Q4 2026 so far' })
    expect(quarter('2026-12-31')).toMatchObject({ start: '2026-10-01', end: '2026-12-31' })
  })
  it('year runs from Jan 1 to today', () => {
    expect(resolvePeriod({ period: 'year', year: 2026 }, NOW)).toMatchObject({ start: '2026-01-01', end: '2026-10-23', scope: '2026 so far', when: 'this year' })
  })
  it('rolls over at midnight in Manila', () => {
    const lateNight = new Date('2026-12-31T17:00:00Z') // already Jan 1, 2027
    expect(range('month', 2027, lateNight)).toEqual(['2027-01-01', '2027-01-01'])
    expect(range('year', 2026, lateNight)).toEqual(['2026-01-01', '2026-12-31'])
  })
})

suite('past year', () => {
  it('uses the last day, week, month and quarter of the year', () => {
    expect(resolvePeriod({ period: 'day', year: 2025 }, NOW)).toMatchObject({ start: '2025-12-31', end: '2025-12-31', scope: 'Dec 31, 2025', when: 'on Dec 31, 2025', isCurrent: false })
    expect(resolvePeriod({ period: 'week', year: 2025 }, NOW)).toMatchObject({ start: '2025-12-29', end: '2025-12-31', scope: 'Dec 29 to 31' })
    expect(resolvePeriod({ period: 'month', year: 2025 }, NOW)).toMatchObject({ start: '2025-12-01', end: '2025-12-31', scope: 'December 2025', when: 'in December 2025' })
    expect(resolvePeriod({ period: 'quarter', year: 2025 }, NOW)).toMatchObject({ start: '2025-10-01', end: '2025-12-31', scope: 'Q4 2025', when: 'in Q4 2025' })
    expect(resolvePeriod({ period: 'year', year: 2025 }, NOW)).toMatchObject({ start: '2025-01-01', end: '2025-12-31', scope: '2025', when: 'in 2025' })
  })
  it('clips a past week to the year', () => {
    // Dec 31, 2024 is a Tuesday; Dec 30 is its Monday. Dec 31, 2023 is a Sunday: the whole week is in 2023.
    expect(range('week', 2024)).toEqual(['2024-12-30', '2024-12-31'])
    expect(range('week', 2023)).toEqual(['2023-12-25', '2023-12-31'])
  })
  it('is empty for a year that has not begun', () => {
    const { start, end } = resolvePeriod({ period: 'month', year: 2027 }, NOW)
    expect(end < start).toBe(true)
  })
})

suite('describe', () => {
  it('keeps every description within 38 characters so it never wraps', () => {
    const dates = ['2026-01-01', '2026-01-03', '2026-03-31', '2026-09-28', '2026-10-23', '2026-11-03', '2026-12-31']
    for (const date of dates)
      for (const period of ['day', 'week', 'month', 'quarter', 'year'] as const)
        for (const year of yearOptions(at(date)))
          for (const subject of ['Daily totals', 'Weekly totals', 'Monthly totals', 'Units by category', 'Most ordered items']) {
            const text = describe({ period, year }, subject, at(date))
            expect(text.length, text).toBeLessThanOrEqual(38)
          }
    expect(describe(defaultFilter(NOW), 'Daily totals', NOW)).toBe('Daily totals · October 2026')
  })
})

suite('resolveSalesWindow', () => {
  const win = (period: Period, year: number, now = NOW) => resolveSalesWindow({ period, year }, now)

  it('uses the filter as the size of each point', () => {
    for (const period of ['day', 'week', 'month', 'quarter', 'year'] as const) expect(win(period, 2026).granularity).toBe(period)
  })
  it('day covers the latest month of the year', () => {
    expect(win('day', 2026)).toEqual({ start: '2026-10-01', end: '2026-10-23', granularity: 'day', scope: 'October 2026', when: 'this month' })
    expect(win('day', 2025)).toMatchObject({ start: '2025-12-01', end: '2025-12-31', scope: 'December 2025', when: 'in December 2025' })
  })
  it('week, month and quarter cover the year, to today in the current one', () => {
    for (const period of ['week', 'month', 'quarter'] as const) {
      expect(win(period, 2026)).toMatchObject({ start: '2026-01-01', end: '2026-10-23', scope: '2026 so far', when: 'this year' })
      expect(win(period, 2025)).toMatchObject({ start: '2025-01-01', end: '2025-12-31', scope: '2025', when: 'in 2025' })
    }
  })
  it('year covers the chosen year and the two before it', () => {
    expect(win('year', 2026)).toMatchObject({ start: '2024-01-01', end: '2026-10-23', scope: '2024 to 2026', when: 'from 2024 to 2026' })
    expect(win('year', 2025)).toMatchObject({ start: '2023-01-01', end: '2025-12-31', scope: '2023 to 2025' })
  })
  it('rolls over at midnight in Manila', () => {
    expect(win('day', 2027, new Date('2026-12-31T17:00:00Z'))).toMatchObject({ start: '2027-01-01', end: '2027-01-01', scope: 'January 2027' })
  })
  it('keeps every description within 38 characters so it never wraps', () => {
    for (const date of ['2026-01-01', '2026-09-28', '2026-10-23', '2026-12-31'])
      for (const period of ['day', 'week', 'month', 'quarter', 'year'] as const)
        for (const year of yearOptions(at(date))) expect(describeSales({ period, year }, at(date)).length, describeSales({ period, year }, at(date))).toBeLessThanOrEqual(38)
    expect(describeSales(defaultFilter(NOW), NOW)).toBe('Monthly totals · 2026 so far')
    expect(describeSales({ period: 'year', year: 2026 }, NOW)).toBe('Yearly totals · 2024 to 2026')
  })
})
