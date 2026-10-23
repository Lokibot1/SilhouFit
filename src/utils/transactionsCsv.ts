import type { TransactionExportRow } from '../service/fetchTransactions'
import { formatPlacedAt } from './format'

const HEADER = ['No.', 'Date (Manila)', 'Customer', 'Items', 'Total (PHP)', 'VAT (PHP)', 'Status', 'Returned date (Manila)', 'Invoice No.']

/** A text cell: a leading = + - @ (or a control character) would run as a formula in Excel, so it gets an apostrophe; then RFC 4180 quoting. */
function text(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/** The rows as CSV: CRLF lines and a leading byte order mark, so Excel opens it as UTF-8. */
export function buildTransactionsCsv(rows: TransactionExportRow[]) {
  const lines = rows.map((row) =>
    [text(row.orderNo), text(formatPlacedAt(row.placedAt)), text(row.customerName), row.itemCount, row.total.toFixed(2), row.vat.toFixed(2), row.returnedAt ? 'Returned' : 'Completed', text(row.returnedAt ? formatPlacedAt(row.returnedAt) : ''), text(row.invoiceNo ?? '')].join(','),
  )
  return `\uFEFF${[HEADER.join(','), ...lines].join('\r\n')}\r\n`
}
