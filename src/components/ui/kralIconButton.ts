/** KRAL top-bar icon button: 44px square, borderless, tints on hover; the current page keeps the tint. */
export const KRAL_ICON_BUTTON =
  'kral-focus relative flex size-11 shrink-0 cursor-pointer items-center justify-center text-kral-fg transition-colors duration-150 ease-out hover:bg-kral-fg/10 aria-pressed:bg-kral-fg/10 aria-[current=page]:bg-kral-fg/10 motion-reduce:transition-none'

/** The count badge pinned to the top-right corner of a KRAL icon button, like a notification dot. Decorative: the button's aria-label carries the number. */
export const KRAL_ICON_COUNT =
  'font-kral-mono pointer-events-none absolute top-0.5 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-kral-fg px-1 text-xs leading-none font-medium text-kral-bg tabular-nums'
