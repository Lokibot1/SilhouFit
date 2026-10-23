import { jsPDF } from 'jspdf'
import boldUrl from '../assets/fonts/NotoSans-700Bold.subset.ttf?url'
import regularUrl from '../assets/fonts/NotoSans-400Regular.subset.ttf?url'
import { formatPeso, formatPlacedAt } from './format'
import { INVOICE_NOTICE, PAYMENT_LABELS, RETURN_NOTICE, type Invoice } from './invoiceTax'

// Loaded on demand (this module is a lazy chunk). The subset fonts are Noto Sans (SIL OFL) with the peso sign, which the built-in PDF fonts lack.
const FAMILY = 'NotoSans'

const MARGIN = 15
const RIGHT = 210 - MARGIN
const BOTTOM = 297 - 18
const LINE = 4.4
// Right edges and left edge of the item columns.
const COL = { qty: MARGIN + 10, desc: MARGIN + 14, price: RIGHT - 28, amount: RIGHT }

async function addFont(doc: jsPDF, url: string, style: 'normal' | 'bold') {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const file = `${FAMILY}-${style}.ttf`
  doc.addFileToVFS(file, btoa(binary))
  doc.addFont(file, FAMILY, style)
}

const money = (centavos: number) => formatPeso(centavos / 100)

/** The PDF, and which fields had characters the embedded font can't draw (each was replaced with "?"). */
export interface InvoicePdf {
  blob: Blob
  replaced: string[]
}

/** The invoice as an A4 PDF. Long text wraps and items continue on further pages. */
export async function renderInvoicePdf(source: Invoice): Promise<InvoicePdf> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  await Promise.all([addFont(doc, regularUrl, 'normal'), addFont(doc, boldUrl, 'bold')])
  // The subset font has no CJK or emoji. Left alone they would vanish from the PDF, so each becomes "?" and the caller is told which fields.
  type Cmap = { metadata: { cmap: { unicode: { codeMap: Record<number, number> } } } }
  const codeMaps = (['normal', 'bold'] as const).map((style) => {
    doc.setFont(FAMILY, style)
    return (doc.internal as unknown as { getFont: () => Cmap }).getFont().metadata.cmap.unicode.codeMap
  })
  const replaced = new Set<string>()
  const clean = (text: string, field: string) =>
    [...text]
      .map((char) => {
        if (/\s/.test(char) || codeMaps.every((map) => map[char.codePointAt(0)!])) return char
        replaced.add(field)
        return '?'
      })
      .join('')
  const invoice: Invoice = {
    ...source,
    orderNo: clean(source.orderNo, 'the order number'),
    seller: {
      ...source.seller,
      registeredName: clean(source.seller.registeredName, 'the seller name'),
      address: clean(source.seller.address, 'the seller address'),
      permitNo: clean(source.seller.permitNo, 'the permit number'),
      footerText: clean(source.seller.footerText, 'the footer text'),
    },
    buyer: source.buyer && { name: clean(source.buyer.name, 'the buyer name'), tin: source.buyer.tin, address: clean(source.buyer.address, 'the buyer address') },
    lines: source.lines.map((line) => ({ ...line, description: clean(line.description, 'an item name') })),
  }
  const { seller, buyer, totals } = invoice
  const draft = invoice.status === 'draft'
  // A duplicate's stamp sits above the content.
  const top = MARGIN + (invoice.reprintCount > 0 ? 6 : 0)
  let y = top

  const font = (size: number, style: 'normal' | 'bold' = 'normal', gray = 0) => {
    doc.setFont(FAMILY, style)
    doc.setFontSize(size)
    doc.setTextColor(gray)
  }
  const wrap = (text: string, width: number) => doc.splitTextToSize(text, width) as string[]
  const write = (text: string, x: number, width: number, lineHeight = LINE) => {
    const lines = wrap(text, width)
    doc.text(lines, x, y, { baseline: 'top', lineHeightFactor: lineHeight / (doc.getFontSize() * 0.3528) })
    return lines.length * lineHeight
  }

  function stamps() {
    if (draft) {
      font(27, 'bold', 215)
      doc.text('DRAFT — NOT A VALID INVOICE', 105, 150, { align: 'center', angle: 35 })
    }
    if (invoice.reprintCount > 0) {
      font(9, 'bold')
      const label = `DUPLICATE COPY (reprint ${invoice.reprintCount})`
      const width = doc.getTextWidth(label) + 6
      doc.setLineWidth(0.4)
      doc.rect(RIGHT - width, 8, width, 6.5)
      doc.text(label, RIGHT - width / 2, 12.6, { align: 'center' })
    }
  }
  stamps()

  function ensure(height: number, repeatHead = false) {
    if (y + height <= BOTTOM) return
    doc.addPage()
    stamps()
    y = top
    if (repeatHead) tableHead()
  }

  // Seller, then the document title on the right.
  const titleX = RIGHT
  font(16, 'bold')
  doc.text('SALES INVOICE', titleX, y, { align: 'right', baseline: 'top' })
  font(10.5, 'bold')
  doc.text(draft ? 'DRAFT' : `No. ${invoice.invoiceNo}`, titleX, y + 8, { align: 'right', baseline: 'top' })
  font(13, 'bold')
  y += write(seller.registeredName, MARGIN, 110, 5.8) + 0.5
  font(9)
  for (const text of [
    `${seller.vatRegistered ? 'VAT Reg.' : 'NON-VAT Reg.'} TIN ${seller.tin}-${seller.branchCode}`,
    seller.address,
    `Permit to Use No. ${seller.permitNo}`,
  ])
    y += write(text, MARGIN, 110)
  if (seller.sample) {
    y += 1
    font(8, 'bold', 90)
    y += write('SAMPLE MERCHANT PROFILE', MARGIN, 110)
  }
  y = Math.max(y, top + 18) + 4
  doc.setDrawColor(0)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, RIGHT, y)
  y += 3

  // A returned order is marked, not credited: no credit note is made here (see RETURN_NOTICE).
  if (invoice.returned) {
    font(10, 'bold')
    const banner = `ORDER RETURNED — REFUNDED IN FULL on ${formatPlacedAt(invoice.returned.returnedAt)}`
    const height = wrap(banner, RIGHT - MARGIN - 6).length * LINE + LINE + 5
    ensure(height + 3)
    doc.setLineWidth(0.5)
    doc.rect(MARGIN, y, RIGHT - MARGIN, height)
    y += 2
    y += write(banner, MARGIN + 3, RIGHT - MARGIN - 6) + 1
    font(8, 'normal', 70)
    write(RETURN_NOTICE, MARGIN + 3, RIGHT - MARGIN - 6)
    y += LINE + 5
    doc.setLineWidth(0.3)
  }

  // Meta and buyer.
  font(9)
  const meta: [string, string][] = [
    ['Date and time', formatPlacedAt(invoice.placedAt)],
    ['Order', invoice.orderNo],
    ['Payment', invoice.paymentMethod ? PAYMENT_LABELS[invoice.paymentMethod] : 'Not recorded'],
    ['Sold to', buyer ? buyer.name : 'Walk-in customer'],
    ...(buyer ? ([['Buyer TIN', buyer.tin], ['Buyer address', buyer.address]] as [string, string][]) : []),
  ]
  for (const [label, value] of meta) {
    ensure(LINE * 2)
    font(9, 'bold')
    doc.text(label, MARGIN, y, { baseline: 'top' })
    font(9)
    y += write(value, MARGIN + 32, RIGHT - MARGIN - 32)
  }
  y += 3

  function tableHead() {
    doc.setLineWidth(0.3)
    doc.line(MARGIN, y, RIGHT, y)
    y += 1.5
    font(9, 'bold')
    doc.text('Qty', COL.qty, y, { align: 'right', baseline: 'top' })
    doc.text('Description', COL.desc, y, { baseline: 'top' })
    doc.text('Unit price', COL.price, y, { align: 'right', baseline: 'top' })
    doc.text('Amount', COL.amount, y, { align: 'right', baseline: 'top' })
    y += LINE + 1.5
    doc.line(MARGIN, y, RIGHT, y)
    y += 1.5
  }
  ensure(30)
  tableHead()

  const VAT_TAG = { vatable: '', exempt: ' (VAT-exempt)', zero: ' (Zero-rated)' }
  for (const line of invoice.lines) {
    const text = `${line.description}${seller.vatRegistered ? VAT_TAG[line.vatClass] : ''}`
    font(9)
    const rows = wrap(text, COL.price - 22 - COL.desc)
    ensure(rows.length * LINE + 2, true)
    font(9)
    doc.text(String(line.units), COL.qty, y, { align: 'right', baseline: 'top' })
    doc.text(rows, COL.desc, y, { baseline: 'top' })
    doc.text(money(line.unitPrice), COL.price, y, { align: 'right', baseline: 'top' })
    doc.text(money(line.amount), COL.amount, y, { align: 'right', baseline: 'top' })
    y += rows.length * LINE + 2
    doc.setDrawColor(200)
    doc.setLineWidth(0.1)
    doc.line(MARGIN, y - 1, RIGHT, y - 1)
    doc.setDrawColor(0)
  }
  y += 2

  // Totals, kept together on one page.
  const totalRows: [string, number, boolean][] = seller.vatRegistered
    ? [
        ['VATable Sales', totals.vatableSales, false],
        ['VAT-Exempt Sales', totals.vatExempt, false],
        ['Zero-Rated Sales', totals.zeroRated, false],
        ['VAT (12%)', totals.vatAmount, false],
        ['Total Amount Due', totals.totalDue, true],
      ]
    : [['Total Amount Due', totals.totalDue, true]]
  ensure(totalRows.length * (LINE + 1) + 30)
  for (const [label, amount, strong] of totalRows) {
    font(strong ? 11 : 9, strong ? 'bold' : 'normal')
    doc.text(label, COL.price - 14, y, { align: 'right', baseline: 'top' })
    doc.text(money(amount), COL.amount, y, { align: 'right', baseline: 'top' })
    y += strong ? LINE + 2 : LINE + 1
  }
  if (seller.vatRegistered) {
    font(8, 'normal', 90)
    doc.text('Prices include 12% VAT.', COL.amount, y, { align: 'right', baseline: 'top' })
    y += LINE
  }
  y += 5

  font(9)
  if (seller.footerText.trim()) y += write(seller.footerText, MARGIN, RIGHT - MARGIN) + 3
  font(8, 'normal', 80)
  write(INVOICE_NOTICE, MARGIN, RIGHT - MARGIN)

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    font(8, 'normal', 110)
    doc.text(`Page ${page} of ${pages}`, 105, 297 - 9, { align: 'center' })
  }
  return { blob: doc.output('blob'), replaced: [...replaced] }
}
