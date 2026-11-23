import { formatPlacedAt } from './format'
import { SOCIAL_LINKS, type ReportDoc, type ReportMeta, type ReportSection } from './reportTypes'
import { columnWidth, exporterLabel, renderWatermark } from './transactionsXlsx'

// The report as an .xlsx: a Summary sheet, then one sheet per section. Same look as the Transactions export (KRAL Obsidian header,
// banded rows, tiled KRAL watermark as the sheet background, which Excel shows on screen but never prints).

const INK = 'FF161113'
const RULE = 'FFD9D5D6'
const BAND = 'FFF6F4F5'
const WHITE = 'FFFFFFFF'
const MONEY_FORMAT = '#,##0.00'
const INT_FORMAT = '#,##0'
const BRAND_LINE = 'SilhouFit retail analytics  |  KRAL'
const FOOTER = `&L&8SilhouFit for KRAL&C&8Page &P of &N&R&8${SOCIAL_LINKS.map((s) => s.name).join(' | ')}`

const fill = (argb: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } }) as const
const edge = { style: 'thin', color: { argb: RULE } } as const

/** Sheet names are 31 characters at most, with none of : \ / ? * [ ]; repeats get a number. */
function sheetName(heading: string, used: Set<string>) {
  const base = heading.replace(/[:\\/?*[\]]/g, '').slice(0, 28).trim() || 'Sheet'
  let name = base
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 27)} ${n}`
  used.add(name.toLowerCase())
  return name
}

export async function buildReportXlsx(doc: ReportDoc, { exportedBy, exportedAt }: ReportMeta): Promise<{ bytes: ArrayBuffer; watermarked: boolean }> {
  const { Workbook } = (await import('exceljs')).default
  const watermark = await renderWatermark()
  const workbook = new Workbook()
  workbook.creator = exportedBy.name?.trim() || exportedBy.email?.trim() || 'Unknown'
  workbook.title = `KRAL ${doc.title}`
  workbook.created = exportedAt
  const used = new Set<string>()

  const open = (name: string, width: number) => {
    const sheet = workbook.addWorksheet(sheetName(name, used), {
      views: [{ showGridLines: false }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      headerFooter: { oddHeader: '&L&"Calibri,Bold"&12SilhouFit&R&"Calibri,Bold"&12KRAL', oddFooter: FOOTER },
    })
    sheet.mergeCells(1, 1, 1, width)
    sheet.getCell(1, 1).value = `${doc.title} - ${BRAND_LINE}`
    sheet.getCell(1, 1).font = { size: 18, bold: true, color: { argb: INK } }
    sheet.getRow(1).height = 30
    if (watermark) sheet.addBackgroundImage(workbook.addImage({ base64: watermark, extension: 'png' }))
    return sheet
  }

  // Summary: who and when, the headline figures, and where to find KRAL.
  const summary = open('Summary', 2)
  const lines: [string, string][] = [['Exported by', exporterLabel(exportedBy)], ['Exported on', `${formatPlacedAt(exportedAt.toISOString())} (Manila)`], ...doc.info]
  lines.forEach(([label, value], i) => {
    summary.getCell(3 + i, 1).value = label
    summary.getCell(3 + i, 1).font = { bold: true, color: { argb: INK } }
    summary.getCell(3 + i, 2).value = value
    summary.getCell(3 + i, 2).alignment = { horizontal: 'left' }
  })
  const socialsAt = 4 + lines.length
  summary.getCell(socialsAt, 1).value = 'Find KRAL'
  summary.getCell(socialsAt, 1).font = { bold: true, color: { argb: INK } }
  SOCIAL_LINKS.forEach((s, i) => {
    const cell = summary.getCell(socialsAt + 1 + i, 2)
    cell.value = { text: s.name, hyperlink: s.href }
    cell.font = { underline: true, color: { argb: 'FF0B57D0' } }
  })
  summary.getColumn(1).width = 16
  summary.getColumn(2).width = columnWidth(lines.map(([, v]) => v))

  const addSection = (section: ReportSection) => {
    const width = section.columns.length
    const sheet = open(section.heading, width)
    sheet.mergeCells(2, 1, 2, width)
    sheet.getCell(2, 1).value = section.heading
    sheet.getCell(2, 1).font = { size: 13, bold: true, color: { argb: INK } }
    let row = 3
    if (section.note) {
      sheet.mergeCells(row, 1, row, width)
      sheet.getCell(row, 1).value = section.note
      sheet.getCell(row, 1).font = { italic: true, color: { argb: 'FF5E5859' } }
      row++
    }
    row++
    if (section.rows.length === 0) {
      sheet.getCell(row, 1).value = section.empty
      sheet.getColumn(1).width = Math.max(24, section.empty.length + 3)
      return
    }

    const header = sheet.getRow(row)
    header.values = section.columns.map((c) => c.label)
    header.height = 24
    header.eachCell((cell, col) => {
      cell.font = { bold: true, color: { argb: WHITE } }
      cell.fill = fill(INK)
      cell.alignment = { vertical: 'middle', horizontal: section.columns[col - 1].align === 'right' ? 'right' : 'left' }
    })
    const headerRow = row
    const measured = section.columns.map((c) => [c.label])
    // Text goes in as text, never evaluated, so a product named "=1+1" stays that.
    section.rows.forEach((cells, i) => {
      const excelRow = sheet.getRow(headerRow + 1 + i)
      excelRow.values = cells
      excelRow.eachCell({ includeEmpty: true }, (cell, col) => {
        const column = section.columns[col - 1]
        cell.alignment = { vertical: 'middle', horizontal: column.align === 'right' ? 'right' : 'left', wrapText: true }
        cell.border = { top: edge, left: edge, bottom: edge, right: edge }
        if (column.kind === 'money') cell.numFmt = MONEY_FORMAT
        if (column.kind === 'int') cell.numFmt = INT_FORMAT
        if (i % 2 === 1) cell.fill = fill(BAND)
      })
      cells.forEach((c, k) => measured[k].push(typeof c === 'number' ? c.toLocaleString('en-US', { minimumFractionDigits: section.columns[k].kind === 'money' ? 2 : 0 }) : c))
    })
    if (section.total) {
      const totalRow = sheet.getRow(headerRow + section.rows.length + 1)
      section.total.forEach((value, k) => {
        const cell = totalRow.getCell(k + 1)
        cell.value = value
        if (typeof value === 'number') cell.numFmt = section.columns[k]?.kind === 'money' ? MONEY_FORMAT : INT_FORMAT
        measured[k]?.push(String(value))
      })
      for (let col = 1; col <= width; col++) {
        const cell = totalRow.getCell(col)
        cell.font = { bold: true, color: { argb: INK } }
        cell.fill = fill(RULE)
        cell.border = { top: { style: 'medium', color: { argb: INK } }, bottom: { style: 'thin', color: { argb: INK } } }
        cell.alignment = { vertical: 'middle', horizontal: section.columns[col - 1].align === 'right' ? 'right' : 'left' }
      }
    }
    section.columns.forEach((_, k) => (sheet.getColumn(k + 1).width = columnWidth(measured[k])))
    sheet.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }]
    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + section.rows.length, column: width } }
  }
  doc.sections.forEach(addSection)

  return { bytes: await workbook.xlsx.writeBuffer(), watermarked: watermark !== null }
}
