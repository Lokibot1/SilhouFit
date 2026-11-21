/**
 * Table columns, in order: number, order, customer, reason, amount, status, created, attempts.
 * The table sizes each column to its own content and shares what is left between them; the long text in a cell is capped (see RefundsTable), so it
 * ends in an ellipsis instead of pushing the table wider than its panel. `wide` ones show from @7xl of the panel.
 */
export const REFUND_COLUMNS = [
  { key: 'num' },
  { key: 'order' },
  { key: 'customer' },
  { key: 'reason' },
  { key: 'amount' },
  { key: 'status' },
  { key: 'at' },
  { key: 'attempts', wide: true },
] as const

export type RefundColumnKey = (typeof REFUND_COLUMNS)[number]['key']

/** Classes that hide a wide column's cell until the panel is wide enough. */
export const wideCell = (key: RefundColumnKey) => ('wide' in REFUND_COLUMNS.find((column) => column.key === key)! ? 'hidden @7xl:table-cell' : '')
