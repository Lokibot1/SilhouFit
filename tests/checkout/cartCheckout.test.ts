import { describe, expect, it } from 'vitest'
import type { Line } from '../../src/hooks/useCart'
import {
  computeTotals,
  defaultFulfilment,
  fulfilmentAvailability,
  orderBlock,
  resolveCartItems,
  SHIPPING_FEE,
  type CheckoutItem,
} from '../../src/utils/checkout'
import { filterPhone } from '../../src/utils/checkoutValidation'
import { BLAZER, POLO, SOLD_OUT, TROUSERS } from '../fixtures/shopProducts'

const PRODUCTS = [POLO, BLAZER, SOLD_OUT, TROUSERS]
const storeOnly = { ...POLO, id: 'p12', name: 'Hook Wall Jacket', boutique: 'Lumban Loom', channels: ['store' as const] }
const onlineOnly = { ...POLO, id: 'p05', name: 'Cable Knit Pullover', channels: ['online' as const] }
const item = (product = POLO, qty = 1): CheckoutItem => {
  const v = product.variants![0]
  return { product, variantId: v.id, size: v.size ?? '', color: v.color ?? '', qty, unit: v.price }
}
const line = (variantId: string, qty: number, over: Partial<Line> = {}): Line => {
  const product = PRODUCTS.find((p) => p.variants?.some((v) => v.id === variantId))!
  const v = product.variants!.find((x) => x.id === variantId)!
  return { variantId, productId: product.id, name: product.name, boutique: product.boutique, category: product.category, size: v.size, color: v.color, colorHex: v.colorHex, unitPrice: v.price, stock: v.stock, image: product.image, qty, active: true, ...over }
}

describe('resolveCartItems', () => {
  it('turns valid lines into items at the line price, in order', () => {
    const { items, notices } = resolveCartItems([line('p01-m-navy', 2), line('p03-30-black', 1)], PRODUCTS)
    expect(items.map((i) => [i.product.id, i.variantId, i.size, i.color, i.qty, i.unit])).toEqual([
      ['p01', 'p01-m-navy', 'M', 'Navy', 2, 2100],
      ['p03', 'p03-30-black', '30', 'Black', 1, 2600],
    ])
    expect(notices).toEqual([])
  })

  it('leaves out inactive lines, lines whose piece did not load and sold-out variants, each with a notice', () => {
    const { items, notices } = resolveCartItems(
      [
        line('p01-m-navy', 1, { active: false }),
        line('p24-m-indigo', 1),
        line('p02-m-black', 1, { productId: 'gone' }),
        line('p03-30-black', 1),
      ],
      PRODUCTS,
    )
    expect(items.map((i) => i.product.id)).toEqual(['p03'])
    expect(notices).toEqual([
      'Heritage Polo is no longer available, so it was left out.',
      'Field Denim Jacket is sold out, so it was left out.',
      'Fence-Line Blazer is no longer available, so it was left out.',
    ])
  })

  it('lowers a quantity to the variant stock, with the notice', () => {
    const { items, notices } = resolveCartItems([line('p02-m-black', 9)], PRODUCTS) // 4 in stock
    expect(items[0].qty).toBe(4)
    expect(notices).toEqual(['Fence-Line Blazer: Quantity lowered to 4.'])
  })

  it('does not change the lines it was given', () => {
    const lines = [line('p02-m-black', 9)]
    resolveCartItems(lines, PRODUCTS)
    expect(lines[0].qty).toBe(9)
  })
})

describe('several items together', () => {
  it('disables pickup when the pieces come from more than one boutique, and says which', () => {
    const items = [item(POLO), item(TROUSERS)] // Ayala Atelier, Binondo Basics
    expect(fulfilmentAvailability(items)).toEqual({
      delivery: null,
      pickup: 'Pickup works for one boutique per order. These pieces are at Ayala Atelier and Binondo Basics.',
    })
    expect(defaultFulfilment(items)).toBe('delivery')
    expect(orderBlock(items)).toBeNull()
  })

  it('allows pickup for several pieces from one boutique', () => {
    expect(fulfilmentAvailability([item(POLO), item(BLAZER)]).pickup).toBeNull() // both Ayala Atelier
  })

  it('needs every piece to allow the option', () => {
    const items = [item(POLO), item(storeOnly)]
    expect(fulfilmentAvailability(items).delivery).toBe('Store-only piece. Pick it up at Lumban Loom.')
    expect(fulfilmentAvailability(items).pickup).toMatch(/one boutique per order/)
  })

  it('blocks the order when a store-only and an online-only piece are together, naming both', () => {
    expect(orderBlock([item(storeOnly), item(onlineOnly)])).toBe(
      "These pieces can't go in one order: Hook Wall Jacket is store-only and Cable Knit Pullover is online-only. Check them out separately.",
    )
  })

  it('blocks a store-only piece with pieces from another boutique, explaining the pickup limit', () => {
    expect(orderBlock([item(storeOnly), item(POLO)])).toMatch(
      /Hook Wall Jacket is store-only, but the pieces come from Lumban Loom and Ayala Atelier/,
    )
  })

  it('charges one flat shipping fee per order, not per item', () => {
    expect(computeTotals([item(POLO), item(TROUSERS)], 'delivery').shipping).toBe(SHIPPING_FEE)
  })
})

describe('filterPhone', () => {
  it('drops the dial code from a pasted international number', () => {
    expect(filterPhone('+63 (917) 123-4567', '+63')).toBe('9171234567')
    expect(filterPhone('+639171234567', '+63')).toBe('9171234567')
    expect(filterPhone('639171234567', '+63')).toBe('9171234567')
  })

  it('gives every way of writing the same number the same national number', () => {
    const same = ['+63 917 123 4567', '+639171234567', '639171234567', '0917 123 4567', '09171234567', '9171234567']
    expect(same.map((raw) => filterPhone(raw, '+63'))).toEqual(Array(same.length).fill('9171234567'))
  })

  it('caps the national number at 11 digits', () => {
    expect(filterPhone('917 123 4567 89012', '+63')).toBe('91712345678')
  })

  it('lets a lone 0 stand while it is being typed, and drops it once more digits follow', () => {
    expect(filterPhone('0', '+63')).toBe('0')
    expect(filterPhone('09', '+63')).toBe('9')
  })

  it('keeps the lead-in while the dial code is being typed', () => {
    expect(filterPhone('+', '+63')).toBe('+')
    expect(filterPhone('+6', '+63')).toBe('+6')
    expect(filterPhone('+63', '+63')).toBe('')
  })

  it('does not mistake a national number that starts like the dial code for a dial code', () => {
    expect(filterPhone('6391', '+63')).toBe('6391') // short and no plus: left as typed
  })

  it('works for other dial codes and strips junk', () => {
    expect(filterPhone('+1 (415) 555-0132', '+1')).toBe('4155550132')
    expect(filterPhone('abc', '+63')).toBe('')
  })
})
