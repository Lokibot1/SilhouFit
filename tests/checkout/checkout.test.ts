import { describe, expect, it } from 'vitest'
import {
  computeTotals,
  deliveryEta,
  parseCheckoutItems,
  SHIPPING_FEE,
  type CheckoutItem,
} from '../../src/utils/checkout'
import { BLAZER, POLO, SOLD_OUT, TROUSERS } from '../fixtures/shopProducts'

const PRODUCTS = [POLO, BLAZER, SOLD_OUT, TROUSERS]
const item = (product = POLO, qty = 1): CheckoutItem => {
  const v = product.variants![0]
  return { product, variantId: v.id, size: v.size ?? '', color: v.color ?? '', qty, unit: v.price }
}
const params = (query: string) => new URLSearchParams(query)

describe('parseCheckoutItems', () => {
  it('builds the item from a valid URL', () => {
    const [first, ...rest] = parseCheckoutItems(params('item=p01&variant=p01-m-navy&qty=2'), PRODUCTS)
    expect(rest).toHaveLength(0)
    expect(first).toMatchObject({ variantId: 'p01-m-navy', size: 'M', color: 'Navy', qty: 2, unit: 2100 })
    expect(first.product.id).toBe('p01')
  })

  it('builds several items from repeated params, in order', () => {
    const items = parseCheckoutItems(params('item=p01&variant=p01-m-navy&qty=2&item=p02&variant=p02-m-black&qty=1'), PRODUCTS)
    expect(items.map((i) => [i.product.id, i.variantId, i.qty])).toEqual([
      ['p01', 'p01-m-navy', 2],
      ['p02', 'p02-m-black', 1],
    ])
  })

  it('rejects the whole order when one of several items is invalid or a variant repeats', () => {
    expect(parseCheckoutItems(params('item=p01&variant=p01-m-navy&item=p02&variant=nope'), PRODUCTS)).toEqual([])
    expect(parseCheckoutItems(params('item=p01&variant=p01-m-navy&item=p01&variant=p01-m-navy'), PRODUCTS)).toEqual([])
  })

  it('takes two variants of one piece', () => {
    expect(parseCheckoutItems(params('item=p01&variant=p01-s-white&item=p01&variant=p01-m-navy'), PRODUCTS)).toHaveLength(2)
  })

  it('defaults the quantity to 1', () => {
    expect(parseCheckoutItems(params('item=p01&variant=p01-m-navy'), PRODUCTS)[0].qty).toBe(1)
  })

  it.each([
    ['unknown piece', 'item=nope&variant=p01-m-navy&qty=1'],
    ['no piece', 'variant=p01-m-navy&qty=1'],
    ['a variant the piece does not have', 'item=p01&variant=p02-m-black&qty=1'],
    ['a missing variant', 'item=p01&qty=1'],
    ['quantity zero', 'item=p01&variant=p01-m-navy&qty=0'],
    ['quantity above the variant stock', 'item=p01&variant=p01-m-navy&qty=6'],
    ['a fractional quantity', 'item=p01&variant=p01-m-navy&qty=1.5'],
    ['a negative quantity', 'item=p01&variant=p01-m-navy&qty=-1'],
    ['a script in the variant', 'item=p01&variant=%3Cscript%3E&qty=1'],
    ['a sold-out piece', 'item=p24&variant=p24-m-indigo&qty=1'],
  ])('rejects %s', (_label, query) => {
    expect(parseCheckoutItems(params(query), PRODUCTS)).toEqual([])
  })
})

describe('computeTotals', () => {
  it('adds the flat shipping fee to the variants at their own price, until the subtotal reaches the free threshold', () => {
    expect(computeTotals([item(POLO)])).toEqual({ subtotal: 1890, discount: 0, shipping: SHIPPING_FEE, total: 1890 + SHIPPING_FEE })
    expect(computeTotals([item(POLO, 2)])).toEqual({ subtotal: 3780, discount: 0, shipping: 0, total: 3780 })
  })

  it('sums several items', () => {
    expect(computeTotals([item(POLO), item(TROUSERS, 3)]).total).toBe(1890 + 2600 * 3)
  })

  it('uses a quoted fee over the flat rule, and 0 is a real fee', () => {
    expect(computeTotals([item(POLO)], 99)).toMatchObject({ shipping: 99, total: 1989 })
    expect(computeTotals([item(POLO, 2)], 99)).toMatchObject({ shipping: 99, total: 3879 })
    expect(computeTotals([item(POLO)], 0)).toMatchObject({ shipping: 0, total: 1890 })
  })
})

describe('ETA', () => {
  it('delivery arrives three to five days from today, dates only', () => {
    expect(deliveryEta(new Date(2026, 9, 11))).toBe('Arrives Wed, Oct 14 – Fri, Oct 16')
  })

  it('rolls over month ends', () => {
    expect(deliveryEta(new Date(2026, 9, 29))).toBe('Arrives Sun, Nov 1 – Tue, Nov 3')
  })
})
