import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORDER_STATUSES } from '../../src/service/ordersApi'
import { buildNotifications, isUnread, loadSeen, markSeen, notificationSentence, relativeTime, saveSeen, unreadCount } from '../../src/utils/notifications'
import { customerOrder, shipment } from '../fixtures/orders'

const KEY = 'silhoufit-notifications-seen'

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

describe('buildNotifications', () => {
  const order = (n: number, over = {}) => customerOrder({ id: `id-${n}`, orderNumber: `SHF-${n}`, createdAt: `2026-10-${String(n).padStart(2, '0')}T02:00:00.000Z`, ...over })

  it('keeps the latest 10 orders, newest first, one entry each', () => {
    const orders = Array.from({ length: 12 }, (_, i) => order(i + 1))
    const entries = buildNotifications(orders)
    expect(entries).toHaveLength(10)
    expect(entries.map((e) => e.orderNumber)).toEqual(['SHF-12', 'SHF-11', 'SHF-10', 'SHF-9', 'SHF-8', 'SHF-7', 'SHF-6', 'SHF-5', 'SHF-4', 'SHF-3'])
  })

  it('describes the current status', () => {
    const [entry] = buildNotifications([order(1, { status: 'PROCESSING' })])
    expect(entry).toMatchObject({ id: 'id-1', orderNumber: 'SHF-1', status: 'PROCESSING', sentence: 'Your order is being prepared' })
  })

  it('does not change the list it is given', () => {
    const orders = [order(1), order(2)]
    buildNotifications(orders)
    expect(orders.map((o) => o.orderNumber)).toEqual(['SHF-1', 'SHF-2'])
  })

  it('is empty for no orders', () => {
    expect(buildNotifications([])).toEqual([])
  })

  describe('the time it shows', () => {
    const at = (over: Parameters<typeof order>[1]) => buildNotifications([order(1, over)])[0].at
    const created = order(1).createdAt

    it('uses when it was delivered, cancelled, picked up or paid', () => {
      expect(at({ status: 'DELIVERED', shipment: shipment({ deliveredAt: '2026-10-09T05:00:00.000Z' }) })).toBe('2026-10-09T05:00:00.000Z')
      expect(at({ status: 'CANCELLED', cancelledAt: '2026-10-08T05:00:00.000Z' })).toBe('2026-10-08T05:00:00.000Z')
      expect(at({ status: 'DISPATCHED', shipment: shipment({ pickupTime: '2026-10-07T05:00:00.000Z' }) })).toBe('2026-10-07T05:00:00.000Z')
      expect(at({ status: 'OUT_FOR_DELIVERY', shipment: shipment({ pickupTime: '2026-10-07T06:00:00.000Z' }) })).toBe('2026-10-07T06:00:00.000Z')
      expect(at({ status: 'PAID', paidAt: '2026-10-06T05:00:00.000Z' })).toBe('2026-10-06T05:00:00.000Z')
      expect(at({ status: 'PROCESSING', paidAt: '2026-10-06T06:00:00.000Z' })).toBe('2026-10-06T06:00:00.000Z')
      expect(at({ status: 'REFUNDED', paidAt: '2026-10-06T07:00:00.000Z' })).toBe('2026-10-06T07:00:00.000Z')
    })

    it('uses when it was placed for unpaid orders', () => {
      expect(at({ status: 'PENDING_PAYMENT' })).toBe(created)
      expect(at({ status: 'PAYMENT_FAILED', paidAt: '2026-10-06T05:00:00.000Z' })).toBe(created)
    })

    it('falls back to when it was placed when the better time is missing', () => {
      expect(at({ status: 'DELIVERED', shipment: null })).toBe(created)
      expect(at({ status: 'CANCELLED', cancelledAt: null })).toBe(created)
      expect(at({ status: 'DISPATCHED', shipment: null, paidAt: null })).toBe(created)
      expect(at({ status: 'DISPATCHED', shipment: null, paidAt: '2026-10-06T05:00:00.000Z' })).toBe('2026-10-06T05:00:00.000Z')
      expect(at({ status: 'PAID', paidAt: null })).toBe(created)
    })
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

describe('seen and unread', () => {
  const entry = (id: string, status: Parameters<typeof notificationSentence>[0]) => ({ id, status })
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => store[key] ?? null)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => void (store[key] = value))
  })
  afterEach(() => vi.restoreAllMocks())

  it('is unread when the status differs from the one last seen, and when never seen', () => {
    const seen = { a: 'PAID', b: 'DELIVERED' }
    expect(isUnread(entry('a', 'PAID'), seen)).toBe(false)
    expect(isUnread(entry('b', 'CANCELLED'), seen)).toBe(true)
    expect(isUnread(entry('c', 'PAID'), seen)).toBe(true)
  })

  it('counts the unread entries', () => {
    const entries = [entry('a', 'PAID'), entry('b', 'CANCELLED'), entry('c', 'PAID')].map((e) => ({ ...e, orderNumber: '', sentence: '', at: '' }))
    expect(unreadCount(entries, { a: 'PAID', b: 'DELIVERED' })).toBe(2)
    expect(unreadCount(entries, markSeen(entries))).toBe(0)
    expect(unreadCount([], {})).toBe(0)
  })

  it('marks every entry shown as seen, and drops the ones no longer shown', () => {
    expect(markSeen([entry('a', 'PAID'), entry('b', 'DELIVERED')])).toEqual({ a: 'PAID', b: 'DELIVERED' })
    expect(markSeen([])).toEqual({})
  })

  it('saves per email and reads it back', () => {
    saveSeen('ana@example.com', { a: 'PAID' })
    expect(JSON.parse(store[KEY])).toEqual({ email: 'ana@example.com', seen: { a: 'PAID' } })
    expect(loadSeen('ana@example.com')).toEqual({ a: 'PAID' })
  })

  it('shows nothing seen to another account, or with no email', () => {
    saveSeen('ana@example.com', { a: 'PAID' })
    expect(loadSeen('bo@example.com')).toEqual({})
    expect(loadSeen(undefined)).toEqual({})
    saveSeen(undefined, { b: 'PAID' })
    expect(JSON.parse(store[KEY]).email).toBe('ana@example.com')
  })

  it.each(['not json', '[]', 'null', '42', '{"email":"ana@example.com"}', '{"email":"ana@example.com","seen":[]}', '{"email":"ana@example.com","seen":"x"}'])('treats %s as nothing seen', (raw) => {
    store[KEY] = raw
    expect(loadSeen('ana@example.com')).toEqual({})
  })

  it('ignores entries whose status is not text', () => {
    store[KEY] = JSON.stringify({ email: 'ana@example.com', seen: { a: 'PAID', b: 3, c: null } })
    expect(loadSeen('ana@example.com')).toEqual({ a: 'PAID' })
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(loadSeen('ana@example.com')).toEqual({})
    expect(() => saveSeen('ana@example.com', { a: 'PAID' })).not.toThrow()
  })
})
