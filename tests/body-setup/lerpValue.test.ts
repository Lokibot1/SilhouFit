import { describe, expect, it } from 'vitest'
import { lerpValue } from '../../src/components/body-setup/deformBody'

describe('lerpValue', () => {
  it('blends numbers, arrays and nested objects', () => {
    const a = { topY: 0, regions: { waist: { y0: 0, ring: { rx: 2 }, line: { from: [0, 0, 0] } } } }
    const b = { topY: 10, regions: { waist: { y0: 4, ring: { rx: 4 }, line: { from: [2, 4, 6] } } } }
    expect(lerpValue(a, b, 0.5)).toEqual({
      topY: 5,
      regions: { waist: { y0: 2, ring: { rx: 3 }, line: { from: [1, 2, 3] } } },
    })
  })

  it('hits both ends exactly', () => {
    expect(lerpValue({ x: 1 }, { x: 3 }, 0)).toEqual({ x: 1 })
    expect(lerpValue({ x: 1 }, { x: 3 }, 1)).toEqual({ x: 3 })
  })

  it('takes a part only the target has', () => {
    expect(lerpValue<Record<string, unknown>>({}, { ring: { rx: 4 } }, 0.5)).toEqual({ ring: { rx: 4 } })
  })
})
