import { describe, expect, it } from 'vitest'
import { canTryOn, garmentScale, GARMENT_BASE } from '../../src/utils/arGarment'

describe('garmentScale', () => {
  it('is 1 on every axis for the model\'s own measurements', () => {
    expect(garmentScale({ chestWidthCm: GARMENT_BASE.chest, totalLengthCm: GARMENT_BASE.length, shoulderWidthCm: GARMENT_BASE.shoulder })).toEqual({ x: 1, y: 1, z: 1 })
  })
  it('scales width on x and z from the chest and leaves the height', () => {
    expect(garmentScale({ chestWidthCm: GARMENT_BASE.chest * 2 })).toEqual({ x: 2, y: 1, z: 2 })
  })
  it('falls back to the shoulders when there is no chest', () => {
    expect(garmentScale({ chestWidthCm: null, shoulderWidthCm: GARMENT_BASE.shoulder * 1.5 })).toEqual({ x: 1.5, y: 1, z: 1.5 })
  })
  it('is 1 when nothing is measured', () => {
    expect(garmentScale({})).toEqual({ x: 1, y: 1, z: 1 })
  })
  it('changes only the height for a length alone', () => {
    expect(garmentScale({ totalLengthCm: GARMENT_BASE.length * 1.1 })).toEqual({ x: 1, y: 1.1, z: 1 })
  })
})

describe('canTryOn', () => {
  it('accepts an AR-ready shirt only', () => {
    expect(canTryOn({ category: 'Shirt', arReady: true })).toBe(true)
    expect(canTryOn({ category: 'Hoodie', arReady: true })).toBe(false)
    expect(canTryOn({ category: 'Shirt', arReady: false })).toBe(false)
  })
})
