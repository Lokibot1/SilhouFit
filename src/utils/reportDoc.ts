import { formatDayWithYear, formatPeso } from './format'
import type { ReportDoc } from './reportTypes'
import type { InventoryReport, SalesReport } from '../service/reports'
import { SALES_NOUN, type Granularity } from './period'

// Turns the loaded figures into the neutral ReportDoc that the Excel and PDF writers both draw.

const moneyCol = { align: 'right', kind: 'money' } as const
const intCol = { align: 'right', kind: 'int' } as const

export function salesDoc(report: SalesReport): ReportDoc {
  const { series, bestSellers, mix } = report
  const bucket = (date: string) => formatDayWithYear(date)
  return {
    title: 'Sales report',
    filename: 'sales-report',
    info: [
      ['Period', report.periodScope],
      ['Dates', report.start === report.end ? formatDayWithYear(report.start) : `${formatDayWithYear(report.start)} to ${formatDayWithYear(report.end)}`],
      ['Revenue', formatPeso(report.revenue)],
      ['Orders placed', String(report.orders)],
    ],
    sections: [
      {
        heading: `${SALES_NOUN[report.granularity as Granularity]} sales, ${report.seriesScope}`,
        columns: [{ label: 'Starting' }, { label: 'Sales (PHP)', ...moneyCol }],
        rows: series.map((s) => [bucket(s.date), s.total]),
        total: ['Total', series.reduce((sum, s) => sum + s.total, 0)],
        empty: 'No sales in this window.',
      },
      {
        heading: `Best sellers, ${report.periodScope}`,
        note: 'Ranked by the orders that contain the item. An order counts once, however many pieces it has.',
        columns: [{ label: '#', ...intCol }, { label: 'Product' }, { label: 'Category' }, { label: 'Orders', ...intCol }, { label: 'Stock now', ...intCol }],
        rows: bestSellers.map((b, i) => [i + 1, b.name, b.category, b.orders, b.stock]),
        empty: 'No orders in this period.',
      },
      {
        heading: `Units sold by category, ${report.periodScope}`,
        columns: [{ label: 'Category' }, { label: 'Units', ...intCol }],
        rows: mix.map((m) => [m.category, m.units]),
        total: ['Total', mix.reduce((sum, m) => sum + m.units, 0)],
        empty: 'No units sold in this period.',
      },
    ],
  }
}

export function inventoryDoc(report: InventoryReport): ReportDoc {
  const toRows = (rows: InventoryReport['rows']) => rows.map((r) => [r.product, r.category, r.size || '-', r.colour || '-', r.sku, r.stock])
  const columns = [{ label: 'Product' }, { label: 'Category' }, { label: 'Size' }, { label: 'Colour' }, { label: 'SKU' }, { label: 'Stock', ...intCol }]
  return {
    title: 'Inventory report',
    filename: 'inventory-report',
    info: [
      ['Products', String(report.products)],
      ['Units in stock', String(report.units)],
      ['Low stock', `${report.low.length} (${report.lowThreshold} or fewer left)`],
      ['Sold out', String(report.out.length)],
    ],
    sections: [
      {
        heading: 'Low-stock alerts',
        note: `Sizes with 1 to ${report.lowThreshold} left. Sold-out sizes are listed after it.`,
        columns,
        rows: toRows(report.low),
        empty: 'No size is running low.',
      },
      { heading: 'Sold-out sizes', columns, rows: toRows(report.out), empty: 'No size is sold out.' },
      {
        heading: 'Stock per product and size',
        columns,
        rows: toRows(report.rows),
        total: ['Total units', report.units],
        empty: 'There are no products yet.',
      },
    ],
  }
}
