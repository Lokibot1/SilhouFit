import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { SAMPLE_MERCHANT } from '../../src/service/sampleInvoices'
import { renderInvoicePdf } from '../../src/utils/invoicePdf'
import type { Invoice } from '../../src/utils/invoiceTax'

const invoice: Invoice = {
  status: 'issued',
  invoiceNo: 'SI-0000001',
  placedAt: '2026-10-22T07:45:00.000Z',
  orderNo: 'SF-10001',
  seller: SAMPLE_MERCHANT,
  buyer: { name: 'Maria Santos', tin: '123-456-789', address: '1 Rizal St, Manila' },
  paymentMethod: 'gcash',
  lines: [{ description: 'Heritage Polo', category: 'Hoodie', units: 1, unitPrice: 129000, amount: 129000, vatClass: 'vatable' }],
  totals: { vatableSales: 115179, vatExempt: 0, zeroRated: 0, vatAmount: 13821, totalDue: 129000 },
  reprintCount: 0,
}

// The font URLs are paths on the dev server; read the real files instead.
beforeAll(() => {
  vi.stubGlobal('fetch', async (url: string) => {
    const bytes = readFileSync(join(process.cwd(), url.split('?')[0].replace(/^\//, '')))
    return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
  })
})

describe('renderInvoicePdf', () => {
  it('reports nothing replaced when the font draws every character', async () => {
    const { blob, replaced } = await renderInvoicePdf(invoice)
    expect(replaced).toEqual([])
    expect(blob.size).toBeGreaterThan(0)
  })

  it('draws the returned banner and notice on a returned order without trouble', async () => {
    const returned = { ...invoice, returned: { returnedAt: '2026-10-24T02:05:00.000Z', reason: 'Wrong size', refund: 129000 } }
    const plain = await renderInvoicePdf(invoice)
    const { blob, replaced } = await renderInvoicePdf(returned)
    expect(replaced).toEqual([])
    expect(blob.size).toBeGreaterThan(plain.blob.size)
  })

  it('replaces CJK and emoji with "?" and names the fields, leaving the input untouched', async () => {
    const buyer = { name: '王小明 Maria 😀', tin: '123-456-789', address: '1 Rizal St, Manila' }
    const source = { ...invoice, buyer, lines: [{ ...invoice.lines[0], description: 'Polo 衬衫' }] }
    const { replaced } = await renderInvoicePdf(source)
    expect(replaced).toEqual(['the buyer name', 'an item name'])
    expect(source.buyer.name).toBe('王小明 Maria 😀')
    expect(source.lines[0].description).toBe('Polo 衬衫')
  })
})
