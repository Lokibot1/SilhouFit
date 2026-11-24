import { afterEach, describe, expect, it, vi } from 'vitest'
import { playAddToCart, playNotification } from '../../src/utils/sound'

describe('playNotification', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does nothing and does not throw without AudioContext, or with a broken one', () => {
    expect(() => playNotification()).not.toThrow()
    vi.stubGlobal('AudioContext', function () {
      throw new Error('blocked')
    })
    expect(() => playNotification()).not.toThrow()
  })

  it('stays silent while the browser still blocks audio', () => {
    const createOscillator = vi.fn()
    vi.stubGlobal('AudioContext', function () {
      return { state: 'suspended', resume: () => Promise.resolve(), createOscillator }
    })
    expect(() => playNotification()).not.toThrow()
    expect(createOscillator).not.toHaveBeenCalled()
  })
})

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
