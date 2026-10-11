// Skeuomorphic shop controls (see .skeuo in index.css): 36px with a mouse, 44px on touch screens.
// The shared PRIMARY_BUTTON / SECONDARY_BUTTON stay as they are for the auth pages.
const BASE =
  'font-ui flex min-h-9 pointer-coarse:min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold'

export const SHOP_PRIMARY = `skeuo-ink ${BASE}`
export const SHOP_SECONDARY = `skeuo ${BASE}`
/** Toggle and pill buttons: the selected one takes the ink face from a sliding indicator behind it. */
export const SHOP_TOGGLE = `skeuo skeuo-slide ${BASE}`
