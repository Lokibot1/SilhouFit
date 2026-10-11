import { describe, expect, it } from 'vitest'
import { PRODUCTS } from '../../src/data/products'
import {
  computeTotals,
  defaultFulfilment,
  deliveryEta,
  fulfilmentAvailability,
  paymentLabel,
  parseCheckoutItems,
  pickupEta,
  SHIPPING_FEE,
  type CheckoutItem,
} from '../../src/utils/checkout'

const byId = (id: string) => PRODUCTS.find((p) => p.id === id)!
const item = (id: string, qty = 1): CheckoutItem => ({ product: byId(id), size: 'M', color: byId(id).colors[0].name, qty })
const params = (query: string) => new URLSearchParams(query)

describe('parseCheckoutItems', () => {
  it('builds the item from a valid URL', () => {
    const [first, ...rest] = parseCheckoutItems(params('item=p01&size=M&color=Navy&qty=2'), PRODUCTS)
    expect(rest).toHaveLength(0)
    expect(first).toMatchObject({ size: 'M', color: 'Navy', qty: 2 })
    expect(first.product.id).toBe('p01')
  })

  it('defaults the quantity to 1', () => {
    expect(parseCheckoutItems(params('item=p01&size=M&color=Navy'), PRODUCTS)[0].qty).toBe(1)
  })

  it.each([
    ['unknown piece', 'item=nope&size=M&color=Navy&qty=1'],
    ['no piece', 'size=M&color=Navy&qty=1'],
    ['a size the category does not offer', 'item=p01&size=34&color=Navy&qty=1'],
    ['a missing size', 'item=p01&color=Navy&qty=1'],
    ['a colour the piece does not come in', 'item=p01&size=M&color=Rust&qty=1'],
    ['quantity zero', 'item=p01&size=M&color=Navy&qty=0'],
    ['quantity above stock', 'item=p02&size=M&color=Black&qty=5'],
    ['a fractional quantity', 'item=p01&size=M&color=Navy&qty=1.5'],
    ['a negative quantity', 'item=p01&size=M&color=Navy&qty=-1'],
    ['a script in the size', 'item=p01&size=%3Cscript%3E&color=Navy&qty=1'],
    ['a sold-out piece', 'item=p24&size=M&color=Indigo&qty=1'],
  ])('rejects %s', (_label, query) => {
    expect(parseCheckoutItems(params(query), PRODUCTS)).toEqual([])
  })
})

describe('computeTotals', () => {
  it('adds delivery shipping to a full-price piece', () => {
    expect(computeTotals([item('p01', 2)], 'delivery')).toEqual({ subtotal: 3780, discount: 0, shipping: SHIPPING_FEE, total: 3879 })
  })

  it('shows the sale as a discount against the original price', () => {
    // p02: 6,490 listed, 4,990 on sale.
    expect(computeTotals([item('p02', 2)], 'delivery')).toEqual({ subtotal: 12980, discount: 3000, shipping: 99, total: 10079 })
  })

  it('has no shipping for pickup', () => {
    expect(computeTotals([item('p01')], 'pickup')).toEqual({ subtotal: 1890, discount: 0, shipping: 0, total: 1890 })
  })

  it('sums several items', () => {
    expect(computeTotals([item('p01'), item('p03', 3)], 'pickup').total).toBe(1890 + 790 * 3)
  })
})

describe('ETA', () => {
  it('delivery arrives three to five days from today, dates only', () => {
    expect(deliveryEta(new Date(2026, 9, 11))).toBe('Arrives Wed, Oct 14 – Fri, Oct 16')
  })

  it('rolls over month ends', () => {
    expect(deliveryEta(new Date(2026, 9, 29))).toBe('Arrives Sun, Nov 1 – Tue, Nov 3')
  })

  it('pickup is ready tomorrow at 2:00 PM, in 12-hour time, at the boutique', () => {
    expect(pickupEta([item('p01')])).toBe('Ready at Ayala Atelier tomorrow from 2:00 PM')
  })
})

describe('availability', () => {
  it('allows both for a piece sold online and in store', () => {
    expect(fulfilmentAvailability([item('p01')])).toEqual({ delivery: null, pickup: null })
    expect(defaultFulfilment([item('p01')])).toBe('delivery')
  })

  it('disables delivery for a store-only piece, with the reason, and defaults to pickup', () => {
    const items = [item('p12')] // Hook Wall Jacket, store only, Lumban Loom
    expect(fulfilmentAvailability(items).delivery).toBe('Store-only piece. Pick it up at Lumban Loom.')
    expect(fulfilmentAvailability(items).pickup).toBeNull()
    expect(defaultFulfilment(items)).toBe('pickup')
  })

  it('disables pickup for an online-only piece', () => {
    const items = [item('p05')] // Cable Knit Pullover, online only
    expect(fulfilmentAvailability(items).pickup).toBe('Sold online only.')
    expect(defaultFulfilment(items)).toBe('delivery')
  })
})

describe('paymentLabel', () => {
  it('names the e-wallet provider and the cash option for each fulfilment', () => {
    expect(paymentLabel('ewallet', 'delivery', 'maya')).toBe('E-Wallet (Maya)')
    expect(paymentLabel('cash', 'delivery', 'gcash')).toBe('Cash on delivery')
    expect(paymentLabel('cash', 'pickup', 'gcash')).toBe('Pay at pickup')
  })
})
