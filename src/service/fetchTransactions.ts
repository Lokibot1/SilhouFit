import type { VatClass } from '../utils/invoiceTax'

// The sample order shapes behind the Invoice, the dashboard figures and Returns & Refunds. The Transactions list itself reads
// /admin/transactions (adminTransactionsApi.ts).

export const PAYMENT_METHODS = ['gcash', 'maya', 'cod'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** A business buyer, present only when the buyer's TIN was supplied. Orders without one are walk-in sales. */
export interface Buyer {
  name: string
  tin: string
  address: string
}

/** Why a customer sent an order back. */
export const RETURN_REASONS = ['Wrong size', 'Defective item', 'Not as described', 'Changed mind', 'Damaged on delivery'] as const
export type ReturnReason = (typeof RETURN_REASONS)[number]

export interface TransactionListItem {
  id: string
  /** The number staff and customers read out, e.g. "SF-10187". */
  orderNo: string
  customerName: string
  /** ISO time. */
  placedAt: string
  itemCount: number
  total: number
  /** How the order was paid; a list from the API may leave it out. */
  paymentMethod?: PaymentMethod
  /** Set only on a returned order: the customer sent the product back and was refunded in full. The three fields come together, and `refundAmount` equals `total`. */
  returnedAt?: string
  returnReason?: ReturnReason
  refundAmount?: number
}

export interface TransactionLine {
  productId: string
  name: string
  category: string
  units: number
  unitPrice: number
  /** How the line is taxed; a missing value is 'vatable'. */
  vatClass?: VatClass
  /** The product's photo; left out when it has none. */
  imageUrl?: string
}

/** How to reach the customer on an order. `address` is missing when the customer has none saved. */
export interface CustomerContact {
  email: string
  phone: string
  address?: string
}

export interface TransactionDetail extends TransactionListItem {
  customer?: CustomerContact
  lines: TransactionLine[]
  subtotal: number
  paymentMethod?: PaymentMethod
  /** The method's name when the order came from the API, whose methods are more than the sample three. */
  paymentLabel?: string
  buyer?: Buyer
}

export interface TransactionSummary {
  count: number
  /** Sum of the totals of the orders that were not returned, VAT included. */
  gross: number
  /** The 12% VAT portion of `gross`, summed per order. */
  vat: number
  /** How many of the `count` orders were returned. They are in `count` but not in `gross` or `vat`. */
  returnedCount: number
}
