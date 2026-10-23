import { describe, expect, it } from 'vitest'
import type { TransactionDetail } from '../../src/service/fetchTransactions'
import { SAMPLE_MERCHANT } from '../../src/service/sampleInvoices'
import { buildInvoice, computeTotals, toCentavos, type VatClass } from '../../src/utils/invoiceTax'

const line = (amount: number, vatClass: VatClass = 'vatable') => ({ amount, vatClass })

describe('toCentavos', () => {
  it('turns pesos into whole centavos, even when the float is slightly off', () => {
    expect(toCentavos(1290)).toBe(129000)
    expect(toCentavos(19.99)).toBe(1999)
    expect(toCentavos(1.005 * 100)).toBe(10050)
  })
})

describe('computeTotals', () => {
  it('splits a VAT-inclusive gross into VATable sales and 12% VAT that add back to it', () => {
    // 1,120.00 gross = 1,000.00 + 120.00 exactly.
    expect(computeTotals([line(112000)])).toEqual({ vatableSales: 100000, vatExempt: 0, zeroRated: 0, vatAmount: 12000, totalDue: 112000 })
  })

  it('always adds up: vatable sales + VAT = gross, for every gross up to 5,000.00', () => {
    for (let gross = 1; gross <= 500000; gross += 7) {
      const t = computeTotals([line(gross)])
      expect(t.vatableSales + t.vatAmount).toBe(gross)
      expect(t.totalDue).toBe(gross)
    }
  })

  it('rounds half a centavo up at the exact boundary', () => {
    // 0.28 / 1.12 = 0.25 exactly; 0.14 / 1.12 = 0.125, which is 12.5 centavos and rounds to 13.
    expect(computeTotals([line(28)]).vatableSales).toBe(25)
    expect(computeTotals([line(14)]).vatableSales).toBe(13)
    expect(computeTotals([line(14)]).vatAmount).toBe(1)
    // Just under the half rounds down: 0.13 / 1.12 = 0.11607 -> 12 centavos.
    expect(computeTotals([line(13)]).vatableSales).toBe(12)
  })

  it('splits mixed vatable, exempt and zero-rated lines; only the vatable gross carries VAT', () => {
    const t = computeTotals([line(112000), line(50000, 'exempt'), line(30000, 'zero'), line(11200)])
    expect(t).toEqual({ vatableSales: 110000, vatExempt: 50000, zeroRated: 30000, vatAmount: 13200, totalDue: 203200 })
    expect(t.vatableSales + t.vatAmount + t.vatExempt + t.zeroRated).toBe(t.totalDue)
  })

  it('has no tax split for a non-VAT seller, only the total', () => {
    expect(computeTotals([line(112000), line(50000, 'exempt')], false)).toEqual({ vatableSales: 0, vatExempt: 0, zeroRated: 0, vatAmount: 0, totalDue: 162000 })
  })

  it('is worked out on the whole gross, not per line, so many small lines still add up', () => {
    const t = computeTotals(Array.from({ length: 200 }, () => line(14)))
    expect(t.totalDue).toBe(2800)
    expect(t.vatableSales).toBe(2500)
    expect(t.vatAmount).toBe(300)
    // Rounded per line, the same lines would round 12.5 up to 13 two hundred times and drift by 100 centavos.
    expect(200 * computeTotals([line(14)]).vatableSales).toBe(2600)
  })

  it('handles an empty invoice', () => {
    expect(computeTotals([])).toEqual({ vatableSales: 0, vatExempt: 0, zeroRated: 0, vatAmount: 0, totalDue: 0 })
  })
})

const detail: TransactionDetail = {
  id: 'id-1',
  orderNo: 'SF-10001',
  customerName: 'Maria Santos',
  placedAt: '2026-10-22T07:45:00.000Z',
  itemCount: 3,
  total: 2580,
  subtotal: 2580,
  paymentMethod: 'gcash',
  lines: [
    { productId: 'a', name: 'Polo', category: 'Tops', units: 2, unitPrice: 645.5 },
    { productId: 'b', name: 'Notebook', category: 'Books', units: 1, unitPrice: 1289, vatClass: 'exempt' },
  ],
}

describe('buildInvoice', () => {
  it('prices every line in centavos and defaults a line to vatable', () => {
    const invoice = buildInvoice(detail, SAMPLE_MERCHANT, { invoiceNo: 'SI-0000001' }, 0)
    expect(invoice.lines.map((l) => [l.unitPrice, l.amount, l.vatClass])).toEqual([
      [64550, 129100, 'vatable'],
      [128900, 128900, 'exempt'],
    ])
    expect(invoice.totals.totalDue).toBe(258000)
    expect(invoice.status).toBe('issued')
    expect(invoice.buyer).toBeNull()
  })

  it('is a draft without a number while the merchant profile is incomplete', () => {
    const invoice = buildInvoice(detail, { ...SAMPLE_MERCHANT, permitNo: '' }, null, 0)
    expect(invoice.status).toBe('draft')
    expect(invoice.invoiceNo).toBeNull()
  })

  it('is an issued invoice with no number yet before its first export', () => {
    const invoice = buildInvoice(detail, SAMPLE_MERCHANT, null, 0)
    expect(invoice.status).toBe('issued')
    expect(invoice.invoiceNo).toBeNull()
  })
})
