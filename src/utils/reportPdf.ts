import { jsPDF } from 'jspdf'
import boldUrl from '../assets/fonts/NotoSans-700Bold.subset.ttf?url'
import regularUrl from '../assets/fonts/NotoSans-400Regular.subset.ttf?url'
import { WORDMARK } from '../components/landing-v2/wordmark'
import { formatPeso, formatPlacedAt } from './format'
import { addFont } from './invoicePdf'
import { SOCIAL_LINKS, type ReportCell, type ReportColumn, type ReportDoc, type ReportMeta } from './reportTypes'
import { exporterLabel } from './transactionsXlsx'

// The report as an A4 PDF. Every page carries the SilhouFit (system) and KRAL (company) header, a faint tilted KRAL watermark behind
// the content, and a footer with KRAL's social links and the page number. Fonts are the Noto Sans subsets the invoice uses (they have the peso sign).

const FAMILY = 'NotoSans'
const MARGIN = 15
const LEFT = MARGIN
const RIGHT = 210 - MARGIN
const WIDTH = RIGHT - LEFT
const HEADER_BOTTOM = 26
const FOOTER_TOP = 297 - 18
const BODY_BOTTOM = FOOTER_TOP - 6
const PAD = 1.8
const ROW_LINE = 4.2

/** The KRAL wordmark as a PNG data URL: flat in one colour, or tilted on a square for the watermark. Null when the browser can't draw it. */
async function wordmarkPng(color: string, tilt: boolean): Promise<string | null> {
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORDMARK.width} ${WORDMARK.height}" width="${WORDMARK.width}" height="${WORDMARK.height}"><path fill="${color}" d="${WORDMARK.letters.map((l) => l.d).join('')}"/></svg>`
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    await image.decode()
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return null
    if (tilt) {
      canvas.width = canvas.height = 1400
      context.translate(700, 700)
      context.rotate(-Math.PI / 5)
      const w = 1150
      context.drawImage(image, -w / 2, (-w * WORDMARK.height) / WORDMARK.width / 2, w, (w * WORDMARK.height) / WORDMARK.width)
    } else {
      canvas.width = 900
      canvas.height = Math.round((900 * WORDMARK.height) / WORDMARK.width)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
    }
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

const show = (cell: ReportCell, column: ReportColumn) =>
  typeof cell === 'number' ? (column.kind === 'money' ? formatPeso(cell) : cell.toLocaleString('en-US')) : cell

export async function buildReportPdf(doc: ReportDoc, { exportedBy, exportedAt }: ReportMeta): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  await Promise.all([addFont(pdf, regularUrl, 'normal'), addFont(pdf, boldUrl, 'bold')])
  const [logo, watermark] = await Promise.all([wordmarkPng('#161113', false), wordmarkPng('#85807c', true)])

  // Characters the subset font lacks (CJK, emoji in a product name) would vanish, so each becomes "?".
  type Cmap = { metadata: { cmap: { unicode: { codeMap: Record<number, number> } } } }
  const maps = (['normal', 'bold'] as const).map((style) => {
    pdf.setFont(FAMILY, style)
    return (pdf.internal as unknown as { getFont: () => Cmap }).getFont().metadata.cmap.unicode.codeMap
  })
  const clean = (text: string) => [...text].map((c) => (/\s/.test(c) || maps.every((m) => m[c.codePointAt(0)!]) ? c : '?')).join('')

  const font = (size: number, style: 'normal' | 'bold' = 'normal', gray = 0) => {
    pdf.setFont(FAMILY, style)
    pdf.setFontSize(size)
    pdf.setTextColor(gray)
  }
  const wrap = (text: string, width: number) => pdf.splitTextToSize(clean(text), width) as string[]

  function chrome() {
    if (watermark) {
      pdf.saveGraphicsState()
      pdf.setGState(new (pdf.GState as unknown as new (parameters: { opacity: number }) => object)({ opacity: 0.09 }))
      pdf.addImage(watermark, 'PNG', 20, 70, 170, 170)
      pdf.restoreGraphicsState()
    }
    // Header: KRAL (the company) at the left, SilhouFit (the system) at the right.
    if (logo) pdf.addImage(logo, 'PNG', LEFT, 10, 22, (22 * WORDMARK.height) / WORDMARK.width)
    else {
      font(16, 'bold')
      pdf.text('KRAL', LEFT, 16)
    }
    font(15, 'bold')
    pdf.text('SilhouFit', RIGHT, 14, { align: 'right' })
    font(8, 'normal', 90)
    pdf.text('Retail analytics for KRAL', RIGHT, 18.5, { align: 'right' })
    pdf.setDrawColor(22, 17, 19)
    pdf.setLineWidth(0.5)
    pdf.line(LEFT, HEADER_BOTTOM - 4, RIGHT, HEADER_BOTTOM - 4)
    // Footer: the social links, then who made the file. Page numbers are added once the count is known.
    pdf.setDrawColor(190)
    pdf.setLineWidth(0.2)
    pdf.line(LEFT, FOOTER_TOP, RIGHT, FOOTER_TOP)
    font(8, 'normal', 60)
    let x = LEFT
    SOCIAL_LINKS.forEach((social, i) => {
      pdf.setTextColor(11, 87, 208)
      pdf.textWithLink(social.name, x, FOOTER_TOP + 5, { url: social.href })
      x += pdf.getTextWidth(social.name)
      if (i < SOCIAL_LINKS.length - 1) {
        pdf.setTextColor(120)
        pdf.text('  |  ', x, FOOTER_TOP + 5)
        x += pdf.getTextWidth('  |  ')
      }
    })
    font(7.5, 'normal', 100)
    pdf.text('SilhouFit for KRAL. Confidential: for store management use.', LEFT, FOOTER_TOP + 9.5)
  }

  chrome()
  let y = HEADER_BOTTOM
  const ensure = (height: number) => {
    if (y + height <= BODY_BOTTOM) return false
    pdf.addPage()
    chrome()
    y = HEADER_BOTTOM
    return true
  }

  // Title and the facts under it.
  font(20, 'bold')
  pdf.text(doc.title, LEFT, y + 6)
  y += 12
  font(9, 'normal', 80)
  const facts: [string, string][] = [['Exported by', exporterLabel(exportedBy)], ['Exported on', `${formatPlacedAt(exportedAt.toISOString())} (Manila)`], ...doc.info]
  for (const [label, value] of facts) {
    const lines = wrap(value, WIDTH - 32)
    ensure(lines.length * ROW_LINE)
    font(9, 'bold', 0)
    pdf.text(label, LEFT, y, { baseline: 'top' })
    font(9, 'normal', 40)
    pdf.text(lines, LEFT + 32, y, { baseline: 'top' })
    y += lines.length * ROW_LINE + 0.8
  }
  y += 4

  for (const section of doc.sections) {
    ensure(22)
    font(12, 'bold')
    const headings = wrap(section.heading, WIDTH)
    pdf.text(headings, LEFT, y, { baseline: 'top' })
    y += headings.length * 5.4
    if (section.note) {
      font(8.5, 'normal', 100)
      const notes = wrap(section.note, WIDTH)
      pdf.text(notes, LEFT, y, { baseline: 'top' })
      y += notes.length * 4 + 1
    }
    y += 1.5

    if (section.rows.length === 0) {
      font(9.5, 'normal', 80)
      pdf.text(clean(section.empty), LEFT, y, { baseline: 'top' })
      y += 12
      continue
    }

    // Column widths follow the longest text in each column, squeezed to the page width.
    font(9, 'normal')
    const want = section.columns.map((column, k) => {
      const texts = [column.label, ...section.rows.map((r) => show(r[k], column))]
      return Math.min(70, Math.max(...texts.map((t) => pdf.getTextWidth(clean(t)))) + PAD * 2)
    })
    const scale = WIDTH / want.reduce((a, b) => a + b, 0)
    const widths = want.map((w) => w * scale)
    const edges = widths.map((_, k) => LEFT + widths.slice(0, k).reduce((a, b) => a + b, 0))
    const place = (k: number, align: ReportColumn['align'], width = widths[k]) => (align === 'right' ? edges[k] + width - PAD : edges[k] + PAD)

    const head = () => {
      pdf.setFillColor(22, 17, 19)
      pdf.rect(LEFT, y, WIDTH, 7, 'F')
      font(9, 'bold', 255)
      section.columns.forEach((column, k) => pdf.text(clean(column.label), place(k, column.align), y + 4.9, { align: column.align === 'right' ? 'right' : 'left' }))
      y += 7
    }
    ensure(7 + 8)
    head()

    const drawRow = (cells: ReportCell[], band: boolean, total = false) => {
      const lines = section.columns.map((column, k) => (cells[k] === undefined ? [''] : wrap(show(cells[k], column), widths[k] - PAD * 2)))
      const height = Math.max(...lines.map((l) => l.length)) * ROW_LINE + 2.2
      if (ensure(height)) head()
      if (total) {
        pdf.setFillColor(217, 213, 214)
        pdf.rect(LEFT, y, WIDTH, height, 'F')
      } else if (band) {
        pdf.setFillColor(246, 244, 245)
        pdf.rect(LEFT, y, WIDTH, height, 'F')
      }
      font(9, total ? 'bold' : 'normal', total ? 0 : 30)
      section.columns.forEach((column, k) => pdf.text(lines[k], place(k, column.align), y + 1.1, { baseline: 'top', align: column.align === 'right' ? 'right' : 'left' }))
      pdf.setDrawColor(217, 213, 214)
      pdf.setLineWidth(0.15)
      pdf.line(LEFT, y + height, RIGHT, y + height)
      y += height
    }
    section.rows.forEach((cells, i) => drawRow(cells, i % 2 === 1))
    if (section.total) drawRow(section.total, false, true)
    y += 8
  }

  // Page numbers, now the count is known.
  const pages = pdf.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page)
    font(8, 'normal', 60)
    pdf.text(`Page ${page} of ${pages}`, RIGHT, FOOTER_TOP + 9.5, { align: 'right' })
  }
  pdf.setProperties({ title: `KRAL ${doc.title}`, author: exporterLabel(exportedBy), creator: 'SilhouFit' })
  return pdf.output('blob')
}
