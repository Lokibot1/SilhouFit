import { sizesFor, type Product } from '../data/products'
import type { Line } from '../hooks/useCart'

export interface CheckoutItem {
  product: Product
  size: string
  color: string
  qty: number
}

export type Fulfilment = 'delivery' | 'pickup'
export type Payment = 'ewallet' | 'cash'
export type Provider = 'gcash' | 'maya'

export const SHIPPING_FEE = 99
export const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
]

/**
 * The items to check out, from the URL: one piece, or several as repeated item/size/color/qty params in the same
 * order. Every param is untrusted: each piece must exist, its size and colour must be ones it offers and its
 * quantity must be 1 up to its stock. If any item fails, or a piece repeats, there are no items.
 */
export function parseCheckoutItems(params: URLSearchParams, catalogue: Product[]): CheckoutItem[] {
  const ids = params.getAll('item')
  const items: CheckoutItem[] = []
  for (const [i, id] of ids.entries()) {
    const product = catalogue.find((p) => p.id === id)
    const size = params.getAll('size')[i] ?? ''
    const color = params.getAll('color')[i] ?? ''
    const qtyText = params.getAll('qty')[i] ?? '1'
    const qty = /^\d{1,3}$/.test(qtyText) ? Number(qtyText) : 0
    if (!product || !sizesFor(product).includes(size) || !product.colors.some((c) => c.name === color)) return []
    if (qty < 1 || qty > product.stock || items.some((item) => item.product.id === id)) return []
    items.push({ product, size, color, qty })
  }
  return items
}

const joinNames = (names: string[]) =>
  names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** Why an option cannot be chosen, or null when it can. Several items must all allow it. */
export function fulfilmentAvailability(items: CheckoutItem[]): Record<Fulfilment, string | null> {
  const storeOnly = items.find((i) => !i.product.channels.includes('online'))
  const onlineOnly = items.find((i) => !i.product.channels.includes('store'))
  const boutiques = [...new Set(items.map((i) => i.product.boutique))]
  return {
    delivery: storeOnly ? `Store-only piece. Pick it up at ${storeOnly.product.boutique}.` : null,
    pickup: onlineOnly
      ? 'Sold online only.'
      : boutiques.length > 1
        ? `Pickup works for one boutique per order. These pieces are at ${joinNames(boutiques)}.`
        : null,
  }
}

/** When neither option works for these items together, why, so the order can be split. Otherwise null. */
export function orderBlock(items: CheckoutItem[]): string | null {
  const { delivery, pickup } = fulfilmentAvailability(items)
  if (delivery === null || pickup === null) return null
  const names = (test: (i: CheckoutItem) => boolean) => [...new Set(items.filter(test).map((i) => i.product.name))]
  const storeOnly = names((i) => !i.product.channels.includes('online'))
  const onlineOnly = names((i) => !i.product.channels.includes('store'))
  const verb = (list: string[]) => (list.length === 1 ? 'is' : 'are')
  const boutiques = [...new Set(items.map((i) => i.product.boutique))]
  const why = onlineOnly.length
    ? `${joinNames(storeOnly)} ${verb(storeOnly)} store-only and ${joinNames(onlineOnly)} ${verb(onlineOnly)} online-only.`
    : `${joinNames(storeOnly)} ${verb(storeOnly)} store-only, but the pieces come from ${joinNames(boutiques)} and pickup works for one boutique per order.`
  return `These pieces can't go in one order: ${why} Check them out separately.`
}

export function defaultFulfilment(items: CheckoutItem[]): Fulfilment {
  const { delivery, pickup } = fulfilmentAvailability(items)
  return delivery === null || pickup !== null ? 'delivery' : 'pickup'
}

/**
 * Turns the cart's lines into the items to check out. Lines that cannot be bought are left out, each with a notice;
 * quantities are lowered to what is in stock, with all of a piece's lines together within its stock.
 */
export function resolveCartItems(lines: Line[], catalogue: Product[]): { items: CheckoutItem[]; notices: string[] } {
  const items: CheckoutItem[] = []
  const notices: string[] = []
  const taken = new Map<string, number>()
  for (const line of lines) {
    const product = catalogue.find((p) => p.id === line.id)
    if (!product) {
      notices.push('A piece in your cart is no longer in the catalogue, so it was left out.')
      continue
    }
    if (product.stock === 0) {
      notices.push(`${product.name} is sold out, so it was left out.`)
      continue
    }
    if (!line.size || !line.color || !sizesFor(product).includes(line.size) || !product.colors.some((c) => c.name === line.color)) {
      notices.push(`${product.name} has no size or colour chosen, so it was left out. Add it again from the shop.`)
      continue
    }
    const room = product.stock - (taken.get(product.id) ?? 0)
    if (room <= 0) {
      notices.push(`${product.name} (${line.size}, ${line.color}): no more in stock, so it was left out.`)
      continue
    }
    const qty = Math.min(line.qty, room)
    if (qty < line.qty) notices.push(`${product.name} (${line.size}, ${line.color}): Quantity lowered to ${qty}.`)
    taken.set(product.id, (taken.get(product.id) ?? 0) + qty)
    items.push({ product, size: line.size, color: line.color, qty })
  }
  return { items, notices }
}

export interface Totals {
  /** At the original price. */
  subtotal: number
  /** What the sale takes off; zero without one. */
  discount: number
  shipping: number
  total: number
}

export function computeTotals(items: CheckoutItem[], fulfilment: Fulfilment): Totals {
  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.qty, 0)
  const discount = items.reduce((sum, i) => sum + (i.product.price - (i.product.salePrice ?? i.product.price)) * i.qty, 0)
  const shipping = fulfilment === 'delivery' ? SHIPPING_FEE : 0
  return { subtotal, discount, shipping, total: subtotal - discount + shipping }
}

const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** "Arrives Wed, Oct 14 – Fri, Oct 16": three to five days from today. Dates only, so no time zone surprises. */
export function deliveryEta(today = new Date()) {
  const on = (days: number) => DAY.format(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days))
  return `Arrives ${on(3)} – ${on(5)}`
}

export const pickupEta = (items: CheckoutItem[]) =>
  `Ready at ${[...new Set(items.map((i) => i.product.boutique))].join(', ')} tomorrow from 2:00 PM`

export function paymentLabel(payment: Payment, fulfilment: Fulfilment, provider: Provider) {
  if (payment === 'ewallet') return `E-Wallet (${PROVIDERS.find((p) => p.value === provider)!.label})`
  return fulfilment === 'delivery' ? 'Cash on delivery' : 'Pay at pickup'
}

// The last placed order, for the success page. Session storage: gone when the tab closes.
const ORDER_KEY = 'silhoufit-last-order'

/**
 * What the success page shows. For a delivery order this holds the recipient, address and phone, which is personal
 * data: it lives in session storage (this tab only) and is cleared when the success page is left and on sign-out.
 */
export interface PlacedOrder {
  orderId: string
  items: { name: string; size: string; color: string; qty: number; price: number; arReady: boolean }[]
  total: number
  shipping: number
  payment: string
  fulfilment: string
  eta: string
  /** Pickup orders: the boutique to collect from. */
  pickupAt?: string
  /** Delivery orders. */
  recipient?: string
  address?: string
  phone?: string
  note?: string
}

export function clearLastOrder() {
  try {
    sessionStorage.removeItem(ORDER_KEY)
  } catch {
    // Nothing to clear.
  }
}

export function saveLastOrder(order: PlacedOrder) {
  try {
    sessionStorage.setItem(ORDER_KEY, JSON.stringify(order))
  } catch {
    // Blocked: the success page then shows its empty state.
  }
}

export function loadLastOrder(): PlacedOrder | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ORDER_KEY) ?? 'null') as Partial<PlacedOrder> | null
    if (!parsed || typeof parsed.orderId !== 'string' || !Array.isArray(parsed.items) || typeof parsed.total !== 'number') return null
    return parsed as PlacedOrder
  } catch {
    return null
  }
}
