import { describe, expect, it } from 'vitest'
import { ORDER_STATUSES, PAYMENT_STATUSES, SHIPMENT_STATUSES, type OrderStatus, type PaymentStatus, type ShipmentStatus } from '../../src/service/ordersApi'
import { canCancelDelivery, canStartPreparing, cancelOrderBlock, dispatchBlock, isClosed, RIDER_BOOKING_WHY } from '../../src/utils/orders'

type Booking = { status: ShipmentStatus; externalOrderId: string | null } | null

// Every order the staff screen could meet: each status with each payment status, with no shipment and with each shipment status booked or not.
const BOOKINGS: Booking[] = [null, ...SHIPMENT_STATUSES.flatMap((status) => [{ status, externalOrderId: null }, { status, externalOrderId: 'LLM-1' }])]
const ORDERS = ORDER_STATUSES.flatMap((status) => PAYMENT_STATUSES.flatMap((paymentStatus) => BOOKINGS.map((shipment) => ({ status, paymentStatus, shipment }))))
const order = (status: OrderStatus, paymentStatus: PaymentStatus, shipment: Booking = null) => ({ status, paymentStatus, shipment })
const booked = (status: ShipmentStatus): Booking => ({ status, externalOrderId: 'LLM-1' })

describe('Book rider', () => {
  it('is on for a paid order that is Paid or Preparing with a shipment that is not booked', () => {
    for (const status of ['PAID', 'PROCESSING'] as const) {
      for (const shipment of ['QUOTED', 'PENDING_DISPATCH', 'CANCELLED', 'FAILED'] as const) {
        expect(dispatchBlock(order(status, 'PAID', { status: shipment, externalOrderId: null }))).toBeNull()
      }
    }
  })

  it('is on again after the delivery was cancelled', () => {
    expect(dispatchBlock(order('PROCESSING', 'PAID', booked('CANCELLED')))).toBeNull()
  })

  it('says why it is off', () => {
    expect(dispatchBlock(order('PENDING_PAYMENT', 'UNPAID', { status: 'QUOTED', externalOrderId: null }))).toBe('Book a rider once the payment is confirmed.')
    expect(dispatchBlock(order('PROCESSING', 'PAID'))).toBe('This order has no delivery to book.')
    expect(dispatchBlock(order('PROCESSING', 'PAID', { status: 'DISPATCHING', externalOrderId: null }))).toBe('A rider is being booked for this order.')
    expect(dispatchBlock(order('PROCESSING', 'PAID', booked('ASSIGNING_DRIVER')))).toBe('A rider is already booked for this order.')
    expect(dispatchBlock(order('DISPATCHED', 'PAID', booked('ON_GOING')))).toBe('A rider is already booked for this order.')
    expect(dispatchBlock(order('DELIVERED', 'PAID', booked('COMPLETED')))).toBe('This order is closed.')
  })

  it('is on exactly when the API would take it', () => {
    for (const o of ORDERS) {
      const takes =
        o.paymentStatus === 'PAID' &&
        (o.status === 'PAID' || o.status === 'PROCESSING') &&
        !!o.shipment &&
        ['QUOTED', 'PENDING_DISPATCH', 'CANCELLED', 'FAILED'].includes(o.shipment.status)
      expect(dispatchBlock(o) === null, JSON.stringify(o)).toBe(takes)
    }
  })
})

describe('Start preparing', () => {
  it('is on only for an order that is Paid and paid', () => {
    for (const o of ORDERS) {
      expect(canStartPreparing(o), JSON.stringify(o)).toBe(o.status === 'PAID' && o.paymentStatus === 'PAID')
    }
  })

  it('has a wait reason while a rider is being booked', () => {
    expect(RIDER_BOOKING_WHY).toBe('A rider is being booked. Wait for it to finish.')
  })
})

describe('Cancel order', () => {
  const PAID_WHY = "Paid orders can't be cancelled here. Refunds go through the payment provider."

  it('is on for an open unpaid order', () => {
    expect(cancelOrderBlock(order('PENDING_PAYMENT', 'UNPAID'))).toBeNull()
    expect(cancelOrderBlock(order('PAYMENT_FAILED', 'UNPAID'))).toBeNull()
  })

  it('is off for an open paid order, with or without a rider', () => {
    expect(cancelOrderBlock(order('PAID', 'PAID', { status: 'QUOTED', externalOrderId: null }))).toBe(PAID_WHY)
    expect(cancelOrderBlock(order('PROCESSING', 'PAID', booked('CANCELLED')))).toBe(PAID_WHY)
    expect(cancelOrderBlock(order('DISPATCHED', 'PAID', booked('ON_GOING')))).toBe(PAID_WHY)
    expect(cancelOrderBlock(order('PROCESSING', 'PAID', { status: 'DISPATCHING', externalOrderId: null }))).toBe(PAID_WHY)
  })

  it('is off for a closed order', () => {
    for (const status of ['DELIVERED', 'CANCELLED', 'REFUNDED'] as const) expect(cancelOrderBlock(order(status, 'PAID'))).toBe('This order is closed.')
  })

  it('is never on for a closed order or a paid one', () => {
    for (const o of ORDERS) {
      if (cancelOrderBlock(o) !== null) continue
      expect(isClosed(o), JSON.stringify(o)).toBe(false)
      expect(o.paymentStatus, JSON.stringify(o)).not.toBe('PAID')
    }
  })
})

describe('Cancel delivery', () => {
  it('is on while a rider is booked and the order is not delivered', () => {
    for (const status of ['ASSIGNING_DRIVER', 'ON_GOING', 'PICKED_UP', 'FAILED'] as const) {
      expect(canCancelDelivery(order('DISPATCHED', 'PAID', booked(status)))).toBe(true)
    }
  })

  it('is off with no booking, a finished or cancelled one, or a delivered order', () => {
    expect(canCancelDelivery(order('PROCESSING', 'PAID'))).toBe(false)
    expect(canCancelDelivery(order('PROCESSING', 'PAID', { status: 'QUOTED', externalOrderId: null }))).toBe(false)
    expect(canCancelDelivery(order('DISPATCHED', 'PAID', booked('COMPLETED')))).toBe(false)
    expect(canCancelDelivery(order('PROCESSING', 'PAID', booked('CANCELLED')))).toBe(false)
    expect(canCancelDelivery(order('DELIVERED', 'PAID', booked('ON_GOING')))).toBe(false)
  })
})
