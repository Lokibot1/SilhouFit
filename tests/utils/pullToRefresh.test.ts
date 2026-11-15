import { describe, expect, it } from 'vitest'
import { PULL_THRESHOLD, pullArmed, pullOffset, pullProgress } from '../../src/utils/pullToRefresh'

describe('pullToRefresh', () => {
  it('follows the finger at about 35% to start with', () => {
    expect(pullOffset(10) / 10).toBeGreaterThan(0.33)
    expect(pullOffset(10) / 10).toBeLessThanOrEqual(0.35)
  })

  it('gets harder the further it goes, with no clamp', () => {
    let last = pullOffset(1) - pullOffset(0)
    for (let d = 50; d <= 800; d += 50) {
      const step = pullOffset(d + 1) - pullOffset(d)
      expect(step).toBeLessThan(last)
      expect(step).toBeGreaterThan(0)
      last = step
    }
  })

  it('arms at the threshold only', () => {
    expect(pullArmed(PULL_THRESHOLD - 0.1)).toBe(false)
    expect(pullArmed(PULL_THRESHOLD)).toBe(true)
    expect(pullProgress(PULL_THRESHOLD / 2)).toBe(0.5)
    expect(pullProgress(500)).toBe(1)
    expect(pullOffset(-5)).toBe(0)
  })
})
