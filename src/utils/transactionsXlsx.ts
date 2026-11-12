import type { AdminTransactionRow } from '../service/adminTransactionsApi'
import { WORDMARK } from '../components/landing-v2/wordmark'
import { formatDay, formatDayWithYear, formatPlacedAt } from './format'
import { methodLabel, paymentStatusLabel } from './orders'
import { providerLabel, scopeOfRange, type TransactionQuery } from './transactionQuery'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const HEADER = ['Order No.', 'Date (Manila)', 'Customer', 'Email', 'Method', 'Provider', 'Reference', 'Status', 'Amount (PHP)', 'Fee (PHP)', 'Net (PHP)']
const NUMERIC_FROM = 8 // zero-based index of the first money column
const MONEY_FORMAT = '#,##0.00'
const DATE_FORMAT = 'mmm d, yyyy h:mm AM/PM'
const MIN_WIDTH = 10
const MAX_WIDTH = 50

// KRAL tokens from index.css as ARGB: Obsidian (18:1 against white), Stonewash for rules and the watermark, a faint Porcelain for banding.
const INK = 'FF161113'
const RULE = 'FFD9D5D6'
const BAND = 'FFF6F4F5'
const WHITE = 'FFFFFFFF'

const RANGE_LABEL = { today: 'Today', week: 'Last 7 days', month: 'This month', year: 'This year' } as const
const TITLE_ROW = 1
const INFO_ROWS = 4
const HEADER_ROW = TITLE_ROW + INFO_ROWS + 2

export interface TransactionsXlsxInput {
  rows: AdminTransactionRow[]
  exportedBy: { name?: string; email?: string }
  exportedAt: Date
  /** From `filtersSummary`. */
  filtersSummary: string
  /** A base64 PNG (no data: prefix) to tile behind the data; left out, the sheet has no watermark. */
  watermark?: string
}

/** A custom range as staff read it: "Nov 2026" or "2026" for a whole month or year, "Nov 12, 2026" for a day, else "Nov 1 – Nov 12, 2026". */
function customDates(from: string, to: string) {
  if (!from || !to) return `${from ? formatDayWithYear(from) : 'start'} to ${to ? formatDayWithYear(to) : 'today'}`
  if (from === to) return formatDayWithYear(from)
  const { month, year } = scopeOfRange(from, to)
  if (year) return month ? new Date(`${from}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' }) : String(year)
  return `${from.slice(0, 4) === to.slice(0, 4) ? formatDay(from) : formatDayWithYear(from)} – ${formatDayWithYear(to)}`
}

/** The active filters as one readable line, or "None". */
export function filtersSummary({ q, range, from, to, status, method, provider }: Pick<TransactionQuery, 'q' | 'range' | 'from' | 'to' | 'status' | 'method' | 'provider'>) {
  const parts = [
    q && `Search "${q}"`,
    status && `Status ${paymentStatusLabel(status)}`,
    method && `Method ${methodLabel(method)}`,
    provider && `Provider ${providerLabel(provider)}`,
    range === 'custom' ? `Dates ${customDates(from, to)}` : range && `Dates ${RANGE_LABEL[range]}`,
  ].filter(Boolean)
  return parts.length ? parts.join('; ') : 'None'
}

/** Who exported: "Name (email)", whichever exist, else "Unknown". */
export function exporterLabel({ name, email }: { name?: string; email?: string }) {
  const n = name?.trim()
  const e = email?.trim()
  return n && e ? `${n} (${e})` : n || e || 'Unknown'
}

/** Excel keeps a date-time with no zone, so the Manila wall clock goes in as if it were UTC (Manila is UTC+8 all year, no DST) and nothing shifts on open. */
export const manilaWallClock = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3_600_000)

/** A column's width in characters: its longest text plus padding, kept between 10 and 50. */
export function columnWidth(texts: string[]) {
  const longest = Math.max(0, ...texts.map((t) => Math.max(...t.split('\n').map((line) => line.length))))
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest + 3))
}

const money = (value: number | null) => (value === null ? '' : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

/** One row as cells (a fee or net the gateway has not reported is null) and as the text Excel will show, for measuring. */
export function rowCells(row: AdminTransactionRow) {
  const cells = [
    row.orderNumber,
    manilaWallClock(row.at),
    row.customerName,
    row.customerEmail ?? '',
    methodLabel(row.method),
    providerLabel(row.provider),
    row.reference,
    paymentStatusLabel(row.status),
    row.amount,
    row.fee,
    row.net,
  ]
  const shown = [...cells.slice(0, 8).map((c, i) => (i === 1 ? formatPlacedAt(row.at) : String(c))), money(row.amount), money(row.fee), money(row.net)]
  return { cells, shown }
}

/**
 * The workbook as .xlsx bytes. ExcelJS loads on demand (it is large), and its strings are stored as strings, never
 * evaluated, so a customer name like "=1+1" stays text. Only the Total row holds formulas, and those are ours.
 *
 * Watermark: Excel has no real one, so the PNG is the sheet's background picture. It tiles behind unfilled cells on
 * screen only; Excel and LibreOffice never print a background picture. Header, banded and total cells are filled and cover it.
 */
export async function buildTransactionsXlsx({ rows, exportedBy, exportedAt, filtersSummary: filters, watermark }: TransactionsXlsxInput): Promise<ArrayBuffer> {
  const { Workbook } = (await import('exceljs')).default
  const workbook = new Workbook()
  const exporter = exporterLabel(exportedBy)
  workbook.creator = exportedBy.name?.trim() || exportedBy.email?.trim() || 'Unknown'
  workbook.title = 'KRAL Transactions'
  workbook.created = exportedAt
  const sheet = workbook.addWorksheet('Transactions', {
    views: [{ state: 'frozen', ySplit: HEADER_ROW, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}` },
    headerFooter: { oddFooter: '&CPage &P of &N' },
  })
  const last = HEADER.length

  const title = sheet.getCell(TITLE_ROW, 1)
  sheet.mergeCells(TITLE_ROW, 1, TITLE_ROW, last)
  title.value = 'KRAL Transactions'
  title.font = { name: 'Calibri', size: 20, bold: true, color: { argb: INK } }
  title.alignment = { vertical: 'middle', horizontal: 'left' }
  sheet.getRow(TITLE_ROW).height = 32

  const info: [string, string | number][] = [
    ['Exported by', exporter],
    ['Exported on', `${formatPlacedAt(exportedAt.toISOString())} (Manila)`],
    ['Filters', filters],
    ['Transactions', rows.length],
  ]
  info.forEach(([label, value], i) => {
    const r = TITLE_ROW + 1 + i
    sheet.mergeCells(r, 2, r, last)
    sheet.getCell(r, 1).value = label
    sheet.getCell(r, 1).font = { bold: true, color: { argb: INK } }
    sheet.getCell(r, 2).value = value
    sheet.getCell(r, 2).alignment = { horizontal: 'left', vertical: 'middle' }
  })

  const header = sheet.getRow(HEADER_ROW)
  header.values = HEADER
  header.height = 24
  header.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: WHITE } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
    cell.alignment = { vertical: 'middle', horizontal: col > NUMERIC_FROM ? 'right' : 'left' }
    cell.border = { top: { style: 'thin', color: { argb: INK } }, left: { style: 'thin', color: { argb: INK } }, bottom: { style: 'thin', color: { argb: INK } }, right: { style: 'thin', color: { argb: INK } } }
  })

  const edge = { style: 'thin', color: { argb: RULE } } as const
  const measured: string[][] = HEADER.map((h) => [h])
  rows.forEach((row, i) => {
    const { cells, shown } = rowCells(row)
    const excelRow = sheet.getRow(HEADER_ROW + 1 + i)
    excelRow.values = cells
    excelRow.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.alignment = { vertical: 'middle', horizontal: col > NUMERIC_FROM ? 'right' : 'left', wrapText: true }
      cell.border = { top: edge, left: edge, bottom: edge, right: edge }
      if (col === 2) cell.numFmt = DATE_FORMAT
      if (col > NUMERIC_FROM) cell.numFmt = MONEY_FORMAT
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }
    })
    shown.forEach((text, c) => measured[c].push(text))
  })

  const first = HEADER_ROW + 1
  const end = HEADER_ROW + rows.length
  const totalRow = sheet.getRow(end + 1)
  totalRow.getCell(1).value = 'Total'
  const sum = (key: 'amount' | 'fee' | 'net') => rows.reduce((total, row) => total + (row[key] ?? 0), 0)
  ;(['amount', 'fee', 'net'] as const).forEach((key, i) => {
    const col = NUMERIC_FROM + 1 + i
    const letter = String.fromCharCode(64 + col)
    const result = sum(key)
    totalRow.getCell(col).value = rows.length ? { formula: `SUM(${letter}${first}:${letter}${end})`, result } : 0
    totalRow.getCell(col).numFmt = MONEY_FORMAT
    measured[col - 1].push(money(result))
  })
  const countRow = sheet.getRow(end + 2)
  countRow.getCell(1).value = `Count: ${rows.length}`
  for (let col = 1; col <= last; col++) {
    const cell = totalRow.getCell(col)
    cell.font = { bold: true, color: { argb: INK } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RULE } }
    cell.border = { top: { style: 'medium', color: { argb: INK } }, bottom: { style: 'thin', color: { argb: INK } } }
    cell.alignment = { vertical: 'middle', horizontal: col > NUMERIC_FROM ? 'right' : 'left' }
  }
  countRow.getCell(1).font = { bold: true, color: { argb: INK } }
  measured[0].push('Total', `Count: ${rows.length}`)

  sheet.columns.forEach((column, i) => (column.width = columnWidth(measured[i])))
  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: Math.max(end, HEADER_ROW), column: last } }

  if (watermark) sheet.addBackgroundImage(workbook.addImage({ base64: watermark, extension: 'png' }))
  return workbook.xlsx.writeBuffer()
}

/** The KRAL wordmark as a base64 PNG tile, tilted, grey and about 11% opaque (the transparency is in the pixels). Null when the browser can't draw it. */
export async function renderWatermark(): Promise<string | null> {
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORDMARK.width} ${WORDMARK.height}" width="${WORDMARK.width}" height="${WORDMARK.height}"><path fill="#85807c" fill-rule="evenodd" d="${WORDMARK.letters.map((l) => l.d).join('')}"/></svg>`
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 480
    canvas.height = 300
    const context = canvas.getContext('2d')
    if (!context) return null
    const width = 300
    context.globalAlpha = 0.11
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate(-Math.PI / 7)
    context.drawImage(image, -width / 2, (-width * WORDMARK.height) / WORDMARK.width / 2, width, (width * WORDMARK.height) / WORDMARK.width)
    return canvas.toDataURL('image/png').split(',')[1]
  } catch {
    return null
  }
}
