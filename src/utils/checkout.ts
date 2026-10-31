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
}

export type Payment = 'ewallet' | 'cash'
export type Provider = 'gcash' | 'maya'

export const SHIPPING_FEE = 99
export const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
]

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

const joinNames = (names: string[]) =>
  names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

// The API lists no sales channels, so a piece with none is not restricted to either.
const isStoreOnly = (i: CheckoutItem) => i.product.channels.length > 0 && !i.product.channels.includes('online')

/** Why these items cannot be ordered: store-only pieces cannot be delivered. Null when all can. */
export function orderBlock(items: CheckoutItem[]): string | null {
  const storeOnly = [...new Set(items.filter(isStoreOnly).map((i) => i.product.name))]
  if (storeOnly.length === 0) return null
  const [they, verb] = storeOnly.length === 1 ? ['it', 'is'] : ['them', 'are']
  return `${joinNames(storeOnly)} ${verb} sold in store only and can't be delivered. Remove ${they} from your order to check out.`
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
    items.push({ product, variantId: line.variantId, size: line.size ?? '', color: line.color ?? '', qty, unit: line.unitPrice })
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

export function computeTotals(items: CheckoutItem[]): Totals {
  const subtotal = items.reduce((sum, i) => sum + i.unit * i.qty, 0)
  const discount = 0 // The API has no sale price; `unit` is already what the variant costs.
  const shipping = SHIPPING_FEE
  return { subtotal, discount, shipping, total: subtotal - discount + shipping }
}

const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** "Arrives Wed, Oct 14 – Fri, Oct 16": three to five days from today. Dates only, so no time zone surprises. */
export function deliveryEta(today = new Date()) {
  const on = (days: number) => DAY.format(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days))
  return `Arrives ${on(3)} – ${on(5)}`
}

export function paymentLabel(payment: Payment, provider: Provider) {
  if (payment === 'ewallet') return `E-Wallet (${PROVIDERS.find((p) => p.value === provider)!.label})`
  return 'Cash on delivery'
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
