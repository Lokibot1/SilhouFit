import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearBodyDraft, draftReducer, lastStep, loadDraft, newDraft, saveDraft } from '../../src/components/body-setup/draft'

const EMAIL = 'demo@silhoufit.com'
const KEY = 'silhoufit-body-setup'

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})
afterEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('lastStep', () => {
  it('is the model and build steps plus one per measurement field', () => {
    expect(lastStep('male')).toBe(12)
    expect(lastStep('female')).toBe(13)
    expect(lastStep(null)).toBe(12)
  })
})

describe('draftReducer', () => {
  it('starts at the model step in metric with nothing entered', () => {
    expect(newDraft(EMAIL)).toEqual({ email: EMAIL, model: null, build: null, step: 0, unit: 'metric', entered: {}, reviewing: false, skinTone: 44 })
  })

  it('records the skin tone without touching anything else', () => {
    const draft = draftReducer(newDraft(EMAIL, { entered: { height: 170 } }), { type: 'skinTone', value: 80 })
    expect(draft.skinTone).toBe(80)
    expect(draft.entered).toEqual({ height: 170 })
  })

  it('keeps entered values when moving next and back', () => {
    let draft = draftReducer(newDraft(EMAIL), { type: 'model', model: 'male' })
    draft = draftReducer(draft, { type: 'step', step: 2 })
    draft = draftReducer(draft, { type: 'set', field: 'height', value: 175 })
    draft = draftReducer(draft, { type: 'step', step: 3 })
    draft = draftReducer(draft, { type: 'set', field: 'weight', value: 70 })
    draft = draftReducer(draft, { type: 'step', step: 2 })
    draft = draftReducer(draft, { type: 'step', step: 1 })
    expect(draft.entered).toEqual({ height: 175, weight: 70 })
    expect(draft.step).toBe(1)
  })

  it('clamps the step between 0 and the last step', () => {
    const male = draftReducer(newDraft(EMAIL), { type: 'model', model: 'male' })
    expect(draftReducer(male, { type: 'step', step: -4 }).step).toBe(0)
    expect(draftReducer(male, { type: 'step', step: 99 }).step).toBe(12)
  })

  it('never changes canonical values when the unit is toggled', () => {
    let draft = draftReducer(newDraft(EMAIL, { entered: { height: 172.4, weight: 61.3 } }), { type: 'unit', unit: 'imperial' })
    expect(draft.unit).toBe('imperial')
    for (let i = 0; i < 20; i++) draft = draftReducer(draft, { type: 'unit', unit: i % 2 ? 'imperial' : 'metric' })
    expect(draft.entered).toEqual({ height: 172.4, weight: 61.3 })
  })

  it('clears a field when set to undefined', () => {
    const draft = draftReducer(newDraft(EMAIL, { entered: { height: 170, waist: 70 } }), { type: 'set', field: 'waist', value: undefined })
    expect(draft.entered).toEqual({ height: 170 })
    expect('waist' in draft.entered).toBe(false)
  })

  it('does not mutate the previous draft', () => {
    const before = newDraft(EMAIL, { entered: { height: 170 } })
    draftReducer(before, { type: 'set', field: 'waist', value: 70 })
    expect(before.entered).toEqual({ height: 170 })
  })

  it('edits a value from review and returns to review', () => {
    let draft = newDraft(EMAIL, { model: 'male', entered: { height: 170, waist: 70 }, reviewing: true, step: 12 })
    draft = draftReducer(draft, { type: 'step', step: 8 }) // jump to the waist step from review
    expect(draft.reviewing).toBe(false)
    draft = draftReducer(draft, { type: 'set', field: 'waist', value: 72 })
    draft = draftReducer(draft, { type: 'review', reviewing: true })
    expect(draft.reviewing).toBe(true)
    expect(draft.entered).toEqual({ height: 170, waist: 72 })
  })

  it('pulls the step back inside range when the model changes to one with fewer steps', () => {
    const female = newDraft(EMAIL, { model: 'female', step: 13 })
    expect(draftReducer(female, { type: 'model', model: 'male' }).step).toBe(12)
  })

  it('records the build without touching measurements', () => {
    const draft = draftReducer(newDraft(EMAIL, { entered: { height: 170 } }), { type: 'build', build: 'muscular' })
    expect(draft.build).toBe('muscular')
    expect(draft.entered).toEqual({ height: 170 })
  })
})

describe('saveDraft and loadDraft', () => {
  it('restores what was saved for the same email', () => {
    const draft = newDraft(EMAIL, { model: 'female', build: 'lean', step: 5, unit: 'imperial', entered: { height: 170, bust: 88 }, reviewing: false })
    saveDraft(draft)
    expect(loadDraft(EMAIL)).toEqual(draft)
  })

  it('returns null when nothing is stored', () => {
    expect(loadDraft(EMAIL)).toBeNull()
  })

  it('ignores corrupt JSON', () => {
    sessionStorage.setItem(KEY, '{not json')
    expect(loadDraft(EMAIL)).toBeNull()
  })

  it.each(['null', '42', '"text"', '[]'])('ignores a stored %s', (raw) => {
    sessionStorage.setItem(KEY, raw)
    expect(loadDraft(EMAIL)).toBeNull()
  })

  it('ignores a draft saved for another email', () => {
    saveDraft(newDraft('someone@else.com', { model: 'male', entered: { height: 170 } }))
    expect(loadDraft(EMAIL)).toBeNull()
  })

  it('clamps the step into range for the model', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ email: EMAIL, model: 'male', step: 500 }))
    expect(loadDraft(EMAIL)?.step).toBe(12)
    sessionStorage.setItem(KEY, JSON.stringify({ email: EMAIL, model: 'male', step: -3 }))
    expect(loadDraft(EMAIL)?.step).toBe(0)
  })

  it('resets the step to 0 for a non-integer step or when no model is chosen', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ email: EMAIL, model: 'male', step: 2.5 }))
    expect(loadDraft(EMAIL)?.step).toBe(0)
    sessionStorage.setItem(KEY, JSON.stringify({ email: EMAIL, model: null, step: 5 }))
    expect(loadDraft(EMAIL)?.step).toBe(0)
  })

  it('falls back to metric and drops unknown model and build values', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ email: EMAIL, model: 'robot', build: 'giant', unit: 'cubits' }))
    expect(loadDraft(EMAIL)).toMatchObject({ model: null, build: null, unit: 'metric' })
  })

  it('keeps only positive finite numbers for known fields', () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        email: EMAIL,
        model: 'male',
        entered: { height: 170, weight: -5, waist: 'seventy', hips: 0, chest: null, bogus: 12, thigh: 55.5 },
      }),
    )
    expect(loadDraft(EMAIL)?.entered).toEqual({ height: 170, thigh: 55.5 })
  })

  it('drops non-object entered values', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ email: EMAIL, entered: 'x' }))
    expect(loadDraft(EMAIL)?.entered).toEqual({})
  })

  it('only restores the review screen when a model and a height exist', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ email: EMAIL, model: 'male', entered: { height: 170 }, reviewing: true }))
    expect(loadDraft(EMAIL)?.reviewing).toBe(true)
    sessionStorage.setItem(KEY, JSON.stringify({ email: EMAIL, model: 'male', entered: {}, reviewing: true }))
    expect(loadDraft(EMAIL)?.reviewing).toBe(false)
    sessionStorage.setItem(KEY, JSON.stringify({ email: EMAIL, model: null, entered: { height: 170 }, reviewing: true }))
    expect(loadDraft(EMAIL)?.reviewing).toBe(false)
  })

  it('keeps a skin tone that is an integer from 0 to 100 and otherwise uses the default', () => {
    for (const [stored, expected] of [[0, 0], [100, 100], [73, 73], [101, 44], [-1, 44], [4.5, 44], ['9', 44], [null, 44]] as const) {
      sessionStorage.setItem(KEY, JSON.stringify({ email: EMAIL, skinTone: stored }))
      expect(loadDraft(EMAIL)?.skinTone).toBe(expected)
    }
    sessionStorage.setItem(KEY, JSON.stringify({ email: EMAIL }))
    expect(loadDraft(EMAIL)?.skinTone).toBe(44)
  })

  it('writes to sessionStorage only, never localStorage', () => {
    saveDraft(newDraft(EMAIL, { model: 'male', entered: { height: 170, chest: 95 } }))
    expect(sessionStorage.getItem(KEY)).not.toBeNull()
    expect(localStorage.length).toBe(0)
    clearBodyDraft()
    expect(localStorage.length).toBe(0)
  })
})

describe('clearBodyDraft', () => {
  it('removes the draft', () => {
    saveDraft(newDraft(EMAIL, { model: 'male', entered: { height: 170 } }))
    clearBodyDraft()
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(loadDraft(EMAIL)).toBeNull()
  })

  it('is safe when nothing is stored', () => {
    expect(() => clearBodyDraft()).not.toThrow()
  })
})
