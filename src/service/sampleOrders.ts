import type { CustomerOrder, CustomerOrderItem } from './ordersApi'

// Placeholder orders for the simulated (dev) accounts, which have no Supabase token to reach the API with. Kept in memory
// only, so a reload starts again and nothing personal is stored. One order per status family, newest first.
const ADDRESS: CustomerOrder['address'] = {
  recipientName: 'Sample Customer',
  phone: '+639170000000',
  line: '123 Sample Street, Barangay Sample',
  city: 'City of Sample, Metro Manila',
  postalCode: '0000',
}

const line = (n: number, name: string, size: string | null, color: string | null, unitPrice: number, qty: number): CustomerOrderItem => ({
  id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
  variantId: `00000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`,
  name,
  sku: `SAMPLE-${n}`,
  size,
  color,
  unitPrice,
  qty,
  total: unitPrice * qty,
  imageUrl: null,
})

function order(n: number, day: string, over: Partial<CustomerOrder> & Pick<CustomerOrder, 'status' | 'paymentStatus' | 'items'>): CustomerOrder {
  const subtotal = over.items.reduce((sum, item) => sum + item.total, 0)
  return {
    id: `00000000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`,
    orderNumber: `SHF-${day.replaceAll('-', '')}-SAMPL${n}`,
    subtotal,
    shipping: 99,
    discount: 0,
    total: subtotal + 99,
    currency: 'PHP',
    note: null,
    address: ADDRESS,
    paidAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: `${day}T02:30:00.000Z`,
    shipment: null,
    ...over,
  }
}

const seed = (): CustomerOrder[] => [
  order(1, '2026-11-06', { status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID', items: [line(1, 'Linen Camp Shirt', 'M', 'Sand', 1890, 1), line(2, 'Pleated Trousers', '32', 'Charcoal', 2490, 1)] }),
  order(2, '2026-11-04', {
    status: 'PROCESSING',
    paymentStatus: 'PAID',
    paidAt: '2026-11-04T03:00:00.000Z',
    items: [line(3, 'Ribbed Knit Polo', 'L', 'Navy', 1590, 2)],
  }),
  order(3, '2026-11-01', {
    status: 'OUT_FOR_DELIVERY',
    paymentStatus: 'PAID',
    paidAt: '2026-11-01T03:00:00.000Z',
    items: [line(4, 'Wool Overcoat', 'M', 'Black', 6890, 1)],
    shipment: {
      courier: 'Sample Express',
      serviceType: 'Same day',
      status: 'ON_GOING',
      trackingUrl: 'https://example.com/track/SAMPLE',
      driverName: 'Sample Driver',
      driverPhone: '+639170000001',
      driverPlate: 'SAM 1234',
      deliveryFee: 99,
      pickupTime: '2026-11-02T01:00:00.000Z',
      deliveredAt: null,
    },
  }),
  order(4, '2026-10-20', {
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    paidAt: '2026-10-20T03:00:00.000Z',
    items: [line(5, 'Everyday Tee', 'S', 'White', 790, 3), line(6, 'Canvas Belt', null, 'Olive', 690, 1)],
    shipment: {
      courier: 'Sample Express',
      serviceType: 'Standard',
      status: 'COMPLETED',
      trackingUrl: null,
      driverName: null,
      driverPhone: null,
      driverPlate: null,
      deliveryFee: 99,
      pickupTime: '2026-10-21T01:00:00.000Z',
      deliveredAt: '2026-10-23T08:00:00.000Z',
    },
  }),
  order(5, '2026-10-12', {
    status: 'CANCELLED',
    paymentStatus: 'UNPAID',
    cancelledAt: '2026-10-12T05:00:00.000Z',
    cancellationReason: 'Ordered the wrong size.',
    items: [line(7, 'Slim Chinos', '30', 'Khaki', 1990, 1)],
  }),
  order(6, '2026-09-28', {
    status: 'REFUNDED',
    paymentStatus: 'REFUNDED',
    paidAt: '2026-09-28T03:00:00.000Z',
    items: [line(8, 'Denim Jacket', 'L', 'Indigo', 3290, 1)],
  }),
]

let store = seed()

/** Back to the six starting orders. For tests. */
export function resetSampleOrders() {
  store = seed()
}

export const allSampleOrders = () => store

export const findSampleOrder = (id: string) => store.find((o) => o.id === id) ?? null

/** A new PENDING_PAYMENT order with one stand-in item: the sample store has no cart to read. */
export function addSampleOrder({ shippingFee, customerNotes }: { shippingFee?: number; customerNotes?: string }): CustomerOrder {
  const next = order(store.length + 1, new Date().toISOString().slice(0, 10), {
    status: 'PENDING_PAYMENT',
    paymentStatus: 'UNPAID',
    items: [line(9, 'Linen Camp Shirt', 'M', 'Sand', 1890, 1)],
    shipping: shippingFee ?? 99,
    note: customerNotes ?? null,
  })
  next.id = crypto.randomUUID()
  next.total = next.subtotal + next.shipping
  next.createdAt = new Date().toISOString()
  store = [next, ...store]
  return next
}

/** Cancels an unpaid PENDING_PAYMENT order; null when there is no such order or it has moved on. */
export function cancelSampleOrderById(id: string, reason?: string): CustomerOrder | null {
  const found = findSampleOrder(id)
  if (!found || found.status !== 'PENDING_PAYMENT' || found.paymentStatus === 'PAID') return null
  const cancelled: CustomerOrder = { ...found, status: 'CANCELLED', cancelledAt: new Date().toISOString(), cancellationReason: reason ?? null }
  store = store.map((o) => (o.id === id ? cancelled : o))
  return cancelled
}
