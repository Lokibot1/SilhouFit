/**
 * Table columns, in order: number, select, request, order, customer, requested by, reason, amount, requested at, status, decided.
 * The table sizes each column to its own content and shares what is left between them; the long text in a cell is capped (see RefundsTable), so it
 * ends in an ellipsis instead of pushing the table wider than its panel. `select` only shows while the admin is selecting; `wide` ones show from @7xl
 * of the panel (below that the requester sits under the customer and the decision under the status).
 */
export const REFUND_COLUMNS = [
  { key: 'num' },
  { key: 'select', select: true },
  { key: 'request' },
  { key: 'order' },
  { key: 'customer' },
  { key: 'by', wide: true },
  { key: 'reason' },
  { key: 'amount' },
  { key: 'at' },
  { key: 'status' },
  { key: 'decided', wide: true },
] as const

export type RefundColumnKey = (typeof REFUND_COLUMNS)[number]['key']

/** The columns on show: the select column only while selecting. */
export const refundColumns = (selecting: boolean) => REFUND_COLUMNS.filter((column) => selecting || !('select' in column))

/** Classes that hide a wide column's cell until the panel is wide enough. */
export const wideCell = (key: RefundColumnKey) => ('wide' in REFUND_COLUMNS.find((column) => column.key === key)! ? 'hidden @7xl:table-cell' : '')
