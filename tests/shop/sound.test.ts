import { afterEach, describe, expect, it, vi } from 'vitest'
import { playAddToCart } from '../../src/utils/sound'

describe('playAddToCart', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does nothing and does not throw when AudioContext is missing', () => {
    expect(window.AudioContext).toBeUndefined()
    expect(() => playAddToCart()).not.toThrow()
  })

  it('swallows errors from a broken AudioContext', () => {
    vi.stubGlobal('AudioContext', function () {
      throw new Error('blocked')
    })
    expect(() => playAddToCart()).not.toThrow()
  })
})
