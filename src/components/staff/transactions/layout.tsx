// The table is `table-fixed`, so these widths hold with or without rows. Shares of the table; Order is the only unsized column
// and takes what is left. Column widths cannot mix % and px, so on a wide table the others are stepped down (past 1200px of table)
// so the order and customer do not sit far from the date. Written out in full so Tailwind sees the classes.
const COLS = ['w-[26%] @[1200px]:w-[20%]', 'w-[12%] @[1200px]:w-[10%]', 'w-[16%] @[1200px]:w-[14%]']

export function TransactionColgroup() {
  return (
    <colgroup>
      <col />
      {COLS.map((width, n) => (
        <col key={n} className={width} />
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
