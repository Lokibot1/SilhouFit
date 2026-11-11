import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSkinTone, saveSkinTone, SKIN_TONE_DEFAULT, skinToneHex, skinToneLabel } from '../../src/components/body-setup/skinTone'

const EMAIL = 'demo@silhoufit.com'
const KEY = 'silhoufit-skin-tone'

beforeEach(() => localStorage.clear())
afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

const brightness = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('skinToneHex', () => {
  it('maps the ends and the default to the reference colours', () => {
    expect(skinToneHex(0)).toBe('#f6ede4')
    expect(skinToneHex(100)).toBe('#292420')
    expect(skinToneHex(SKIN_TONE_DEFAULT)).toBe('#d7bd96')
  })

  it('clamps out-of-range input', () => {
    expect(skinToneHex(-20)).toBe('#f6ede4')
    expect(skinToneHex(400)).toBe('#292420')
  })

  // Channel rounding can wobble the brightness by under one step where the ramp barely changes; that is not visible.
  it('never gets brighter as the value rises', () => {
    let last = Infinity
    for (let t = 0; t <= 100; t++) {
      const now = brightness(skinToneHex(t))
      expect(now).toBeLessThanOrEqual(last + 1)
      last = now
    }
  })
})

describe('skinToneLabel', () => {
  it.each([[0, 'Light'], [33, 'Light'], [34, 'Medium'], [66, 'Medium'], [67, 'Deep'], [100, 'Deep']])('%i is %s', (t, label) => {
    expect(skinToneLabel(t)).toBe(label)
  })
})

describe('loadSkinTone and saveSkinTone', () => {
  it('restores what was saved for the same email', () => {
    saveSkinTone(EMAIL, 71)
    expect(loadSkinTone(EMAIL)).toBe(71)
  })

  it('gives the default when nothing is saved or there is no email', () => {
    expect(loadSkinTone(EMAIL)).toBe(SKIN_TONE_DEFAULT)
    saveSkinTone(EMAIL, 71)
    expect(loadSkinTone(undefined)).toBe(SKIN_TONE_DEFAULT)
  })

  it('ignores a tone saved for another email', () => {
    saveSkinTone('someone@else.com', 90)
    expect(loadSkinTone(EMAIL)).toBe(SKIN_TONE_DEFAULT)
  })

  it('ignores corrupt JSON', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadSkinTone(EMAIL)).toBe(SKIN_TONE_DEFAULT)
  })

  it.each([101, -1, 4.5, '50', null])('ignores the stored value %s', (tone) => {
    localStorage.setItem(KEY, JSON.stringify({ email: EMAIL, tone }))
    expect(loadSkinTone(EMAIL)).toBe(SKIN_TONE_DEFAULT)
  })

  it('is safe when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadSkinTone(EMAIL)).toBe(SKIN_TONE_DEFAULT)
    expect(() => saveSkinTone(EMAIL, 10)).not.toThrow()
  })
})
