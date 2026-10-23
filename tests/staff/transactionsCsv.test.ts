import { describe, expect, it } from 'vitest'
import type { TransactionExportRow } from '../../src/service/fetchTransactions'
import { buildTransactionsCsv } from '../../src/utils/transactionsCsv'

const row = (overrides: Partial<TransactionExportRow> = {}): TransactionExportRow => ({
  id: 'id',
  orderNo: 'SF-10001',
  customerName: 'Maria Santos',
  // 3:45 PM in Manila.
  placedAt: '2026-10-22T07:45:00.000Z',
  itemCount: 3,
  total: 4580,
  vat: 490.71,
  ...overrides,
})

const lines = (csv: string) => csv.slice(1).split('\r\n')

describe('buildTransactionsCsv', () => {
  it('starts with a byte order mark and uses CRLF lines', () => {
    const csv = buildTransactionsCsv([row()])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('orders the columns: no., date (Manila, 12-hour), customer, items, total, VAT, status, returned date, invoice no.', () => {
    const [header, first] = lines(buildTransactionsCsv([row({ invoiceNo: 'SI-0000007' })]))
    expect(header).toBe('No.,Date (Manila),Customer,Items,Total (PHP),VAT (PHP),Status,Returned date (Manila),Invoice No.')
    // The date holds commas, so it is quoted.
    expect(first).toBe('SF-10001,"Oct 22, 2026, 3:45 PM",Maria Santos,3,4580.00,490.71,Completed,,SI-0000007')
  })

  it('leaves the invoice number empty until one was issued', () => {
    expect(lines(buildTransactionsCsv([row()]))[1]).toMatch(/,490\.71,Completed,,$/)
  })

  it('marks a returned order and gives the date it came back', () => {
    const returned = row({ returnedAt: '2026-10-24T02:05:00.000Z', returnReason: 'Wrong size', refundAmount: 4580 })
    expect(lines(buildTransactionsCsv([returned]))[1]).toBe('SF-10001,"Oct 22, 2026, 3:45 PM",Maria Santos,3,4580.00,490.71,Returned,"Oct 24, 2026, 10:05 AM",')
  })

  it('quotes commas, quotes and line breaks (RFC 4180)', () => {
    const csv = buildTransactionsCsv([row({ customerName: 'Santos, "Jun" Jr.\nManila' })])
    expect(csv).toContain('"Santos, ""Jun"" Jr.\nManila"')
  })

  it('stops a text cell from running as a formula', () => {
    for (const name of ['=SUM(A1)', '+1', '-1', '@cmd']) {
      expect(buildTransactionsCsv([row({ customerName: name })])).toContain(`,'${name},`)
    }
    expect(buildTransactionsCsv([row({ invoiceNo: '=1+1' })])).toContain(",'=1+1")
  })

  it('writes only the header for no rows', () => {
    expect(lines(buildTransactionsCsv([]))).toEqual(['No.,Date (Manila),Customer,Items,Total (PHP),VAT (PHP),Status,Returned date (Manila),Invoice No.', ''])
  })
})
