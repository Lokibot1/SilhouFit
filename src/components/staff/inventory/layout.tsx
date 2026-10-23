// Sizes shared by the inventory table, its card list and their skeletons, so rows are the same height before and after the data arrives.
export const TABLE_ROW = 'h-16'
export const CARD_ROW = 'h-24'
export const TABLE_HEAD_ROW = 'h-11'
// The header sticks under the 3.5rem top bar. It stays in the table (no overflow wrapper) or sticky would stop working.
export const TH = 'sticky top-14 z-10 h-11 border-b border-line bg-canvas-sub px-2 @6xl:px-3 text-left text-sm font-semibold text-fg'
export const TD = 'border-b border-line px-2 @6xl:px-3'

// The pager footer (Pagination) and its skeleton share these classes, so the footer is the same height before and after the data arrives.
export const PAGER_FOOTER = 'mt-4 flex flex-wrap items-center justify-end gap-3'
export const PAGER_PAGINATION = '[&>div]:mt-0'
// Mirrors Pagination's own layout and control heights (SHOP_SECONDARY: 36px, 44px on touch).
export const PAGER_PAGINATION_SKELETON = 'flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-6'
export const PAGER_CONTROL = 'h-9 pointer-coarse:h-11'

// The table is `table-fixed`, so these widths hold with or without rows. Shares of the table; Product is the only unsized column
// and takes what is left, and Actions is fixed. Column widths cannot mix % and px, so on a wide table Product's share is stepped
// down by container width (1200, 1450 and 1620px of table) and the other columns scale up, which keeps Product near 310-360px
// instead of stranding the names far from the Category column. Written out in full so Tailwind sees the classes.
const COLS_ALERTS = [
  'w-[11%] @[1200px]:w-[11.7%] @[1450px]:w-[12.1%] @[1620px]:w-[12.5%]',
  'w-[14%] @[1200px]:w-[14.8%] @[1450px]:w-[15.5%] @[1620px]:w-[15.9%]',
  'w-[11%] @[1200px]:w-[11.7%] @[1450px]:w-[12.1%] @[1620px]:w-[12.5%]',
  'w-[12%] @[1200px]:w-[12.7%] @[1450px]:w-[13.2%] @[1620px]:w-[13.6%]',
  'w-[7%] @[1200px]:w-[7.5%] @[1450px]:w-[7.7%] @[1620px]:w-[7.9%]',
  'w-[14%] @[1200px]:w-[14.9%] @[1450px]:w-[15.5%] @[1620px]:w-[15.8%]',
  'w-12',
]
const COLS_PLAIN = [
  'w-[15%] @[1200px]:w-[16.4%] @[1450px]:w-[17.1%] @[1620px]:w-[17.5%]',
  'w-[16%] @[1200px]:w-[17.5%] @[1450px]:w-[18.2%] @[1620px]:w-[18.7%]',
  'w-[13%] @[1200px]:w-[14.2%] @[1450px]:w-[14.8%] @[1620px]:w-[15.2%]',
  'w-[15%] @[1200px]:w-[16.2%] @[1450px]:w-[16.8%] @[1620px]:w-[17.2%]',
  'w-[8%] @[1200px]:w-[8.7%] @[1450px]:w-[9.1%] @[1620px]:w-[9.4%]',
  'w-12',
]

/** `showAlerts` adds the Stock alert column after Stock. */
export function InventoryColgroup({ showAlerts }: { showAlerts: boolean }) {
  return (
    <colgroup>
      <col />
      {(showAlerts ? COLS_ALERTS : COLS_PLAIN).map((width, n) => (
        <col key={n} className={width} />
      ))}
    </colgroup>
  )
}

// The skeleton is drawn before the rows arrive, so it uses the column layout the table last had. With no history it assumes the
// Stock alert column: nearly every catalogue has low or out-of-stock products, so that layout is the likelier one.
const ALERTS_KEY = 'silhoufit-inventory-alerts'
let lastShowAlerts = true

export function rememberedShowAlerts(): boolean {
  try {
    const saved = sessionStorage.getItem(ALERTS_KEY)
    if (saved !== null) lastShowAlerts = saved === '1'
  } catch {
    // Storage is unavailable: the module variable still holds it for this page load.
  }
  return lastShowAlerts
}

export function rememberShowAlerts(showAlerts: boolean) {
  lastShowAlerts = showAlerts
  try {
    sessionStorage.setItem(ALERTS_KEY, showAlerts ? '1' : '0')
  } catch {
    // Same as above.
  }
}
