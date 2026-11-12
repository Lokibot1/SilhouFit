import { describe, expect, it } from 'vitest'
import { OneEuro, OneEuroPoint } from '../../src/utils/oneEuro'

const STEP = 1000 / 30

describe('OneEuro', () => {
  it('passes the first sample through and keeps a constant input constant', () => {
    const f = new OneEuro({ minCutoff: 1, beta: 0.007 })
    for (let i = 0; i < 60; i++) expect(f.filter(5, i * STEP)).toBeCloseTo(5, 10)
  })

  it('converges on a step', () => {
    const f = new OneEuro({ minCutoff: 1, beta: 0 })
    f.filter(0, 0)
    let y = 0
    for (let i = 1; i <= 150; i++) y = f.filter(10, i * STEP)
    expect(y).toBeCloseTo(10, 2)
  })

  it('reduces jitter around a steady value', () => {
    const f = new OneEuro({ minCutoff: 1, beta: 0 })
    let rawSpread = 0
    let filteredSpread = 0
    for (let i = 0; i < 120; i++) {
      const noisy = 10 + (i % 2 === 0 ? 1 : -1)
      const y = f.filter(noisy, i * STEP)
      if (i > 20) {
        rawSpread += Math.abs(noisy - 10)
        filteredSpread += Math.abs(y - 10)
      }
    }
    expect(filteredSpread).toBeLessThan(rawSpread * 0.3)
  })

  it('lags less on a fast move with a higher beta', () => {
    const run = (beta: number) => {
      const f = new OneEuro({ minCutoff: 1, beta })
      let err = 0
      for (let i = 0; i < 30; i++) err += Math.abs(f.filter(i * 20, i * STEP) - i * 20)
      return err
    }
    expect(run(0.5)).toBeLessThan(run(0))
  })

  it('starts again from the next sample after a reset, and ignores a sample that is not newer', () => {
    const f = new OneEuro({ minCutoff: 1, beta: 0 })
    f.filter(0, 0)
    f.filter(10, STEP)
    expect(f.filter(99, STEP)).toBe(f.filter(99, STEP))
    f.reset()
    expect(f.filter(42, 5000)).toBe(42)
  })
})

describe('OneEuroPoint', () => {
  it('filters x and y separately', () => {
    const f = new OneEuroPoint({ minCutoff: 1, beta: 0 })
    f.filter({ x: 0, y: 0 }, 0)
    const p = f.filter({ x: 10, y: 0 }, STEP)
    expect(p.x).toBeGreaterThan(0)
    expect(p.x).toBeLessThan(10)
    expect(p.y).toBe(0)
  })
})
