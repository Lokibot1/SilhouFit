import { describe, expect, it } from 'vitest'
import { buildCustomSizing, newSizingDraft, validateSizingDraft } from '../../src/utils/customSizing'

const filled = () => {
  const draft = newSizingDraft()
  draft.rows.forEach((row, i) => (row.measurements.chestWidthCm = String(50 + i * 3)))
  return draft
}

describe('validateSizingDraft', () => {
  it('accepts a draft with a measurement per size', () => {
    expect(validateSizingDraft(filled(), 'Hoodie')).toEqual({})
  })
  it('flags empty, repeated and unmeasured sizes and out-of-range values', () => {
    const draft = filled()
    draft.rows[0].size = ''
    draft.rows[2].size = 'm'
    draft.rows[1].measurements.chestWidthCm = '999'
    const errors = validateSizingDraft(draft, 'Hoodie')
    expect(errors[`size:${draft.rows[0].id}`]).toBeTruthy()
    expect(errors[`size:${draft.rows[2].id}`]).toMatch(/twice/)
    expect(errors[`m:${draft.rows[1].id}:chestWidthCm`]).toBeTruthy()
    const bare = filled()
    bare.rows[0].measurements.chestWidthCm = ''
    expect(validateSizingDraft(bare, 'Hoodie')[`row:${bare.rows[0].id}`]).toBeTruthy()
  })
})

describe('validateSizingDraft sizes', () => {
  it('accepts only the sizes the API allows', () => {
    const draft = filled()
    draft.rows[0].size = 'XXL'
    draft.rows[1].size = 'One size'
    draft.rows[2].size = 'Free Size'
    const errors = validateSizingDraft(draft, 'Hoodie')
    expect(errors[`size:${draft.rows[0].id}`]).toBe('Use one of XS, S, M, L, XL, 2XL, 3XL or Free Size.')
    expect(errors[`size:${draft.rows[1].id}`]).toBe('Use one of XS, S, M, L, XL, 2XL, 3XL or Free Size.')
    expect(errors[`size:${draft.rows[2].id}`]).toBeUndefined()
  })
})

describe('buildCustomSizing', () => {
  it('turns a draft into sizes with numeric measurements', () => {
    const { sizes } = buildCustomSizing(filled(), 'Hoodie')
    expect(sizes.map((s) => s.size)).toEqual(['S', 'M', 'L'])
    expect(sizes[1].measurements).toEqual({ chestWidthCm: 53 })
  })
})
