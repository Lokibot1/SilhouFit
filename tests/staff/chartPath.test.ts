import { describe, expect, it } from 'vitest'
import { areaPath, donutSegments, niceCeil, smoothPath, type Point } from '../../src/utils/chartPath'

/** Reads the numbers out of a `smoothPath` string: the start point, then each segment's two controls and end. */
function parse(path: string) {
  const [start, ...rest] = path.slice(1).split('C')
  const [x, y] = start.split(' ').map(Number)
  return { start: { x, y }, segments: rest.map((s) => s.split(' ').map(Number)) }
}

/** Evaluates a cubic Bezier at t. */
const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3

describe('smoothPath', () => {
  it('is empty for no points and a lone move for one', () => {
    expect(smoothPath([])).toBe('')
    expect(smoothPath([{ x: 5, y: 7 }])).toBe('M5 7')
  })

  it('passes through every point', () => {
    const points: Point[] = [{ x: 0, y: 10 }, { x: 50, y: 80 }, { x: 100, y: 30 }]
    const { start, segments } = parse(smoothPath(points))
    expect(start).toEqual(points[0])
    expect(segments.map((s) => ({ x: s[4], y: s[5] }))).toEqual(points.slice(1))
  })

  it('keeps flat data flat', () => {
    const { segments } = parse(smoothPath([{ x: 0, y: 40 }, { x: 50, y: 40 }, { x: 100, y: 40 }]))
    for (const s of segments) expect([s[1], s[3], s[5]]).toEqual([40, 40, 40])
  })

  it('never overshoots the data', () => {
    // A spike and a plateau are where an ordinary cubic spline rings.
    const ys = [0, 0, 100, 100, 20, 20, 90]
    const points = ys.map((y, i) => ({ x: i * 10, y }))
    const { start, segments } = parse(smoothPath(points))
    let from = start
    segments.forEach((s, i) => {
      const lo = Math.min(ys[i], ys[i + 1])
      const hi = Math.max(ys[i], ys[i + 1])
      for (let t = 0; t <= 1; t += 0.05) {
        const y = cubic(from.y, s[1], s[3], s[5], t)
        expect(y).toBeGreaterThanOrEqual(lo - 1e-6)
        expect(y).toBeLessThanOrEqual(hi + 1e-6)
      }
      from = { x: s[4], y: s[5] }
    })
  })
})

describe('areaPath', () => {
  it('closes the curve down to the baseline', () => {
    const area = areaPath([{ x: 0, y: 10 }, { x: 100, y: 20 }], 100)
    expect(area.startsWith('M0 10C')).toBe(true)
    expect(area.endsWith('L100 100L0 100Z')).toBe(true)
  })

  it('has no area for fewer than two points', () => {
    expect(areaPath([{ x: 0, y: 1 }], 100)).toBe('')
  })
})

describe('niceCeil', () => {
  it('rounds up to a round number', () => {
    expect(niceCeil(0)).toBe(1)
    expect(niceCeil(37_000)).toBe(50_000)
    expect(niceCeil(41_000)).toBe(50_000)
    expect(niceCeil(120_000)).toBe(200_000)
    expect(niceCeil(100_000)).toBe(100_000)
    expect(niceCeil(2.2)).toBe(2.5)
  })
})

describe('donutSegments', () => {
  it('lays segments end to end around a circumference of 100', () => {
    const segments = donutSegments([50, 30, 20], 0)
    expect(segments.map((s) => s.start)).toEqual([0, 50, 80])
    expect(segments.map((s) => s.length)).toEqual([50, 30, 20])
    expect(segments.map((s) => s.share)).toEqual([0.5, 0.3, 0.2])
  })

  it('leaves a gap between several segments but not around a single one', () => {
    expect(donutSegments([1, 1], 1).map((s) => s.length)).toEqual([49, 49])
    expect(donutSegments([5], 1)[0].length).toBe(100)
  })

  it('has no segments when there is nothing to show', () => {
    expect(donutSegments([])).toEqual([])
    expect(donutSegments([0, 0])).toEqual([])
  })
})
