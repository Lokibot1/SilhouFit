// The table is `table-fixed`, so seven equal columns hold with or without rows: Order, Customer, Method, Status, Date and time, Provider, Amount.
const COLUMNS = 7

export function TransactionColgroup() {
  return (
    <colgroup>
      {Array.from({ length: COLUMNS }, (_, n) => (
        <col key={n} />
      ))}
    </colgroup>
  )
}

// The pager picks its rows by the list's own width, not the viewport. With thousands of orders, "Displaying 1491-1500 of 3300" and the
// page numbers need about 660px side by side; narrower than @2xl they stack, and the page-of text never wraps. That keeps the footer one
// of two fixed heights, which the skeleton repeats.
export const PAGER_ROWS =
  '@max-2xl:[&>div]:flex-col @max-2xl:[&>div]:items-end @max-2xl:[&>div]:gap-3 [&_nav_p]:px-0 [&_nav_p]:whitespace-nowrap'
export const PAGER_SKELETON_ROWS = 'flex flex-col items-end gap-3 @2xl:flex-row @2xl:items-center @2xl:justify-end @2xl:gap-6'

// The totals strip sits under the page title, outside the table panel. 2 x 2 cards on a phone, one row of four from @lg of the page width
// (the strip's wrapper is the size container). The skeleton repeats both, so loading and loaded are the same height: the caption line
// under Orders is always reserved, and so is the pill row under it (24px: the Transactions tile's this-month trend).
export const TOTALS_WRAP = '@container'
export const TOTALS_GRID = 'grid grid-cols-2 gap-2 @lg:grid-cols-4 @lg:gap-3'
// The first tile carries the trend pill and its "this month" label, which need more than half of a phone's width, so it takes the first row alone there.
export const TOTALS_FIRST_TILE = '@max-lg:col-span-2'
export const TOTALS_TILE = 'relative h-28 min-w-0 rounded-xl border border-line bg-canvas-sub px-3 py-3 @sm:px-4'
