import { INVOICE_NOTICE, RETURN_NOTICE, type Invoice } from './invoiceTax'

const pesos = (centavos: number) => centavos / 100

/** SilhouFit's own e-invoice file. It is not an EIS submission and is not sent to the BIR. */
export function buildInvoiceJson(invoice: Invoice) {
  const { seller, buyer, totals } = invoice
  return {
    schema: 'silhoufit.einvoice/1',
    notice: INVOICE_NOTICE,
    invoiceNo: invoice.invoiceNo,
    // A draft stays a draft; otherwise a returned order says so. No credit note is issued for it (see RETURN_NOTICE).
    status: invoice.status === 'draft' ? 'draft' : invoice.returned ? 'returned' : invoice.status,
    ...(invoice.returned && {
      returnedAt: invoice.returned.returnedAt,
      returnReason: invoice.returned.reason,
      refund: pesos(invoice.returned.refund),
      returnNotice: RETURN_NOTICE,
    }),
    copy: invoice.reprintCount > 0 ? { type: 'duplicate', reprintCount: invoice.reprintCount } : { type: 'original', reprintCount: 0 },
    issuedAt: invoice.placedAt,
    timezone: 'Asia/Manila',
    currency: 'PHP',
    orderNo: invoice.orderNo,
    seller: {
      registeredName: seller.registeredName,
      tin: seller.tin,
      branchCode: seller.branchCode,
      address: seller.address,
      vatStatus: seller.vatRegistered ? 'VAT' : 'NON-VAT',
      permitNo: seller.permitNo,
      sample: seller.sample,
    },
    buyer: buyer ? { type: 'business', ...buyer } : { type: 'walk-in', name: 'Walk-in customer' },
    paymentMethod: invoice.paymentMethod,
    lines: invoice.lines.map((line) => ({
      description: line.description,
      quantity: line.units,
      unitPrice: pesos(line.unitPrice),
      amount: pesos(line.amount),
      vatClass: seller.vatRegistered ? line.vatClass : null,
    })),
    vatRate: seller.vatRegistered ? 0.12 : 0,
    totals: {
      vatableSales: pesos(totals.vatableSales),
      vatExempt: pesos(totals.vatExempt),
      zeroRated: pesos(totals.zeroRated),
      vatAmount: pesos(totals.vatAmount),
      totalAmountDue: pesos(totals.totalDue),
    },
    footerText: seller.footerText,
  }
}
