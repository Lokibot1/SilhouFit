import { describe, expect, it } from 'vitest'
import type { TransactionDetail } from '../../src/service/fetchTransactions'
import { SAMPLE_MERCHANT } from '../../src/service/sampleInvoices'
import { buildInvoiceJson } from '../../src/utils/invoiceJson'
import { buildInvoice, INVOICE_NOTICE, RETURN_NOTICE } from '../../src/utils/invoiceTax'

const detail: TransactionDetail = {
  id: 'id-1',
  orderNo: 'SF-10001',
  customerName: 'Maria Santos',
  placedAt: '2026-10-22T07:45:00.000Z',
  itemCount: 4,
  total: 3010,
  subtotal: 3010,
  paymentMethod: 'cash',
  lines: [
    { productId: 'a', name: 'Polo', category: 'Hoodie', units: 2, unitPrice: 1120 },
    { productId: 'b', name: 'Textbook', category: 'Books', units: 1, unitPrice: 500, vatClass: 'exempt' },
    { productId: 'c', name: 'Export tee', category: 'Hoodie', units: 1, unitPrice: 270, vatClass: 'zero' },
  ],
}

describe('buildInvoiceJson', () => {
  it('marks a returned order and its full refund, without making a credit note', () => {
    const returned = { ...detail, returnedAt: '2026-10-24T02:05:00.000Z', returnReason: 'Wrong size' as const, refundAmount: 3010 }
    const json = buildInvoiceJson(buildInvoice(returned, SAMPLE_MERCHANT, { invoiceNo: 'SI-0000001' }, 0))
    expect(json).toMatchObject({ status: 'returned', returnedAt: '2026-10-24T02:05:00.000Z', returnReason: 'Wrong size', refund: 3010, returnNotice: RETURN_NOTICE })
    expect(json.totals.totalAmountDue).toBe(3010)
    expect(Object.keys(json)).not.toContain('creditNote')
    expect(buildInvoiceJson(buildInvoice(detail, SAMPLE_MERCHANT, { invoiceNo: 'SI-0000001' }, 0))).not.toHaveProperty('returnedAt')
  })

  it('labels the schema and carries the notice', () => {
    const json = buildInvoiceJson(buildInvoice(detail, SAMPLE_MERCHANT, { invoiceNo: 'SI-0000001' }, 0))
    expect(json.schema).toBe('silhoufit.einvoice/1')
    expect(json.notice).toBe(INVOICE_NOTICE)
  })

  it('matches the snapshot for an original with mixed tax classes', () => {
    expect(buildInvoiceJson(buildInvoice(detail, SAMPLE_MERCHANT, { invoiceNo: 'SI-0000001' }, 0))).toMatchInlineSnapshot(`
      {
        "buyer": {
          "name": "Walk-in customer",
          "type": "walk-in",
        },
        "copy": {
          "reprintCount": 0,
          "type": "original",
        },
        "currency": "PHP",
        "footerText": "Thank you for shopping with us. This is a sample invoice.",
        "invoiceNo": "SI-0000001",
        "issuedAt": "2026-10-22T07:45:00.000Z",
        "lines": [
          {
            "amount": 2240,
            "description": "Polo",
            "quantity": 2,
            "unitPrice": 1120,
            "vatClass": "vatable",
          },
          {
            "amount": 500,
            "description": "Textbook",
            "quantity": 1,
            "unitPrice": 500,
            "vatClass": "exempt",
          },
          {
            "amount": 270,
            "description": "Export tee",
            "quantity": 1,
            "unitPrice": 270,
            "vatClass": "zero",
          },
        ],
        "notice": "Format follows BIR invoice guidelines. Validity depends on your BIR registration and Permit to Use. Not transmitted to the BIR.",
        "orderNo": "SF-10001",
        "paymentMethod": "cash",
        "schema": "silhoufit.einvoice/1",
        "seller": {
          "address": "123 Sample Street, Sample Barangay, Sample City, Metro Manila 0000",
          "branchCode": "00000",
          "permitNo": "SAMPLE-PTU-0000-0000",
          "registeredName": "SilhouFit Sample Store",
          "sample": true,
          "tin": "000-000-000",
          "vatStatus": "VAT",
        },
        "status": "issued",
        "timezone": "Asia/Manila",
        "totals": {
          "totalAmountDue": 3010,
          "vatAmount": 240,
          "vatExempt": 500,
          "vatableSales": 2000,
          "zeroRated": 270,
        },
        "vatRate": 0.12,
      }
    `)
  })

  it('marks a duplicate and a business buyer', () => {
    const json = buildInvoiceJson(
      buildInvoice({ ...detail, buyer: { name: 'Sample Trading Corp.', tin: '000-000-000-00000', address: '1 Sample Avenue' } }, SAMPLE_MERCHANT, { invoiceNo: 'SI-0000001' }, 2),
    )
    expect(json.copy).toEqual({ type: 'duplicate', reprintCount: 2 })
    expect(json.buyer).toMatchObject({ type: 'business', tin: '000-000-000-00000' })
  })
})
