import { describe, expect, it } from 'vitest'
import { ORDER_STATUSES } from '../../src/service/ordersApi'
import { notificationSentence, relativeTime } from '../../src/utils/notifications'

describe('notificationSentence', () => {
  it.each([
    ['PENDING_PAYMENT', 'Your order is waiting for payment'],
    ['PAYMENT_FAILED', 'Your order had a failed payment'],
    ['PAID', 'Your order was paid'],
    ['PROCESSING', 'Your order is being prepared'],
    ['DISPATCHED', 'Your order is on its way'],
    ['OUT_FOR_DELIVERY', 'Your order is out for delivery'],
    ['DELIVERED', 'Your order was delivered'],
    ['CANCELLED', 'Your order was cancelled'],
    ['REFUNDED', 'Your order was refunded'],
  ] as const)('%s reads "%s"', (status, sentence) => {
    expect(notificationSentence(status)).toBe(sentence)
  })

  it('covers every status', () => {
    for (const status of ORDER_STATUSES) expect(notificationSentence(status)).toMatch(/^Your order \w/)
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-11-11T08:00:00.000Z') // 4:00 PM in Manila
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

  it('says just now under a minute, and for a clock slightly ahead', () => {
    expect(relativeTime(ago(30_000), now)).toBe('Just now')
    expect(relativeTime(ago(-5 * 60_000), now)).toBe('Just now')
  })

  it('counts minutes then hours within today', () => {
    expect(relativeTime(ago(60_000), now)).toBe('1 min ago')
    expect(relativeTime(ago(5 * 60_000), now)).toBe('5 min ago')
    expect(relativeTime(ago(59 * 60_000), now)).toBe('59 min ago')
    expect(relativeTime(ago(60 * 60_000), now)).toBe('1 hr ago')
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe('3 hr ago')
  })

  it('says Yesterday for the previous Manila day, even when it was under 24 hours ago', () => {
    expect(relativeTime(ago(24 * 3_600_000), now)).toBe('Yesterday')
    expect(relativeTime('2026-11-10T15:00:00.000Z', new Date('2026-11-11T00:30:00.000Z'))).toBe('Yesterday') // 11:00 PM, then 8:30 AM
  })

  it('shows the date and the time in 12-hour form from two days back', () => {
    expect(relativeTime('2026-10-22T07:45:00.000Z', now)).toBe('Oct 22, 3:45 PM')
    expect(relativeTime('2026-11-08T16:05:00.000Z', now)).toBe('Nov 9, 12:05 AM')
    expect(relativeTime('2026-11-09T04:00:00.000Z', now)).toBe('Nov 9, 12:00 PM')
  })
})
