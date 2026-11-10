import type { Product } from '../data/products'
import type { Line } from '../hooks/useCart'

export interface CheckoutItem {
  product: Product
  variantId: string
  /** Empty when the variant has no size (or colour). */
  size: string
  color: string
  qty: number
  /** The variant's price. */
  unit: number
  /** The server cart's item id, which the order API takes. Missing for a Buy now piece until it is put in the cart. */
  itemId?: string
}

export type Payment = 'ewallet' | 'cash'
export type Provider = 'gcash' | 'maya'

/** The sample orders' shipping rule: a flat fee, free once the subtotal reaches the threshold. Real orders use the quoted delivery fee. */
export const SHIPPING_FEE = 150
export const FREE_SHIPPING_THRESHOLD = 2500

/**
 * The items to check out, from the URL: one piece, or several as repeated item/variant/qty params in the same order.
 * Every param is untrusted: each piece must be among `products` (loaded in full), its variant must be one it has and its
 * quantity must be 1 up to that variant's stock. If any item fails, or a variant repeats, there are no items.
 */
export function parseCheckoutItems(params: URLSearchParams, products: Product[]): CheckoutItem[] {
  const ids = params.getAll('item')
  const items: CheckoutItem[] = []
  for (const [i, id] of ids.entries()) {
    const product = products.find((p) => p.id === id)
    const variantId = params.getAll('variant')[i] ?? ''
    const variant = product?.variants?.find((v) => v.id === variantId)
    const qtyText = params.getAll('qty')[i] ?? '1'
    const qty = /^\d{1,3}$/.test(qtyText) ? Number(qtyText) : 0
    if (!product || !variant || qty < 1 || qty > variant.stock || items.some((item) => item.variantId === variantId)) return []
    items.push({ product, variantId, size: variant.size ?? '', color: variant.color ?? '', qty, unit: variant.price })
  }
  return items
}

/**
 * Turns the cart's lines into the items to check out. Lines that cannot be bought are left out, each with a notice;
 * quantities are lowered to the variant's stock. `products` are the lines' pieces, loaded in full.
 */
export function resolveCartItems(lines: Line[], products: Product[]): { items: CheckoutItem[]; notices: string[] } {
  const items: CheckoutItem[] = []
  const notices: string[] = []
  for (const line of lines) {
    const product = products.find((p) => p.id === line.productId)
    if (!line.active || !product) {
      notices.push(`${line.name} is no longer available, so it was left out.`)
      continue
    }
    if (line.stock === 0) {
      notices.push(`${line.name} is sold out, so it was left out.`)
      continue
    }
    const qty = Math.min(line.qty, line.stock)
    if (qty < line.qty) notices.push(`${line.name}: Quantity lowered to ${qty}.`)
    items.push({ product, variantId: line.variantId, size: line.size ?? '', color: line.color ?? '', qty, unit: line.unitPrice, itemId: line.itemId })
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

/** `quotedFee` is the delivery fee quoted for a real order (0 is a real fee); without it the sample orders' flat rule applies. */
export function computeTotals(items: CheckoutItem[], quotedFee?: number): Totals {
  const subtotal = items.reduce((sum, i) => sum + i.unit * i.qty, 0)
  const discount = 0 // The API has no sale price; `unit` is already what the variant costs.
  const shipping = quotedFee ?? (subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE)
  return { subtotal, discount, shipping, total: subtotal - discount + shipping }
}

const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** "Arrives Wed, Oct 14 – Fri, Oct 16": three to five days from today. Dates only, so no time zone surprises. */
export function deliveryEta(today = new Date()) {
  const on = (days: number) => DAY.format(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days))
  return `Arrives ${on(3)} – ${on(5)}`
}

// The last placed order, for the success page. Session storage: gone when the tab closes.
const ORDER_KEY = 'silhoufit-last-order'

/**
 * What the success page shows. For a delivery order this holds the recipient, address and phone, which is personal
 * data: it lives in session storage (this tab only) and is cleared when the success page is left and on sign-out.
 */
export interface PlacedOrder {
  orderId: string
  /** When the order was placed, as an ISO time. */
  placedAt?: string
  items: { name: string; size: string; color: string; qty: number; price: number; arReady: boolean }[]
  total: number
  /** The total the checkout page showed; the success page says so when the server's total differs. */
  quotedTotal?: number
  shipping: number
  payment: string
  fulfilment: string
  eta: string
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
