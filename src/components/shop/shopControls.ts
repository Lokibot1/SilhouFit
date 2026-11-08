// Skeuomorphic shop controls (see .skeuo in index.css): 36px with a mouse, 44px on touch screens.
// The shared PRIMARY_BUTTON / SECONDARY_BUTTON stay as they are for the auth pages.
const BASE =
  'font-ui flex min-h-9 pointer-coarse:min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold'

export const SHOP_PRIMARY = `skeuo-ink ${BASE}`
export const SHOP_SECONDARY = `skeuo ${BASE}`
/** Toggle and pill buttons: the selected one takes the ink face from a sliding indicator behind it. */
export const SHOP_TOGGLE = `skeuo skeuo-slide ${BASE}`

// KRAL shop controls (DESIGN.md section 6): square, mono uppercase, 44px. 16px on phones, the 12px label size from md.
// Hover fills never apply to a disabled or aria-disabled control.
const KRAL_BASE =
  'kral-focus font-kral-mono flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-none px-4 text-base font-medium whitespace-nowrap uppercase transition-colors duration-150 ease-out motion-reduce:transition-none md:text-xs md:tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50'

/** Red fill, Paper text; hover darkens to kral-red-press. */
export const KRAL_PRIMARY = `${KRAL_BASE} border border-kral-red bg-kral-red text-kral-paper not-disabled:not-aria-disabled:hover:border-kral-red-press not-disabled:not-aria-disabled:hover:bg-kral-red-press`
/** 1px outline, transparent; hover fills with the foreground. */
export const KRAL_SECONDARY = `${KRAL_BASE} border border-kral-fg bg-transparent text-kral-fg not-disabled:not-aria-disabled:hover:bg-kral-fg not-disabled:not-aria-disabled:hover:text-kral-bg`
/** Filter and view chips: a softer outline; pressed is filled with the foreground. */
export const KRAL_CHIP = `${KRAL_BASE} border border-kral-muted bg-transparent text-kral-fg hover:border-kral-fg hover:bg-kral-fg/10 aria-pressed:border-kral-fg aria-pressed:bg-kral-fg aria-pressed:text-kral-bg aria-pressed:hover:bg-kral-fg aria-[current=page]:border-kral-fg aria-[current=page]:bg-kral-fg aria-[current=page]:text-kral-bg aria-[current=page]:hover:bg-kral-fg`
/** Text and price inputs in the filter panel. */
export const KRAL_INPUT =
  'kral-focus font-kral-mono mt-1 min-h-11 w-full rounded-none normal-case border border-kral-fg bg-transparent px-3 text-base text-kral-fg placeholder:text-kral-muted'
