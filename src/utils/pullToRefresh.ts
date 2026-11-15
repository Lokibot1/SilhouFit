/** Finger distance moved (px) before a pull starts; below it the touch is still a tap or a scroll. */
export const PULL_SLOP = 8
/** Content offset (px) that arms the refresh. */
export const PULL_THRESHOLD = 72
/** Content offset (px) the list rests at while the refresh runs. */
export const PULL_HOLD = 56
const MAX_PULL = 160
/** The first pixels follow at this share of the finger. */
const FIRST_PIXELS = 0.35
const K = MAX_PULL / FIRST_PIXELS

/** Content offset for a finger drag of `drag` px: 35% at first, harder the further it goes, never past MAX_PULL. */
export function pullOffset(drag: number) {
  return drag <= 0 ? 0 : MAX_PULL * (1 - Math.exp(-drag / K))
}

/** 0 to 1 as the offset approaches the threshold. */
export function pullProgress(offset: number) {
  return Math.min(1, Math.max(0, offset / PULL_THRESHOLD))
}

export const pullArmed = (offset: number) => offset >= PULL_THRESHOLD
