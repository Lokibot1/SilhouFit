// The avatar's skin tone, 0 (lightest) to 100 (deepest). The stops are the Monk Skin Tone scale, reordered where the
// published values are not strictly darker each step, and the 5th sits at 44 so the default lands exactly on it.
const STOPS: Array<[number, string]> = [
  [0, '#f6ede4'],
  [11, '#f7ead0'],
  [22, '#f3e7db'],
  [33, '#eadaba'],
  [44, '#d7bd96'],
  [56, '#a07e56'],
  [67, '#825c43'],
  [78, '#604134'],
  [89, '#3a312a'],
  [100, '#292420'],
]

export const SKIN_TONE_DEFAULT = 44

export const SKIN_TONE_GRADIENT = `linear-gradient(to right, ${STOPS.map(([at, hex]) => `${hex} ${at}%`).join(', ')})`

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** The colour for a tone: a plain sRGB blend between the two stops either side of it. */
export function skinToneHex(tone: number) {
  const t = Math.min(100, Math.max(0, tone))
  const upper = Math.max(1, STOPS.findIndex(([at]) => at >= t))
  const [from, fromHex] = STOPS[upper - 1]
  const [to, toHex] = STOPS[upper]
  const k = (t - from) / (to - from)
  const a = channels(fromHex)
  const b = channels(toHex)
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('')
}

export function skinToneLabel(tone: number) {
  return tone <= 33 ? 'Light' : tone <= 66 ? 'Medium' : 'Deep'
}

// The tone now lives on the body profile; this key is only read for users who chose one before that.
const KEY = 'silhoufit-skin-tone'

/** The tone this browser saved for this email before it moved to the profile, or the default when there is none, it is unreadable or invalid, or it is someone else's. */
export function loadSkinTone(email: string | undefined) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { email?: unknown; tone?: unknown } | null
    if (!email || !raw || typeof raw !== 'object' || raw.email !== email) return SKIN_TONE_DEFAULT
    return typeof raw.tone === 'number' && Number.isInteger(raw.tone) && raw.tone >= 0 && raw.tone <= 100 ? raw.tone : SKIN_TONE_DEFAULT
  } catch {
    return SKIN_TONE_DEFAULT
  }
}
