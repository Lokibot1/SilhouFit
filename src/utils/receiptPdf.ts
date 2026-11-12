import { jsPDF } from 'jspdf'
import boldUrl from '../assets/fonts/NotoSans-700Bold.subset.ttf?url'
import regularUrl from '../assets/fonts/NotoSans-400Regular.subset.ttf?url'
import type { PlacedOrder } from './checkout'
import { formatPeso, formatPlacedAt } from './format'
import { addFont } from './invoicePdf'

// A customer's order receipt as a narrow, till-roll style PDF. It is a receipt, not a BIR sales invoice: that needs the
// seller's tax details, which the shop issues itself. Loaded on demand (this module is a lazy chunk).
const FAMILY = 'NotoSans'
const WIDTH = 80
const MARGIN = 6
const RIGHT = WIDTH - MARGIN
const LINE = 4

// The embedded subset font has no emoji. Left alone they would draw as blanks.
const plain = (text: string) => text.replace(/\p{Extended_Pictographic}|‍|️/gu, '').trim()

function draw(doc: jsPDF, order: PlacedOrder): number {
  let y = MARGIN
  const font = (size: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont(FAMILY, style)
    doc.setFontSize(size)
  }
  const wrap = (text: string, width: number) => doc.splitTextToSize(text, width) as string[]
  const write = (text: string, x: number, width: number, align: 'left' | 'right' | 'center' = 'left') => {
    const lines = wrap(text, width)
    lines.forEach((line, i) => doc.text(line, x, y + i * LINE, { baseline: 'top', align }))
    y += lines.length * LINE
  }
  const center = (text: string) => write(text, WIDTH / 2, RIGHT - MARGIN, 'center')
  const rule = () => {
    doc.setLineDashPattern([1, 1], 0)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, y + 1.5, RIGHT, y + 1.5)
    doc.setLineDashPattern([], 0)
    y += 4
  }
  const muted = () => doc.setTextColor(90, 90, 90)
  const ink = () => doc.setTextColor(0, 0, 0)
  const pair = (label: string, value: string, bold = false) => {
    font(bold ? 10 : 8.5, bold ? 'bold' : 'normal')
    doc.text(label, MARGIN, y, { baseline: 'top' })
    doc.text(value, RIGHT, y, { baseline: 'top', align: 'right' })
    y += LINE + (bold ? 0.5 : 0)
  }
  const detail = (label: string, value: string) => {
    font(8.5)
    doc.text(label, MARGIN, y, { baseline: 'top' })
    const lines = wrap(plain(value), RIGHT - MARGIN - 18)
    lines.forEach((line, i) => doc.text(line, RIGHT, y + i * LINE, { baseline: 'top', align: 'right' }))
    y += lines.length * LINE
  }

  // The name gets its own tall block: a 15 pt line in a 4 mm row would run into the line under it.
  font(22, 'bold')
  doc.text('KRAL', WIDTH / 2, y, { baseline: 'top', align: 'center' })
  y += 10
  font(8)
  muted()
  doc.text('ORDER RECEIPT', WIDTH / 2, y, { baseline: 'top', align: 'center' })
  ink()
  y += 6
  rule()

  pair('Order no.', order.orderId, true)
  if (order.placedAt) pair('Date', formatPlacedAt(order.placedAt))
  rule()

  const count = order.items.reduce((sum, item) => sum + item.qty, 0)
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0)
  font(7.5)
  muted()
  doc.text(`ITEMS (${count})`, MARGIN, y, { baseline: 'top' })
  doc.text('AMOUNT', RIGHT, y, { baseline: 'top', align: 'right' })
  ink()
  y += LINE + 1
  for (const item of order.items) {
    font(9, 'bold')
    const top = y
    write(plain(item.name), MARGIN, RIGHT - MARGIN - 22)
    // The line total sits on the first line of the name.
    doc.text(formatPeso(item.price * item.qty), RIGHT, top, { baseline: 'top', align: 'right' })
    font(8)
    muted()
    write([[item.size && `Size ${item.size}`, item.color].filter(Boolean).join(' · '), `${formatPeso(item.price)} × ${item.qty}`].filter(Boolean).join(' · '), MARGIN, RIGHT - MARGIN)
    ink()
    y += 1.5
  }
  rule()
  // A discount is whatever the total is short of the items and the delivery fee.
  const discount = Math.round((subtotal + order.shipping - order.total) * 100) / 100
  pair('Subtotal', formatPeso(subtotal))
  if (discount > 0) pair('Discount', `-${formatPeso(discount)}`)
  pair('Shipping', order.shipping === 0 ? 'Free' : formatPeso(order.shipping))
  y += 1
  doc.setLineWidth(0.4)
  doc.line(MARGIN, y, RIGHT, y)
  y += 2
  font(12, 'bold')
  doc.text('Total', MARGIN, y, { baseline: 'top' })
  doc.text(formatPeso(order.total), RIGHT, y, { baseline: 'top', align: 'right' })
  y += LINE + 2.5
  detail('Payment', order.payment)
  rule()

  font(9, 'bold')
  write('Deliver to', MARGIN, RIGHT - MARGIN)
  y += 1
  if (order.recipient) detail('Name', order.recipient)
  if (order.address) detail('Address', order.address)
  if (order.phone) detail('Phone', order.phone)
  if (order.eta) detail('When', order.eta)
  if (order.note && plain(order.note)) detail('Your note', plain(order.note))
  rule()
  font(9, 'bold')
  center('Thank you for shopping at KRAL.')
  y += 1.5
  font(7)
  muted()
  center('This is an order receipt, not an official invoice.')
  ink()
  return y + MARGIN
}

/** The receipt as an 80 mm wide PDF, as long as its content needs. */
export async function renderReceiptPdf(order: PlacedOrder): Promise<Blob> {
  const fonts = new jsPDF({ unit: 'mm', format: [WIDTH, 600] })
  await Promise.all([addFont(fonts, regularUrl, 'normal'), addFont(fonts, boldUrl, 'bold')])
  // Measure on a tall page first, then draw on a page cut to the content.
  const height = draw(fonts, order)
  const doc = new jsPDF({ unit: 'mm', format: [WIDTH, Math.ceil(height)], compress: true })
  await Promise.all([addFont(doc, regularUrl, 'normal'), addFont(doc, boldUrl, 'bold')])
  draw(doc, order)
  return doc.output('blob')
}
