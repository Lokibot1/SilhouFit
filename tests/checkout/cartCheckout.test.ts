import { describe, expect, it } from 'vitest'
import { PRODUCTS } from '../../src/data/products'
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

const byId = (id: string) => PRODUCTS.find((p) => p.id === id)!
const item = (id: string, qty = 1): CheckoutItem => ({ product: byId(id), size: 'M', color: byId(id).colors[0].name, qty })
const line = (id: string, size: string | null, color: string | null, qty: number) => ({ id, size, color, qty })

describe('resolveCartItems', () => {
  it('turns valid lines into items, in order', () => {
    const { items, notices } = resolveCartItems([line('p01', 'M', 'Navy', 2), line('p03', 'S', 'Black', 1)], PRODUCTS)
    expect(items.map((i) => [i.product.id, i.size, i.color, i.qty])).toEqual([
      ['p01', 'M', 'Navy', 2],
      ['p03', 'S', 'Black', 1],
    ])
    expect(notices).toEqual([])
  })

  it('leaves out unknown pieces, sold-out pieces and old lines with no size or colour, each with a notice', () => {
    const { items, notices } = resolveCartItems(
      [
        line('gone', 'M', 'Navy', 1),
        line('p24', 'M', 'Indigo', 1),
        line('p01', null, null, 1),
        line('p01', 'M', 'Rust', 1),
        line('p03', 'S', 'Black', 1),
      ],
      PRODUCTS,
    )
    expect(items.map((i) => i.product.id)).toEqual(['p03'])
    expect(notices).toHaveLength(4)
    expect(notices.join(' ')).toMatch(/no longer in the catalogue/)
    expect(notices.join(' ')).toMatch(/Field Denim Jacket is sold out/)
    expect(notices.join(' ')).toMatch(/Heritage Polo has no size or colour chosen/)
  })

  it('lowers a quantity to the stock, with the notice', () => {
    const { items, notices } = resolveCartItems([line('p02', 'M', 'Black', 9)], PRODUCTS) // 4 in stock
    expect(items[0].qty).toBe(4)
    expect(notices).toEqual(['Fence-Line Blazer (M, Black): Quantity lowered to 4.'])
  })

  it('caps all lines of one piece together at its stock', () => {
    const { items, notices } = resolveCartItems(
      [line('p02', 'S', 'Black', 3), line('p02', 'M', 'Black', 3), line('p02', 'L', 'Black', 1)],
      PRODUCTS,
    )
    expect(items.map((i) => i.qty)).toEqual([3, 1])
    expect(notices).toEqual([
      'Fence-Line Blazer (M, Black): Quantity lowered to 1.',
      'Fence-Line Blazer (L, Black): no more in stock, so it was left out.',
    ])
  })

  it('does not change the lines it was given', () => {
    const lines = [line('p02', 'M', 'Black', 9)]
    resolveCartItems(lines, PRODUCTS)
    expect(lines[0].qty).toBe(9)
  })
})

describe('several items together', () => {
  it('disables pickup when the pieces come from more than one boutique, and says which', () => {
    const items = [item('p01'), item('p04')] // Ayala Atelier, Lumban Loom
    expect(fulfilmentAvailability(items)).toEqual({
      delivery: null,
      pickup: 'Pickup works for one boutique per order. These pieces are at Ayala Atelier and Lumban Loom.',
    })
    expect(defaultFulfilment(items)).toBe('delivery')
    expect(orderBlock(items)).toBeNull()
  })

  it('allows pickup for several pieces from one boutique', () => {
    expect(fulfilmentAvailability([item('p01'), item('p06')]).pickup).toBeNull() // both Ayala Atelier
  })

  it('needs every piece to allow the option', () => {
    const items = [item('p01'), item('p12')] // p12 is store only, at Lumban Loom
    expect(fulfilmentAvailability(items).delivery).toBe('Store-only piece. Pick it up at Lumban Loom.')
    expect(fulfilmentAvailability(items).pickup).toMatch(/one boutique per order/)
  })

  it('blocks the order when a store-only and an online-only piece are together, naming both', () => {
    expect(orderBlock([item('p12'), item('p05')])).toBe(
      "These pieces can't go in one order: Hook Wall Jacket is store-only and Cable Knit Pullover is online-only. Check them out separately.",
    )
  })

  it('blocks a store-only piece with pieces from another boutique, explaining the pickup limit', () => {
    expect(orderBlock([item('p12'), item('p01')])).toMatch(
      /Hook Wall Jacket is store-only, but the pieces come from Lumban Loom and Ayala Atelier/,
    )
  })

  it('charges one flat shipping fee per order, not per item', () => {
    expect(computeTotals([item('p01'), item('p03')], 'delivery').shipping).toBe(SHIPPING_FEE)
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
