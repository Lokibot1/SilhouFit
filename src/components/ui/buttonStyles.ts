// Shared by the fill buttons below; the same size as PRIMARY_BUTTON / PRIMARY_BUTTON_SM.
const FILL_BASE = 'btn-lift font-ui flex items-center justify-center gap-2 rounded-xl border-2 font-semibold disabled:cursor-progress disabled:opacity-70'
const FILL_MD = `${FILL_BASE} min-h-11 px-5 text-base`
const FILL_SM = `${FILL_BASE} min-h-9 pointer-coarse:min-h-11 max-md:min-h-11 px-3 text-sm max-md:text-base`

export const PRIMARY_BUTTON =
  'btn-lift font-ui flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-kral-red bg-kral-red px-5 text-base font-semibold text-kral-paper hover:border-kral-red-press hover:bg-kral-red-press disabled:cursor-progress disabled:opacity-70'
export const SECONDARY_BUTTON =
  'btn-lift glass-btn font-ui flex min-h-11 items-center justify-center gap-2 rounded-xl bg-fg/5 px-5 text-base font-semibold text-fg hover:bg-fg/10 hover:text-chrome-strong'

// Same height, size and radius as the Select triggers.
export const SECONDARY_BUTTON_SM =
  'btn-lift glass-btn font-ui flex min-h-9 pointer-coarse:min-h-11 max-md:min-h-11 items-center justify-center gap-2 rounded-xl bg-fg/5 px-3 text-sm max-md:text-base font-semibold text-fg hover:bg-fg/10 hover:text-chrome-strong disabled:cursor-progress disabled:opacity-70 aria-disabled:cursor-not-allowed aria-disabled:opacity-60'
export const PRIMARY_BUTTON_SM =
  'btn-lift font-ui flex min-h-9 pointer-coarse:min-h-11 max-md:min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-kral-red bg-kral-red px-3 text-sm font-semibold text-kral-paper hover:border-kral-red-press hover:bg-kral-red-press disabled:cursor-progress disabled:opacity-70'

// Staff, admin and superadmin actions: green creates, blue updates, red tint deletes. Fill text is canvas, not white, so the dark-mode pastel tokens keep their contrast.
const CREATE = 'border-success bg-success text-canvas hover:bg-success/90'
const UPDATE = 'border-info bg-info text-canvas hover:bg-info/90'
const DANGER = 'border-danger/50 bg-danger/10 text-danger hover:border-danger hover:bg-danger/20'

export const CREATE_BUTTON = `${FILL_MD} ${CREATE}`
export const CREATE_BUTTON_SM = `${FILL_SM} ${CREATE}`
export const UPDATE_BUTTON = `${FILL_MD} ${UPDATE}`
export const UPDATE_BUTTON_SM = `${FILL_SM} ${UPDATE}`
export const DANGER_BUTTON = `${FILL_MD} ${DANGER}`
export const DANGER_BUTTON_SM = `${FILL_SM} ${DANGER}`
