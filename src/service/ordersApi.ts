import { SIMULATED_AUTH } from '../config/accountPolicy'
import { ProductListError, request, type ProductListErrorKind } from './fetchProductList'
import { addSampleOrder, allSampleOrders, cancelSampleOrderById, findSampleOrder } from './sampleOrders'
import { getSession } from './session'
import { simulateRequest, type RequestOptions } from './simulateRequest'

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAYMENT_FAILED',
  'PAID',
  'PROCESSING',
  'DISPATCHED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENT_STATUSES = ['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const SHIPMENT_STATUSES = ['QUOTED', 'PENDING_DISPATCH', 'DISPATCHING', 'ASSIGNING_DRIVER', 'ON_GOING', 'PICKED_UP', 'COMPLETED', 'CANCELLED', 'FAILED'] as const
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

export interface CustomerOrderItem {
  id: string
  /** Null once the variant was deleted; such a line cannot be bought again. */
  variantId: string | null
  name: string
  sku: string
  size: string | null
  color: string | null
  unitPrice: number
  qty: number
  total: number
  imageUrl: string | null
}

export interface CustomerShipment {
  courier: string
  serviceType: string
  status: ShipmentStatus
  trackingUrl: string | null
  driverName: string | null
  driverPhone: string | null
  driverPlate: string | null
  deliveryFee: number
  pickupTime: string | null
  deliveredAt: string | null
}

export interface CustomerOrder {
  id: string
  /** SHF-YYYYMMDD-XXXXXX */
  orderNumber: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  subtotal: number
  shipping: number
  discount: number
  total: number
  currency: string
  note: string | null
  /** The address as it was when the order was placed. */
  address: { recipientName: string; phone: string; line: string; city: string; postalCode: string }
  paidAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  createdAt: string
  items: CustomerOrderItem[]
  shipment: CustomerShipment | null
}

export interface OrdersPage {
  data: CustomerOrder[]
  meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean }
}

/** 'no-coordinates': the saved address has no map pin. 'not-cancellable': the order moved on. 'quote-expired': the delivery fee quote ran out or no longer fits. 'simulated' is kept for callers that gate on it. */
export type OrdersErrorKind = ProductListErrorKind | 'simulated' | 'no-coordinates' | 'not-cancellable' | 'quote-expired'

export class OrdersError extends Error {
  kind: OrdersErrorKind
  /** Copy the screen can show as it is (what happened, why, what to do), when the server's answer allows one. */
  detail?: string
  status?: number

  constructor(kind: OrdersErrorKind, detail?: string, status?: number) {
    super(`The orders request failed (${kind}).`)
    this.kind = kind
    this.detail = detail
    this.status = status
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
export const isMoney = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
export const text = (value: unknown) => (typeof value === 'string' && value ? value : null)
export const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value)

function toItem(value: unknown): CustomerOrderItem {
  if (!isRecord(value)) throw new OrdersError('server')
  const { id, productName, variantSku, unitPrice, quantity, totalPrice } = value
  if (typeof id !== 'string' || typeof productName !== 'string' || !isMoney(unitPrice) || !isMoney(quantity) || !isMoney(totalPrice)) throw new OrdersError('server')
  return {
    id,
    variantId: text(value.variantId),
    name: productName,
    sku: typeof variantSku === 'string' ? variantSku : '',
    size: text(value.variantSize),
    color: text(value.variantColor),
    unitPrice,
    qty: quantity,
    total: totalPrice,
    imageUrl: text(value.imageUrl),
  }
}

function toShipment(value: unknown): CustomerShipment | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value) || !oneOf(SHIPMENT_STATUSES, value.status) || typeof value.courier !== 'string') throw new OrdersError('server')
  return {
    courier: value.courier,
    serviceType: typeof value.serviceType === 'string' ? value.serviceType : '',
    status: value.status,
    trackingUrl: text(value.trackingUrl),
    driverName: text(value.driverName),
    driverPhone: text(value.driverPhone),
    driverPlate: text(value.driverPlateNumber),
    deliveryFee: isMoney(value.deliveryFee) ? value.deliveryFee : 0,
    pickupTime: text(value.pickupTime),
    deliveredAt: text(value.deliveredAt),
  }
}

export function toOrder(value: unknown): CustomerOrder {
  if (!isRecord(value) || !isRecord(value.shippingAddressSnapshot) || !Array.isArray(value.items)) throw new OrdersError('server')
  const { id, orderNumber, status, paymentStatus, subtotalAmount, shippingAmount, totalAmount, createdAt } = value
  if (typeof id !== 'string' || typeof orderNumber !== 'string' || typeof createdAt !== 'string') throw new OrdersError('server')
  if (!oneOf(ORDER_STATUSES, status) || !oneOf(PAYMENT_STATUSES, paymentStatus)) throw new OrdersError('server')
  if (!isMoney(subtotalAmount) || !isMoney(shippingAmount) || !isMoney(totalAmount)) throw new OrdersError('server')
  const a = value.shippingAddressSnapshot
  const s = (key: string) => (typeof a[key] === 'string' ? (a[key] as string) : '')
  return {
    id,
    orderNumber,
    status,
    paymentStatus,
    subtotal: subtotalAmount,
    shipping: shippingAmount,
    discount: isMoney(value.discountAmount) ? value.discountAmount : 0,
    total: totalAmount,
    currency: typeof value.currency === 'string' ? value.currency : 'PHP',
    note: text(value.customerNotes),
    address: {
      recipientName: s('recipientName'),
      phone: s('phone'),
      line: [s('streetAddress'), s('addressLine2'), s('barangay')].filter(Boolean).join(', '),
      city: [s('cityMunicipality'), s('province')].filter(Boolean).join(', '),
      postalCode: s('postalCode'),
    },
    paidAt: text(value.paidAt),
    cancelledAt: text(value.cancelledAt),
    cancellationReason: text(value.cancellationReason),
    createdAt,
    items: value.items.map(toItem),
    shipment: toShipment(value.shipment),
  }
}

type Operation = 'create' | 'quote' | 'read' | 'cancel' | 'pay'

const STOCK_WORDS = /stock|unavailable|no longer available|invalid quantity/i

/** Turns the API's failure into one the screen can explain; an abort passes through untouched. */
function toOrdersError(failure: unknown, operation: Operation): unknown {
  if (!(failure instanceof ProductListError)) return failure
  const { kind, detail, status } = failure
  const told = detail ?? ''
  if (kind === 'validation') {
    if (operation === 'cancel') return new OrdersError('not-cancellable', undefined, status)
    if (operation === 'quote' && /coordinates/i.test(told)) return new OrdersError('no-coordinates', 'Pin this address on the map so we can deliver to it.', status)
    if (operation === 'create') {
      if (/coordinates/i.test(told)) return new OrdersError('no-coordinates', 'Pin this address on the map so we can deliver to it.', status)
      if (/quotation/i.test(told)) return new OrdersError('quote-expired', 'The delivery fee ran out before your order went through. Check the new fee, then place your order again.', status)
      if (STOCK_WORDS.test(told)) return new OrdersError('validation', `${told}. Go back to your cart and adjust the quantity.`, status)
      return new OrdersError('validation', 'Your cart changed. Reload your cart, then check out again.', status)
    }
  }
  if (kind === 'not-found' && (operation === 'create' || operation === 'quote')) return new OrdersError('not-found', 'That address is gone. Pick another delivery address.', status)
  if (kind === 'forbidden') return new OrdersError('forbidden', 'Your session ended. Sign in again.', status)
  return new OrdersError(kind, told || undefined, status)
}

async function call(method: 'GET' | 'POST', path: string, body: unknown, signal: AbortSignal | undefined, operation: Operation) {
  try {
    return await request(method, path, body, signal)
  } catch (failure) {
    throw toOrdersError(failure, operation)
  }
}

/** True for a simulated (dev) account: its orders are the in-memory samples, and screens tag them as sample data. */
export const usesSampleOrders = () => SIMULATED_AUTH && !!getSession()?.simulated

/** A simulated account's answer: the in-memory sample orders, after a short wait like a real request. */
const sample = <T>(read: () => T, { signal, delayMs = 300 }: RequestOptions) => simulateRequest(delayMs, signal, () => false).then(read)

export interface CreateOrderInput {
  addressId: string
  cartItemIds?: string[]
  shippingFee?: number
  quotationId?: string
  customerNotes?: string
}

export interface ShippingQuote {
  quotationId: string
  shippingFee: number
  /** When the quote stops being accepted, as an ISO time. */
  expiresAt: string
}

/** Feature: Orders – Quote shipping */
/** POST /orders/quote-shipping. The delivery fee for a saved, pinned address; the API limits it to 20 a minute. */
export async function quoteShipping(addressId: string, { signal }: RequestOptions = {}): Promise<ShippingQuote> {
  const body = await call('POST', '/orders/quote-shipping', { addressId }, signal, 'quote')
  if (!isRecord(body) || typeof body.quotationId !== 'string' || !isMoney(body.shippingFee) || typeof body.expiresAt !== 'string' || Number.isNaN(Date.parse(body.expiresAt))) throw new OrdersError('server')
  return { quotationId: body.quotationId, shippingFee: body.shippingFee, expiresAt: body.expiresAt }
}

/** Feature: Orders – Place order */
/** POST /orders. The API works out every amount, shipping included, so no total, shipping fee, payment method or label is sent (it rejects unknown keys). It takes the `quotationId` of a fee shown to the shopper. `shippingFee` only feeds the sample orders. */
export async function createOrder(input: CreateOrderInput, { signal, delayMs }: RequestOptions = {}): Promise<CustomerOrder> {
  const body = {
    addressId: input.addressId,
    ...(input.cartItemIds && { cartItemIds: input.cartItemIds }),
    ...(input.quotationId && { quotationId: input.quotationId }),
    ...(input.customerNotes && { customerNotes: input.customerNotes }),
  }
  const order = usesSampleOrders()
    ? await sample(() => addSampleOrder({ shippingFee: input.shippingFee, customerNotes: body.customerNotes }), { signal, delayMs })
    : toOrder(await call('POST', '/orders', body, signal, 'create'))
  invalidate()
  return order
}

/** Feature: Orders – Pay for order */
/**
 * POST /orders/:id/checkout-session. Resolves to the payment provider's hosted page; send the browser there.
 * The provider returns the customer to the success page, or to the order if they back out. The API only accepts
 * redirect URLs on an origin in its ALLOWED_ORIGINS.
 */
export async function createCheckoutSession(orderId: string, { signal }: RequestOptions = {}): Promise<string> {
  const body = {
    successUrl: `${window.location.origin}/checkout/success?order=${encodeURIComponent(orderId)}`,
    cancelUrl: `${window.location.origin}/orders/${encodeURIComponent(orderId)}`,
  }
  const result = await call('POST', `/orders/${encodeURIComponent(orderId)}/checkout-session`, body, signal, 'pay')
  const url = isRecord(result) && typeof result.checkoutUrl === 'string' ? result.checkoutUrl : ''
  // Only ever send the browser to a secure page.
  if (!URL.canParse(url) || new URL(url).protocol !== 'https:') throw new OrdersError('server')
  return url
}

/** Feature: Orders – List orders */
/** GET /orders?page&limit&status, newest first. */
export async function fetchOrdersPage(
  { page = 1, limit = 10, status }: { page?: number; limit?: number; status?: OrderStatus },
  { signal, delayMs }: RequestOptions = {},
): Promise<OrdersPage> {
  if (usesSampleOrders()) {
    return sample(() => {
      const matching = allSampleOrders().filter((order) => !status || order.status === status)
      const totalPages = Math.ceil(matching.length / limit)
      return { data: matching.slice((page - 1) * limit, page * limit), meta: { total: matching.length, page, limit, totalPages, hasNextPage: page < totalPages } }
    }, { signal, delayMs })
  }
  const query = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (status) query.set('status', status)
  const body = await call('GET', `/orders?${query}`, undefined, signal, 'read')
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || !isMoney(meta.total)) throw new OrdersError('server')
  return {
    data: body.data.map(toOrder),
    meta: {
      total: meta.total,
      page: Number(meta.page) || page,
      limit: Number(meta.limit) || limit,
      totalPages: Number(meta.totalPages) || 0,
      hasNextPage: meta.hasNextPage === true,
    },
  }
}

/** Feature: Orders – View order */
/** GET /orders/:id. A 404 also means the order belongs to someone else. */
export async function fetchOrder(id: string, { signal, delayMs }: RequestOptions = {}): Promise<CustomerOrder> {
  if (usesSampleOrders()) {
    return sample(() => {
      const found = findSampleOrder(id)
      if (!found) throw new OrdersError('not-found')
      return found
    }, { signal, delayMs })
  }
  return toOrder(await call('GET', `/orders/${encodeURIComponent(id)}`, undefined, signal, 'read'))
}

/** Feature: Orders – Cancel order */
/** POST /orders/:id/cancel. Only an unpaid PENDING_PAYMENT order can be cancelled; anything else is 'not-cancellable'. */
export async function cancelOrder(id: string, reason?: string, { signal, delayMs }: RequestOptions = {}): Promise<CustomerOrder> {
  const body = reason ? { cancellationReason: reason } : {}
  const order = usesSampleOrders()
    ? await sample(() => {
        const cancelled = cancelSampleOrderById(id, reason)
        if (!cancelled) throw new OrdersError(findSampleOrder(id) ? 'not-cancellable' : 'not-found')
        return cancelled
      }, { signal, delayMs })
    : toOrder(await call('POST', `/orders/${encodeURIComponent(id)}/cancel`, body, signal, 'cancel'))
  invalidate()
  return order
}

// Every order, per signed-in email so two accounts in one tab never see each other's orders.
const TTL_MS = 30_000
const PAGE_LIMIT = 100
const MAX_PAGES = 5
let cache: { owner: string; list: CustomerOrder[]; at: number } | null = null
let inflight: { owner: string; promise: Promise<CustomerOrder[]> } | null = null
// Bumped by every new read and every change, so a read that finishes late never overwrites newer data.
let generation = 0
const listeners = new Set<() => void>()

const owner = () => getSession()?.email ?? ''
const aborted = () => new DOMException('The request was aborted.', 'AbortError')

function invalidate() {
  generation += 1
  cache = null
  inflight = null
  listeners.forEach((run) => run())
}

/** Forgets the cached orders (sign out). */
export function clearOrdersCache() {
  generation += 1
  cache = null
  inflight = null
}

/** Calls `run` whenever an order is placed or cancelled, so a page that already read the list can refresh. Returns the unsubscribe. */
export function onOrdersChanged(run: () => void): () => void {
  listeners.add(run)
  return () => {
    listeners.delete(run)
  }
}

async function readAll(): Promise<CustomerOrder[]> {
  const all: CustomerOrder[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await fetchOrdersPage({ page, limit: PAGE_LIMIT })
    all.push(...result.data)
    if (!result.meta.hasNextPage) break
  }
  return all
}

/**
 * Every order, newest first (up to 500), through a 30-second cache. The API has no search, date filter or counts, so the
 * tabs, counts and search all work on this list. Concurrent callers share one request; aborting stops that caller waiting.
 * `force` always asks the server. A failure is never cached.
 */
export function loadAllOrders({ signal, force = false }: { signal?: AbortSignal; force?: boolean } = {}): Promise<CustomerOrder[]> {
  const who = owner()
  let shared: Promise<CustomerOrder[]>
  if (!force && cache && cache.owner === who && Date.now() - cache.at < TTL_MS) {
    shared = Promise.resolve(cache.list)
  } else if (!force && inflight && inflight.owner === who) {
    shared = inflight.promise
  } else {
    const mine = ++generation
    const promise = readAll()
    inflight = { owner: who, promise }
    shared = promise
    promise.then(
      (list) => {
        if (mine !== generation) return
        cache = { owner: who, list, at: Date.now() }
        inflight = null
      },
      () => {
        if (mine === generation) inflight = null
      },
    )
  }
  if (!signal) return shared
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(aborted())
    signal.addEventListener('abort', () => reject(aborted()), { once: true })
    shared.then(resolve, reject)
  })
}

/** The cached list when it is still fresh, for an instant first paint. */
export function getCachedOrders(): CustomerOrder[] | null {
  return cache && cache.owner === owner() && Date.now() - cache.at < TTL_MS ? cache.list : null
}

/** An order in the cached list, whatever its age: the detail page paints it first, then reads the server's. */
export function getCachedOrder(id: string): CustomerOrder | null {
  return cache && cache.owner === owner() ? (cache.list.find((order) => order.id === id) ?? null) : null
}
