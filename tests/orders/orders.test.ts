import { describe, expect, it } from 'vitest'
import {
  adaptOrderToReceipt,
  buildTimeline,
  canBuyAgain,
  canCancel,
  filterOrders,
  hasShipped,
  itemCount,
  matchesTab,
  orderTitle,
  ORDER_TABS,
  parseTab,
  STATUS_CHIP,
  tabCounts,
  trackingLink,
} from '../../src/utils/orders'
import { ALL_STATUSES, customerOrder, orderItem, shipment } from '../fixtures/orders'

describe('status tabs', () => {
  it('puts every status in exactly one middle tab, except refunded which only shows under All', () => {
    for (const status of ALL_STATUSES) {
      const order = customerOrder({ status })
      const tabs = ORDER_TABS.filter((tab) => tab.id !== 'all' && matchesTab(order, tab.id)).map((tab) => tab.id)
      expect(tabs, status).toHaveLength(status === 'REFUNDED' ? 0 : 1)
      expect(matchesTab(order, 'all')).toBe(true)
    }
  })

  it('maps the statuses to the tabs a shopper expects', () => {
    const tabOf = (status: (typeof ALL_STATUSES)[number]) => ORDER_TABS.find((t) => t.id !== 'all' && matchesTab(customerOrder({ status }), t.id))?.id
    expect(tabOf('PENDING_PAYMENT')).toBe('to-pay')
    expect(tabOf('PAYMENT_FAILED')).toBe('to-pay')
    expect(tabOf('PAID')).toBe('to-ship')
    expect(tabOf('PROCESSING')).toBe('to-ship')
    expect(tabOf('DISPATCHED')).toBe('to-receive')
    expect(tabOf('OUT_FOR_DELIVERY')).toBe('to-receive')
    expect(tabOf('DELIVERED')).toBe('completed')
    expect(tabOf('CANCELLED')).toBe('cancelled')
  })

  it('reads the tab from the URL and falls back to All', () => {
    expect(parseTab('to-pay')).toBe('to-pay')
    expect(parseTab('nonsense')).toBe('all')
    expect(parseTab(null)).toBe('all')
  })

  it('counts each tab', () => {
    const orders = [customerOrder(), customerOrder({ status: 'CANCELLED' }), customerOrder({ status: 'REFUNDED' })]
    expect(tabCounts(orders)).toEqual({ all: 3, 'to-pay': 1, 'to-ship': 0, 'to-receive': 0, completed: 0, cancelled: 1 })
  })

  it('searches the order number and product names as plain text, ignoring case', () => {
    const polo = customerOrder({ orderNumber: 'SHF-1', items: [orderItem({ name: 'Heritage Polo' })] })
    const dress = customerOrder({ orderNumber: 'SHF-2', items: [orderItem({ name: 'Garden Dress' })] })
    expect(filterOrders([polo, dress], 'all', ' polo ')).toEqual([polo])
    expect(filterOrders([polo, dress], 'all', 'shf-2')).toEqual([dress])
    expect(filterOrders([polo, dress], 'cancelled', 'polo')).toEqual([])
    expect(filterOrders([polo, dress], 'all', '.*')).toEqual([])
  })
})

describe('what an order allows', () => {
  it('cancels only an unpaid order that is waiting for payment', () => {
    for (const status of ALL_STATUSES) expect(canCancel(customerOrder({ status })), status).toBe(status === 'PENDING_PAYMENT')
    expect(canCancel({ status: 'PENDING_PAYMENT', paymentStatus: 'PAID' })).toBe(false)
  })

  it('buys again after delivery, cancellation or refund', () => {
    for (const status of ALL_STATUSES) expect(canBuyAgain({ status }), status).toBe(['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(status))
  })

  it('links tracking only while on its way and only for web addresses', () => {
    const on = (status: (typeof ALL_STATUSES)[number], url: string | null) => trackingLink({ status, shipment: shipment({ trackingUrl: url }) })
    expect(on('DISPATCHED', 'https://t.test/1')).toBe('https://t.test/1')
    expect(on('OUT_FOR_DELIVERY', 'http://t.test/1')).toBe('http://t.test/1')
    expect(on('DELIVERED', 'https://t.test/1')).toBeNull()
    expect(on('DISPATCHED', 'javascript:alert(1)')).toBeNull()
    expect(on('DISPATCHED', null)).toBeNull()
    expect(trackingLink({ status: 'DISPATCHED', shipment: null })).toBeNull()
  })

  it('shows the courier from dispatch on, when there is a shipment', () => {
    expect(hasShipped({ status: 'DISPATCHED', shipment: shipment() })).toBe(true)
    expect(hasShipped({ status: 'DISPATCHED', shipment: null })).toBe(false)
    expect(hasShipped({ status: 'PAID', shipment: shipment() })).toBe(false)
  })
})

describe('chips, titles and counts', () => {
  it('words every status, and uses red only for the ones that need the shopper to act', () => {
    expect(Object.keys(STATUS_CHIP).sort()).toEqual([...ALL_STATUSES].sort())
    for (const status of ALL_STATUSES) expect(STATUS_CHIP[status].label.length).toBeGreaterThan(0)
    expect(ALL_STATUSES.filter((s) => STATUS_CHIP[s].tone === 'alert')).toEqual(['PENDING_PAYMENT', 'PAYMENT_FAILED'])
  })

  it('titles an order by its first item and counts the rest and the pieces', () => {
    const order = customerOrder({ items: [orderItem({ name: 'A', qty: 2 }), orderItem({ id: 'b', name: 'B', qty: 3 }), orderItem({ id: 'c', name: 'C', qty: 1 })] })
    expect(orderTitle(order)).toBe('A + 2 more')
    expect(itemCount(order)).toBe(6)
    expect(orderTitle(customerOrder())).toBe('Heritage Polo')
    expect(orderTitle(customerOrder({ items: [] }))).toBe('SHF-20261026-ABC123')
  })
})

describe('the timeline', () => {
  const states = (status: (typeof ALL_STATUSES)[number], over = {}) => buildTimeline(customerOrder({ status, ...over })).map((s) => `${s.key}:${s.state}`)

  it('starts a new order at Paid, with the rest to come', () => {
    expect(states('PENDING_PAYMENT')).toEqual(['placed:done', 'paid:current', 'preparing:upcoming', 'shipped:upcoming', 'out:upcoming', 'delivered:upcoming'])
  })

  it('names a failed payment on the Paid step', () => {
    expect(buildTimeline(customerOrder({ status: 'PAYMENT_FAILED' }))[1]).toMatchObject({ label: 'Payment failed', state: 'current' })
  })

  it('moves the current step along as the order does', () => {
    expect(states('PAID')[2]).toBe('preparing:current')
    expect(states('PROCESSING')[2]).toBe('preparing:current')
    expect(states('DISPATCHED')[3]).toBe('shipped:current')
    expect(states('OUT_FOR_DELIVERY')[4]).toBe('out:current')
  })

  it('finishes every step once delivered', () => {
    expect(new Set(states('DELIVERED').map((s) => s.split(':')[1]))).toEqual(new Set(['done']))
  })

  it('stops a cancelled order at Cancelled, with the time and the reason', () => {
    const steps = buildTimeline(customerOrder({ status: 'CANCELLED', cancelledAt: '2026-10-26T05:00:00.000Z', cancellationReason: 'Wrong size' }))
    expect(steps.map((s) => s.key)).toEqual(['placed', 'cancelled'])
    expect(steps[1]).toMatchObject({ state: 'cancelled', at: '2026-10-26T05:00:00.000Z', note: 'Wrong size' })
  })

  it('shows a refunded order what happened, then Refunded', () => {
    const steps = buildTimeline(customerOrder({ status: 'REFUNDED', paidAt: '2026-10-26T03:00:00.000Z', shipment: shipment({ deliveredAt: '2026-10-28T03:00:00.000Z' }) }))
    expect(steps.at(-1)).toMatchObject({ key: 'refunded', state: 'current' })
    expect(steps.slice(0, -1).every((s) => s.state === 'done')).toBe(true)
    expect(steps.map((s) => s.key)).toContain('delivered')
    expect(buildTimeline(customerOrder({ status: 'REFUNDED' })).map((s) => s.key)).toEqual(['placed', 'refunded'])
  })
})

describe('adaptOrderToReceipt', () => {
  it('reads an order as the receipt does, with no estimate', () => {
    expect(adaptOrderToReceipt(customerOrder({ note: 'Gate' }))).toMatchObject({
      orderId: 'SHF-20261026-ABC123',
      total: 3879,
      shipping: 99,
      payment: 'Awaiting payment',
      fulfilment: 'Delivery',
      eta: '',
      recipient: 'Anne Santos',
      address: '12 Rizal Avenue, Barangay 176, City of Manila 1000',
      phone: '+639171234567',
      note: 'Gate',
      items: [{ name: 'Heritage Polo', size: 'M', color: 'Navy', qty: 2, price: 1890, arReady: false }],
    })
  })

  it('leaves a missing size or colour empty', () => {
    expect(adaptOrderToReceipt(customerOrder({ items: [orderItem({ size: null, color: null })] })).items[0]).toMatchObject({ size: '', color: '' })
  })
})
