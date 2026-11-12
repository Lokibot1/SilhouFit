import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import type { AdminTransactionRow } from '../../src/service/adminTransactionsApi'
import { buildTransactionsXlsx, columnWidth, exporterLabel, filtersSummary, manilaWallClock } from '../../src/utils/transactionsXlsx'

const row = (over: Partial<AdminTransactionRow> = {}): AdminTransactionRow => ({
  id: '00000000-0000-4000-9000-000000000001',
  orderId: '00000000-0000-4000-8000-000000000001',
  orderNumber: 'SF-10001',
  orderStatus: 'PAID',
  customerName: 'Maria Santos',
  customerEmail: 'maria@example.com',
  provider: 'paymongo',
  reference: 'pay_abc123',
  method: 'GCASH',
  status: 'PAID',
  amount: 4580,
  fee: 25.5,
  net: 4554.5,
  at: '2026-10-22T07:45:00.000Z',
  ...over,
})
// A 1x1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
const NOW = new Date('2026-11-12T01:05:00.000Z')

async function build(rows: AdminTransactionRow[], over: { watermark?: string } = {}) {
  const buffer = await buildTransactionsXlsx({ rows, exportedBy: { name: 'Ana Cruz', email: 'ana@kral.test' }, exportedAt: NOW, filtersSummary: 'None', ...over })
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(buffer)
  return { book, sheet: book.getWorksheet('Transactions')! }
}

describe('pure parts', () => {
  it('keeps the Manila wall clock when Excel reads the date back', () => {
    expect(manilaWallClock('2026-10-22T07:45:00.000Z').toISOString()).toBe('2026-10-22T15:45:00.000Z')
    expect(manilaWallClock('2026-10-22T20:00:00.000Z').toISOString()).toBe('2026-10-23T04:00:00.000Z')
  })

  it('sizes a column to its longest line, between 10 and 50', () => {
    expect(columnWidth(['ab'])).toBe(10)
    expect(columnWidth(['x'.repeat(20), 'short'])).toBe(23)
    expect(columnWidth(['x'.repeat(80)])).toBe(50)
  })

  it('names the exporter with whatever exists', () => {
    expect(exporterLabel({ name: 'Ana', email: 'a@b.c' })).toBe('Ana (a@b.c)')
    expect(exporterLabel({ email: 'a@b.c' })).toBe('a@b.c')
    expect(exporterLabel({ name: ' ' })).toBe('Unknown')
  })

  it('summarises the active filters, or None', () => {
    const none = { q: '', range: '', from: '', to: '', status: '', method: '', provider: '' } as const
    expect(filtersSummary(none)).toBe('None')
    expect(filtersSummary({ ...none, q: 'maria', status: 'PAID', method: 'GCASH', provider: 'paymongo', range: 'week' })).toBe('Search "maria"; Status Paid; Method GCash; Provider PayMongo; Dates Last 7 days')
    expect(filtersSummary({ ...none, range: 'custom', from: '2026-10-01', to: '' })).toBe('Dates Oct 1, 2026 to today')
    expect(filtersSummary({ ...none, range: 'year' })).toBe('Dates This year')
  })

  it('words a custom range as a month, a year, a day or a span', () => {
    const custom = (from: string, to: string) => filtersSummary({ q: '', status: '', method: '', provider: '', range: 'custom', from, to })
    expect(custom('2025-11-01', '2025-11-30')).toBe('Dates Nov 2025')
    expect(custom('2025-01-01', '2025-12-31')).toBe('Dates 2025')
    expect(custom('2025-11-12', '2025-11-12')).toBe('Dates Nov 12, 2025')
    expect(custom('2025-11-01', '2025-11-12')).toBe('Dates Nov 1 – Nov 12, 2025')
    expect(custom('2025-12-30', '2026-01-02')).toBe('Dates Dec 30, 2025 – Jan 2, 2026')
  })
})

describe('buildTransactionsXlsx', () => {
  it('writes the title block, count and exporter', async () => {
    const { book, sheet } = await build([row(), row({ orderNumber: 'SF-10002' })])
    expect(sheet.getCell('A1').value).toBe('KRAL Transactions')
    expect(sheet.getCell('A1').font?.bold).toBe(true)
    expect(sheet.getCell('B2').value).toBe('Ana Cruz (ana@kral.test)')
    expect(sheet.getCell('B3').value).toBe('Nov 12, 2026, 9:05 AM (Manila)')
    expect(sheet.getCell('B4').value).toBe('None')
    expect(sheet.getCell('B5').value).toBe(2)
    expect(book.creator).toBe('Ana Cruz')
    expect(book.title).toBe('KRAL Transactions')
  })

  it('styles the header, freezes it and filters it', async () => {
    const { sheet } = await build([row()])
    expect((sheet.getRow(7).values as string[]).slice(1)).toHaveLength(11)
    expect(sheet.getCell('A7').value).toBe('Order No.')
    expect(sheet.getCell('A7').font?.bold).toBe(true)
    expect(sheet.getCell('A7').font?.color?.argb).toBe('FFFFFFFF')
    expect(sheet.getCell('A7').fill).toMatchObject({ pattern: 'solid', fgColor: { argb: 'FF161113' } })
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 7 })
    expect(sheet.autoFilter).toBe('A7:K8')
    expect(sheet.pageSetup).toMatchObject({ orientation: 'landscape', fitToWidth: 1, printTitlesRow: '7:7' })
  })

  it('stores money as numbers, the date as a date, and the gateway-unreported fee as empty', async () => {
    const { sheet } = await build([row(), row({ fee: null, net: null })])
    expect(sheet.getCell('I8').value).toBe(4580)
    expect(sheet.getCell('I8').numFmt).toBe('#,##0.00')
    expect(sheet.getCell('J8').value).toBe(25.5)
    expect(sheet.getCell('J9').value).toBeNull()
    const date = sheet.getCell('B8').value
    expect(date).toBeInstanceOf(Date)
    expect((date as Date).toISOString()).toBe('2026-10-22T15:45:00.000Z')
    expect(sheet.getCell('B8').numFmt).toBe('mmm d, yyyy h:mm AM/PM')
    expect(sheet.getCell('H8').value).toBe('Paid')
  })

  it('keeps formula-looking text as text', async () => {
    const { sheet } = await build([row({ customerName: '=1+1', reference: '@SUM(A1)', customerEmail: '-x' })])
    for (const [address, value] of [['C8', '=1+1'], ['G8', '@SUM(A1)'], ['D8', '-x']] as const) {
      expect(sheet.getCell(address).value).toBe(value)
      expect(sheet.getCell(address).type).toBe(ExcelJS.ValueType.String)
    }
  })

  it('fits the columns to the longest text', async () => {
    const long = 'a-very-long-customer-name@example.com'
    const { sheet } = await build([row({ customerEmail: long })])
    expect(sheet.getColumn(4).width).toBeGreaterThanOrEqual(long.length)
    for (let c = 1; c <= 11; c++) expect(sheet.getColumn(c).width).toBeGreaterThanOrEqual(10)
  })

  it('totals amount, fee and net, with the count under it', async () => {
    const { sheet } = await build([row(), row({ fee: null, net: null })])
    expect(sheet.getCell('A10').value).toBe('Total')
    expect(sheet.getCell('I10').value).toMatchObject({ formula: 'SUM(I8:I9)', result: 9160 })
    expect(sheet.getCell('J10').value).toMatchObject({ formula: 'SUM(J8:J9)', result: 25.5 })
    expect(sheet.getCell('K10').value).toMatchObject({ formula: 'SUM(K8:K9)', result: 4554.5 })
    expect(sheet.getCell('A11').value).toBe('Count: 2')
  })

  it('tiles the watermark behind the sheet only when given one', async () => {
    expect((await build([row()], { watermark: PNG })).sheet.getBackgroundImageId()).toBeDefined()
    expect((await build([row()])).sheet.getBackgroundImageId()).toBeUndefined()
  })

  it('still makes a valid sheet with no rows', async () => {
    const { sheet } = await build([])
    expect(sheet.getCell('B5').value).toBe(0)
    expect(sheet.getCell('A8').value).toBe('Total')
    expect(sheet.getCell('I8').value).toBe(0)
    expect(sheet.getCell('A9').value).toBe('Count: 0')
  })
})
