import { isMerchantComplete, type InvoiceRecord, type MerchantProfile } from '../service/fetchInvoice'
import type { Buyer, PaymentMethod, TransactionDetail } from '../service/fetchTransactions'

// Money here is whole centavos (integers), so sums never drift. Prices in an order are VAT-inclusive.

export const VAT_CLASSES = ['vatable', 'exempt', 'zero'] as const
export type VatClass = (typeof VAT_CLASSES)[number]

export const INVOICE_NOTICE =
  'Format follows BIR invoice guidelines. Validity depends on your BIR registration and Permit to Use. Not transmitted to the BIR.'

/** Shown wherever a returned order's invoice is. The sample never issues a credit note. */
export const RETURN_NOTICE = 'Credit note / BIR return handling is not generated yet; consult your accountant.'

export const PAYMENT_LABELS: Record<PaymentMethod, string> = { gcash: 'GCash', maya: 'Maya', cod: 'Cash on delivery' }

/** How the invoice names the payment: the real method's own label when it has one, else the sample method's. */
export const paymentText = ({ paymentLabel, paymentMethod }: Pick<Invoice, 'paymentLabel' | 'paymentMethod'>) =>
  paymentLabel ?? (paymentMethod ? PAYMENT_LABELS[paymentMethod] : 'Not recorded')

/** 1290.5 -> 129050. */
export const toCentavos = (pesos: number) => Math.round(pesos * 100)

export interface InvoiceTotals {
  vatableSales: number
  vatExempt: number
  zeroRated: number
  vatAmount: number
  /** VAT-inclusive. Always vatableSales + vatAmount + vatExempt + zeroRated for a VAT-registered seller. */
  totalDue: number
}

/**
 * The tax split of an invoice, worked out once on the whole VATable gross (not per line), so the parts always add up:
 * vatableSales = gross / 1.12 rounded half up to the centavo, and the VAT is whatever is left of the gross.
 * A non-VAT seller has no tax split, only the total.
 */
export function computeTotals(lines: { amount: number; vatClass: VatClass }[], vatRegistered = true): InvoiceTotals {
  const sum = (vatClass?: VatClass) => lines.filter((l) => !vatClass || l.vatClass === vatClass).reduce((total, l) => total + l.amount, 0)
  const totalDue = sum()
  if (!vatRegistered) return { vatableSales: 0, vatExempt: 0, zeroRated: 0, vatAmount: 0, totalDue }
  const gross = sum('vatable')
  // gross * 100 / 112 rounded half up, in integers: floating point would misplace the exact .5 cases.
  const vatableSales = Math.floor((gross * 100 + 56) / 112)
  return { vatableSales, vatExempt: sum('exempt'), zeroRated: sum('zero'), vatAmount: gross - vatableSales, totalDue }
}

export interface InvoiceLine {
  description: string
  category: string
  units: number
  /** Centavos, VAT-inclusive. */
  unitPrice: number
  amount: number
  vatClass: VatClass
}

/** Everything an invoice shows, in one shape for the sheet, the PDF and the JSON file. */
export interface Invoice {
  /** A draft is not a valid invoice (the merchant profile is incomplete). */
  status: 'draft' | 'issued'
  /** Null in a preview of an invoice not yet exported (its number is assigned on the first download or print), and in a draft. */
  invoiceNo: string | null
  /** ISO time of the sale. */
  placedAt: string
  orderNo: string
  seller: MerchantProfile
  /** Null for a walk-in customer. */
  buyer: Buyer | null
  paymentMethod: PaymentMethod | null
  /** The payment method's name for real orders, whose methods are more than the sample three. */
  paymentLabel?: string
  lines: InvoiceLine[]
  totals: InvoiceTotals
  /** 0 is the original; each later export is a duplicate copy with this reprint number. */
  reprintCount: number
  /** Set when the customer sent the order back and was refunded in full. The invoice still shows the sale as it was; no credit note is issued. */
  returned?: { returnedAt: string; reason: string; refund: number }
}

/** A draft while the merchant profile is incomplete. `record` is null until the invoice's number is issued on the first export. */
export function buildInvoice(detail: TransactionDetail, seller: MerchantProfile, record: Pick<InvoiceRecord, 'invoiceNo'> | null, reprintCount: number): Invoice {
  const lines = detail.lines.map((line): InvoiceLine => {
    const unitPrice = toCentavos(line.unitPrice)
    return { description: line.name, category: line.category, units: line.units, unitPrice, amount: line.units * unitPrice, vatClass: line.vatClass ?? 'vatable' }
  })
  return {
    status: isMerchantComplete(seller) ? 'issued' : 'draft',
    invoiceNo: record?.invoiceNo ?? null,
    placedAt: detail.placedAt,
    orderNo: detail.orderNo,
    seller,
    buyer: detail.buyer ?? null,
    paymentMethod: detail.paymentMethod ?? null,
    paymentLabel: detail.paymentLabel,
    lines,
    totals: computeTotals(lines, seller.vatRegistered),
    reprintCount,
    ...(detail.returnedAt && detail.returnReason && detail.refundAmount !== undefined && { returned: { returnedAt: detail.returnedAt, reason: detail.returnReason, refund: toCentavos(detail.refundAmount) } }),
  }
}
