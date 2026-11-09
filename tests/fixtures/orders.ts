import type { CustomerOrder, CustomerOrderItem, OrderStatus } from '../../src/service/ordersApi'

export const ORDER_ID = '00000000-0000-4000-8000-000000000301'

export const orderItem = (over: Partial<CustomerOrderItem> = {}): CustomerOrderItem => ({
  id: '00000000-0000-4000-8000-000000000101',
  variantId: '00000000-0000-4000-8000-000000000201',
  name: 'Heritage Polo',
  sku: 'POLO-M-NAVY',
  size: 'M',
  color: 'Navy',
  unitPrice: 1890,
  qty: 2,
  total: 3780,
  imageUrl: null,
  ...over,
})

/** An order as the app holds it (a CustomerOrder), unpaid by default. */
export const customerOrder = (over: Partial<CustomerOrder> = {}): CustomerOrder => ({
  id: ORDER_ID,
  orderNumber: 'SHF-20261026-ABC123',
  status: 'PENDING_PAYMENT',
  paymentStatus: 'UNPAID',
  subtotal: 3780,
  shipping: 99,
  discount: 0,
  total: 3879,
  currency: 'PHP',
  note: null,
  address: { recipientName: 'Anne Santos', phone: '+639171234567', line: '12 Rizal Avenue, Barangay 176', city: 'City of Manila', postalCode: '1000' },
  paidAt: null,
  cancelledAt: null,
  cancellationReason: null,
  createdAt: '2026-10-26T02:30:00.000Z',
  items: [orderItem()],
  shipment: null,
  ...over,
})

/** The same order as the API sends it. */
export const apiOrder = (over: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  orderNumber: 'SHF-20261026-ABC123',
  userId: 'u1',
  status: 'PENDING_PAYMENT',
  paymentStatus: 'UNPAID',
  currency: 'PHP',
  subtotalAmount: 3780,
  shippingAmount: 99,
  discountAmount: 0,
  totalAmount: 3879,
  customerNotes: null,
  shippingAddressSnapshot: {
    id: 'a1',
    recipientName: 'Anne Santos',
    phone: '+639171234567',
    region: 'NCR',
    province: null,
    cityMunicipality: 'City of Manila',
    barangay: 'Barangay 176',
    streetAddress: '12 Rizal Avenue',
    addressLine2: null,
    postalCode: '1000',
    latitude: 14.6,
    longitude: 120.98,
    label: 'Home',
  },
  paymentProvider: null,
  paymentCheckoutId: null,
  paidAt: null,
  cancelledAt: null,
  cancellationReason: null,
  createdAt: '2026-10-26T02:30:00.000Z',
  updatedAt: '2026-10-26T02:30:00.000Z',
  items: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      orderId: ORDER_ID,
      variantId: '00000000-0000-4000-8000-000000000201',
      productName: 'Heritage Polo',
      variantSku: 'POLO-M-NAVY',
      variantSize: 'M',
      variantColor: 'Navy',
      unitPrice: 1890,
      quantity: 2,
      totalPrice: 3780,
      imageUrl: null,
      createdAt: '2026-10-26T02:30:00.000Z',
      updatedAt: '2026-10-26T02:30:00.000Z',
    },
  ],
  shipment: null,
  ...over,
})

export const shipment = (over: Partial<NonNullable<CustomerOrder['shipment']>> = {}): NonNullable<CustomerOrder['shipment']> => ({
  courier: 'Lalamove',
  serviceType: 'Motorcycle',
  status: 'ON_GOING',
  trackingUrl: 'https://example.com/track/123',
  driverName: 'Juan Dela Cruz',
  driverPhone: '+639171112222',
  driverPlate: 'ABC 1234',
  deliveryFee: 99,
  pickupTime: '2026-10-27T02:00:00.000Z',
  deliveredAt: null,
  ...over,
})

export const ALL_STATUSES: OrderStatus[] = ['PENDING_PAYMENT', 'PAYMENT_FAILED', 'PAID', 'PROCESSING', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED']
