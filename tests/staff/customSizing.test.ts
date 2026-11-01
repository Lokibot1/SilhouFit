import { beforeEach, describe, expect, it } from 'vitest'
import { addCustomSizing, getCustomSizings, setCustomSizingActive, updateCustomSizing } from '../../src/service/customSizings'
import { buildCustomSizing, draftFromSizing, newSizingDraft, validateSizingDraft } from '../../src/utils/customSizing'

const filled = (name: string) => {
  const draft = newSizingDraft()
  draft.name = name
  draft.rows.forEach((row, i) => (row.measurements.chestWidthCm = String(50 + i * 3)))
  return draft
}

describe('validateSizingDraft', () => {
  it('accepts a named draft with a measurement per size', () => {
    expect(validateSizingDraft(filled('Hoodie Custom'), 'Hoodie', [])).toEqual({})
  })
  it('flags a short or taken name, case-insensitively', () => {
    expect(validateSizingDraft(filled('A'), 'Hoodie', []).name).toBeTruthy()
    expect(validateSizingDraft(filled('hoodie custom'), 'Hoodie', ['Hoodie Custom']).name).toMatch(/already/)
  })
  it('flags empty, repeated and unmeasured sizes and out-of-range values', () => {
    const draft = filled('Boxy')
    draft.rows[0].size = ''
    draft.rows[2].size = 'm'
    draft.rows[1].measurements.chestWidthCm = '999'
    const errors = validateSizingDraft(draft, 'Hoodie', [])
    expect(errors[`size:${draft.rows[0].id}`]).toBeTruthy()
    expect(errors[`size:${draft.rows[2].id}`]).toMatch(/twice/)
    expect(errors[`m:${draft.rows[1].id}:chestWidthCm`]).toBeTruthy()
    const bare = filled('Boxy')
    bare.rows[0].measurements.chestWidthCm = ''
    expect(validateSizingDraft(bare, 'Hoodie', [])[`row:${bare.rows[0].id}`]).toBeTruthy()
  })
})

describe('custom sizing store', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a draft through build and edit', () => {
    const built = buildCustomSizing(filled('Boxy'), 'Hoodie')
    expect(built.sizes.map((s) => s.size)).toEqual(['S', 'M', 'L'])
    expect(draftFromSizing({ ...built, id: 'x', createdAt: '' }).rows[1].measurements.chestWidthCm).toBe('53')
  })
  it('updates, archives and refuses to restore over an active sizing of the same name', () => {
    const a = addCustomSizing(buildCustomSizing(filled('Boxy'), 'Hoodie'))
    updateCustomSizing(a.id, { name: 'Boxy 2', sizes: a.sizes })
    expect(getCustomSizings().find((s) => s.id === a.id)?.name).toBe('Boxy 2')
    expect(setCustomSizingActive(a.id, false)).toBe(true)
    const b = addCustomSizing(buildCustomSizing(filled('Boxy 2'), 'Hoodie'))
    expect(setCustomSizingActive(a.id, true)).toBe(false)
    expect(getCustomSizings().find((s) => s.id === b.id)?.isActive).toBe(true)
  })
})
