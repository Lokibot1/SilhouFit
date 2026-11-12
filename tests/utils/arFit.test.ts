import { describe, expect, it } from 'vitest'
import { compareFit, recommendSize } from '../../src/utils/arFit'

// A body of 100 cm chest, 46 cm shoulders, 62 cm sleeve. Garment widths are flat, so a girth is twice the width.
const BODY = { height: 175, chest: 100, waist: 86, shoulders: 46, sleeve: 62 }

describe('compareFit', () => {
  it('doubles a garment width to compare it with a body girth', () => {
    const { regions } = compareFit(BODY, { chestWidthCm: 55 })
    expect(regions.chest).toEqual({ easeCm: 10, level: 'regular' })
  })

  it('compares shoulders and sleeve as they are, not doubled', () => {
    const { regions } = compareFit(BODY, { shoulderWidthCm: 47, sleeveLengthCm: 63 })
    expect(regions.shoulders).toEqual({ easeCm: 1, level: 'fitted' })
    expect(regions.sleeve).toEqual({ easeCm: 1, level: 'fitted' })
  })

  it('does not compare a short sleeve with the whole arm', () => {
    const fit = compareFit(BODY, { chestWidthCm: 55, sleeveLengthCm: 21 })
    expect(fit.regions.sleeve).toBeUndefined()
    expect(fit.overall).toBe('regular')
  })

  it('labels the ease from too tight to oversized', () => {
    const levelAt = (width: number) => compareFit(BODY, { chestWidthCm: width }).regions.chest?.level
    expect(levelAt(49)).toBe('too-tight') // ease -2
    expect(levelAt(51)).toBe('fitted') // ease 2
    expect(levelAt(55)).toBe('regular') // ease 10
    expect(levelAt(59)).toBe('loose') // ease 18
    expect(levelAt(62)).toBe('oversized') // ease 24
  })

  it('leaves out a region the body or the garment has no number for', () => {
    expect(compareFit({ height: 175 }, { chestWidthCm: 55 }).regions).toEqual({})
    expect(compareFit(BODY, { chestWidthCm: null, waistWidthCm: 48 }).regions.chest).toBeUndefined()
    expect(compareFit(BODY, { chestWidthCm: null, waistWidthCm: 48 }).regions.waist).toBeDefined()
  })

  it('takes the chest as the overall fit', () => {
    expect(compareFit(BODY, { chestWidthCm: 55, shoulderWidthCm: 52 }).overall).toBe('regular')
  })

  it('is too tight overall when any region is too tight', () => {
    expect(compareFit(BODY, { chestWidthCm: 55, shoulderWidthCm: 42 }).overall).toBe('too-tight')
  })

  it('has no overall fit when nothing can be compared', () => {
    expect(compareFit({ height: 175 }, { chestWidthCm: 55 }).overall).toBeNull()
  })
})

describe('recommendSize', () => {
  const sizes = [
    { size: 'M', values: { chestWidthCm: 52, shoulderWidthCm: 46 } },
    { size: 'L', values: { chestWidthCm: 55, shoulderWidthCm: 48 } },
    { size: 'XL', values: { chestWidthCm: 62, shoulderWidthCm: 52 } },
  ]

  it('picks the size whose chest ease is closest to a regular fit', () => {
    expect(recommendSize(BODY, sizes)).toBe('L')
  })

  it('never recommends a size that is too tight', () => {
    expect(recommendSize({ ...BODY, chest: 112 }, sizes)).toBe('XL')
  })

  it('is null when every size is too tight', () => {
    expect(recommendSize({ ...BODY, chest: 140 }, sizes)).toBeNull()
  })

  it('is null without a chest measurement', () => {
    expect(recommendSize({ height: 175 }, sizes)).toBeNull()
  })

  it('ignores a size with no chest width', () => {
    expect(recommendSize(BODY, [{ size: 'S', values: { chestWidthCm: null } }, ...sizes])).toBe('L')
  })
})
