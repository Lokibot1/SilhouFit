/**
 * Table columns, in order: select, request, order, customer, requested by, reason, amount, requested at, status, decided. `wide` ones show from @7xl of the panel;
 * below that the requester sits under the customer and the decision under the status. Written out in full so Tailwind sees the classes.
 */
export const REFUND_COLUMNS = [
  { width: 'w-16' },
  { width: 'w-22' },
  { width: 'w-22' },
  { width: '' },
  { width: 'w-36', wide: true },
  { width: 'w-36' },
  { width: 'w-28' },
  { width: 'w-36 @7xl:w-40' },
  { width: 'w-32 @7xl:w-28' },
  { width: 'w-36', wide: true },
] as const
/** Classes that hide a wide column's cell until the panel is wide enough. */
export const wideCell = (column: number) => ('wide' in REFUND_COLUMNS[column] ? 'hidden @7xl:table-cell' : '')
