// Shared by CountrySelect and Select: where a listbox panel goes, and how it and its rows look.
const EDGE = 8
const MENU_MAX_HEIGHT = 360

export interface Place {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
  above: boolean
}

/**
 * Fixed to the viewport (rendered in a portal) so no ancestor can clip it and the page never grows. Opens below the
 * anchor unless there is more room above; `inset` shifts the left edge out from the anchor.
 */
export function computePlace(anchor: HTMLElement, preferredWidth: number, inset = 0): Place {
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(preferredWidth, window.innerWidth - EDGE * 2)
  const left = Math.min(Math.max(EDGE, rect.left - inset), window.innerWidth - width - EDGE)
  const below = window.innerHeight - rect.bottom - EDGE - 4
  const above = rect.top - EDGE - 4
  if (below >= 240 || below >= above) {
    return { left, width, top: rect.bottom + 4, maxHeight: Math.min(MENU_MAX_HEIGHT, below), above: false }
  }
  return {
    left,
    width,
    bottom: window.innerHeight - rect.top + 4,
    maxHeight: Math.min(MENU_MAX_HEIGHT, above),
    above: true,
  }
}

export const LISTBOX_PANEL =
  'fixed z-[85] flex flex-col overflow-hidden rounded-xl border border-line-strong bg-canvas-raised text-fg shadow-[0_18px_36px_-12px_rgb(var(--shadow-key)/var(--shadow-b))]'

export const LISTBOX_LIST = 'relative min-h-0 flex-1 overflow-y-auto overscroll-contain py-1'

export const optionRow = (active: boolean, selected: boolean) =>
  `flex min-h-9 pointer-coarse:min-h-11 cursor-pointer items-center gap-2 px-3 text-base ${active ? 'bg-fg/10' : ''} ${
    selected ? 'font-semibold' : ''
  }`
