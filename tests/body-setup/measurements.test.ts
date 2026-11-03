import { describe, expect, it } from 'vitest'
import {
  AR_FIELDS,
  changedFields,
  FIELDS,
  fieldsFor,
  formatValue,
  fromCanonical,
  fromProfile,
  missingForAr,
  parseInput,
  sanitizeInput,
  toCanonical,
  toPayload,
  validateField,
  warnings,
} from '../../src/components/body-setup/measurements'

describe('fieldsFor', () => {
  it('offers bust for the female model only', () => {
    expect(fieldsFor('female')).toContain('bust')
    expect(fieldsFor('male')).not.toContain('bust')
    expect(fieldsFor(null)).not.toContain('bust')
  })

  it('lists height first, then eleven fields for male and twelve for female', () => {
    expect(fieldsFor('male')[0]).toBe('height')
    expect(fieldsFor('male')).toHaveLength(11)
    expect(fieldsFor('female')).toHaveLength(12)
  })
})

describe('unit conversion', () => {
  it('converts inches to centimetres and pounds to kilograms with known literals', () => {
    expect(toCanonical('height', 70, 'imperial')).toBeCloseTo(177.8, 9)
    expect(toCanonical('weight', 150, 'imperial')).toBeCloseTo(68.0388555, 6)
    expect(toCanonical('chest', 95, 'metric')).toBe(95)
  })

  it('shows canonical values in inches and pounds', () => {
    expect(fromCanonical('height', 177.8, 'imperial')).toBeCloseTo(70, 9)
    expect(fromCanonical('weight', 100, 'imperial')).toBeCloseTo(220.462262, 5)
  })

  it('formats with at most one decimal and no trailing zero', () => {
    expect(formatValue('height', 180, 'metric')).toBe('180')
    expect(formatValue('height', 180, 'imperial')).toBe('70.9')
    expect(formatValue('weight', 100, 'imperial')).toBe('220.5')
    expect(formatValue('waist', 80.26, 'metric')).toBe('80.3')
    expect(formatValue('waist', 76.2, 'imperial')).toBe('30')
  })

  it('shows the same text on every repeated unit toggle (display derives from the stored canonical value)', () => {
    const original = 172.4
    const shown = Array.from({ length: 50 }, (_, i) => formatValue('height', original, i % 2 ? 'metric' : 'imperial'))
    expect(shown[0]).toBe('67.9')
    expect(shown[1]).toBe('172.4')
    expect(shown[48]).toBe('67.9')
    expect(shown[49]).toBe('172.4')
  })

  it('round-trips cm and kg through inches and pounds without loss', () => {
    for (const cm of [100, 152.4, 172.4, 230]) {
      expect(toCanonical('height', fromCanonical('height', cm, 'imperial'), 'imperial')).toBeCloseTo(cm, 9)
    }
    for (const kg of [30, 61.3, 250]) {
      expect(toCanonical('weight', fromCanonical('weight', kg, 'imperial'), 'imperial')).toBeCloseTo(kg, 9)
    }
  })
})

describe('sanitizeInput', () => {
  it.each([
    ['72.5', '72.5'],
    ['abc72', '72'],
    ['7a2', '72'],
    ['-5', '5'],
    ['1.2.3', '1.23'],
    ['1e5', '15'],
    ['7\u{1F600}2', '72'],
    ['Infinity', ''],
    ['', ''],
  ])('keeps only digits and the first decimal point: %j -> %j', (input, expected) => {
    expect(sanitizeInput(input)).toBe(expected)
  })
})

describe('parseInput', () => {
  it('accepts plain and decimal numbers', () => {
    expect(parseInput('72')).toEqual({ ok: true, value: 72 })
    expect(parseInput(' 72.5 ')).toEqual({ ok: true, value: 72.5 })
    expect(parseInput('.5')).toEqual({ ok: true, value: 0.5 })
  })

  it.each(['', '   ', '-5', 'abc', '1.2.3', '1e5', 'Infinity', 'NaN', '\u{1F600}', '0', '0.0', '1,5'])('rejects %j', (text) => {
    const result = parseInput(text)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })
})

describe('validateField', () => {
  it('returns the canonical value for an in-range metric entry', () => {
    expect(validateField('height', '180', 'metric')).toEqual({ ok: true, value: 180 })
  })

  it('converts an inch entry to centimetres', () => {
    const result = validateField('height', '70', 'imperial')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBeCloseTo(177.8, 9)
  })

  it('checks ranges in centimetres even when typed in inches', () => {
    // Height range is 100-230 cm = 39.4-90.6 in.
    expect(validateField('height', '39', 'imperial').ok).toBe(false) // 99.06 cm
    expect(validateField('height', '40', 'imperial').ok).toBe(true) // 101.6 cm
    expect(validateField('height', '90', 'imperial').ok).toBe(true) // 228.6 cm
    expect(validateField('height', '91', 'imperial').ok).toBe(false) // 231.14 cm
    // The same typed number is valid in one unit and not the other.
    expect(validateField('height', '90', 'metric').ok).toBe(false)
  })

  it('accepts the exact range bounds and rejects just outside', () => {
    expect(validateField('height', '100', 'metric').ok).toBe(true)
    expect(validateField('height', '230', 'metric').ok).toBe(true)
    expect(validateField('height', '99.9', 'metric').ok).toBe(false)
    expect(validateField('height', '230.1', 'metric').ok).toBe(false)
    expect(validateField('weight', '30', 'metric').ok).toBe(true)
    expect(validateField('weight', '251', 'metric').ok).toBe(false)
  })

  it('applies a per-field range', () => {
    expect(validateField('shoulders', '70', 'metric').ok).toBe(true)
    expect(validateField('shoulders', '71', 'metric').ok).toBe(false)
    expect(validateField('waist', '200', 'metric').ok).toBe(true)
    expect(validateField('thigh', '101', 'metric').ok).toBe(false)
  })

  it('writes an error naming the field, the range, the unit and what was entered', () => {
    expect(validateField('height', '50', 'metric')).toEqual({
      ok: false,
      error: 'Height must be between 100 and 230 cm, but 50 was entered. Check your tape reading, then enter it again.',
    })
  })

  it('states the range in inches when the unit is imperial', () => {
    const result = validateField('height', '10', 'imperial')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('between 39.4 and 90.6 in')
  })

  it.each(['', '-3', 'abc', '\u{1F600}', '1.2.3', '1e2', 'Infinity'])('rejects %j', (text) => {
    expect(validateField('height', text, 'metric').ok).toBe(false)
  })
})

describe('warnings', () => {
  it('is empty for a plausible body', () => {
    expect(warnings({ height: 175, inseam: 80, outseam: 105, shoulders: 45, chest: 98, thigh: 55, hips: 100, torso: 50 })).toEqual([])
  })

  it('warns when the inseam is over 60% of height', () => {
    expect(warnings({ height: 150, inseam: 91 })).toHaveLength(1)
    expect(warnings({ height: 150, inseam: 90 })).toEqual([])
  })

  it('warns when the outseam is not longer than the inseam', () => {
    expect(warnings({ inseam: 80, outseam: 80 })).toHaveLength(1)
    expect(warnings({ inseam: 80, outseam: 81 })).toEqual([])
  })

  it('warns when shoulders are unusual next to the chest', () => {
    expect(warnings({ shoulders: 61, chest: 100 })).toHaveLength(1)
    expect(warnings({ shoulders: 24, chest: 100 })).toHaveLength(1)
    expect(warnings({ shoulders: 45, chest: 100 })).toEqual([])
  })

  it('warns when the thigh is large next to the hips or the torso is long next to the height', () => {
    expect(warnings({ thigh: 76, hips: 100 })).toHaveLength(1)
    expect(warnings({ height: 170, torso: 77 })).toHaveLength(1)
  })

  it('does not warn about pairs that are not both entered', () => {
    expect(warnings({ inseam: 200 })).toEqual([])
    expect(warnings({})).toEqual([])
  })
})

describe('missingForAr', () => {
  it('lists the AR fields the user has not entered', () => {
    expect(missingForAr({})).toEqual(['height', 'chest', 'waist', 'hips', 'shoulders'])
    expect(missingForAr({ height: 170, chest: 90 })).toEqual(['waist', 'hips', 'shoulders'])
  })

  it('is empty once height, chest, waist, hips and shoulders are entered', () => {
    expect(missingForAr({ height: 170, chest: 90, waist: 70, hips: 95, shoulders: 40 })).toEqual([])
  })

  it('ignores optional fields', () => {
    expect(missingForAr({ weight: 60, thigh: 50 })).toHaveLength(AR_FIELDS.length)
  })
})

describe('toPayload', () => {
  it('is null without a height', () => {
    expect(toPayload({ chest: 90 }, 'male', 'regular')).toBeNull()
    expect(toPayload({}, null, null)).toBeNull()
  })

  it('sends null for every unentered field and never a default', () => {
    expect(toPayload({ height: 175 }, 'male', null)).toEqual({
      heightCm: 175,
      weightKg: null,
      shoulderWidthCm: null,
      chestCm: null,
      bustCm: null,
      torsoLengthCm: null,
      waistCm: null,
      hipsCm: null,
      inseamCm: null,
      outseamCm: null,
      thighCm: null,
      armLengthCm: null,
      bodyModel: 'male',
      bodyBuild: null,
    })
  })

  it('maps every field to its API name, with sleeve going to armLengthCm', () => {
    const payload = toPayload(
      { height: 170, weight: 60, shoulders: 40, sleeve: 58, bust: 88, chest: 80, torso: 42, waist: 65, hips: 92, thigh: 54, inseam: 76, outseam: 100 },
      'female',
      'lean',
    )
    expect(payload).toEqual({
      heightCm: 170,
      weightKg: 60,
      shoulderWidthCm: 40,
      chestCm: 80,
      bustCm: 88,
      torsoLengthCm: 42,
      waistCm: 65,
      hipsCm: 92,
      inseamCm: 76,
      outseamCm: 100,
      thighCm: 54,
      armLengthCm: 58,
      bodyModel: 'female',
      bodyBuild: 'lean',
    })
    expect(payload).not.toHaveProperty('sleeveLengthCm')
  })

  it('sends a null bust for the male model even if one was entered earlier', () => {
    expect(toPayload({ height: 175, bust: 95 }, 'male', null)?.bustCm).toBeNull()
    expect(toPayload({ height: 175, bust: 95 }, null, null)?.bustCm).toBeNull()
  })

  it('rounds to one decimal', () => {
    const payload = toPayload({ height: 177.8, waist: 76.24, hips: 76.26, chest: 76.31 }, 'male', null)
    expect(payload?.heightCm).toBe(177.8)
    expect(payload?.waistCm).toBe(76.2)
    expect(payload?.hipsCm).toBe(76.3)
    expect(payload?.chestCm).toBe(76.3)
  })

  it('keeps an inch entry exact to 0.1 cm', () => {
    const cm = validateField('waist', '30', 'imperial')
    expect(cm.ok).toBe(true)
    if (cm.ok) expect(toPayload({ height: 170, waist: cm.value }, 'male', null)?.waistCm).toBe(76.2)
  })

  it('never fills a field from the chosen build', () => {
    const builds = ['skinny', 'lean', 'skinny_fat', 'regular', 'muscular', 'overweight'] as const
    for (const build of builds) {
      const payload = toPayload({ height: 175 }, 'male', build)!
      expect(payload.bodyBuild).toBe(build)
      const { bodyModel: _m, bodyBuild: _b, heightCm: _h, ...rest } = payload
      expect(Object.values(rest).every((value) => value === null)).toBe(true)
    }
  })
})

describe('fromProfile', () => {
  const full = {
    heightCm: 170,
    weightKg: 60,
    shoulderWidthCm: 40,
    chestCm: 80,
    bustCm: 88,
    torsoLengthCm: 42,
    waistCm: 65,
    hipsCm: 92,
    inseamCm: 76,
    outseamCm: 100,
    thighCm: 54,
    armLengthCm: 58,
    bodyModel: 'female' as const,
    bodyBuild: 'muscular' as const,
  }

  it('restores entered values, model and build, mapping armLengthCm back to sleeve', () => {
    expect(fromProfile(full)).toEqual({
      model: 'female',
      build: 'muscular',
      entered: { height: 170, weight: 60, shoulders: 40, chest: 80, bust: 88, torso: 42, waist: 65, hips: 92, inseam: 76, outseam: 100, thigh: 54, sleeve: 58 },
    })
  })

  it('leaves null fields out of entered', () => {
    const empty = {
      heightCm: 170, weightKg: null, shoulderWidthCm: null, chestCm: null, bustCm: null, torsoLengthCm: null,
      waistCm: null, hipsCm: null, inseamCm: null, outseamCm: null, thighCm: null, armLengthCm: null,
      bodyModel: null, bodyBuild: null,
    }
    expect(fromProfile(empty)).toEqual({ model: null, build: null, entered: { height: 170 } })
  })

  it('round-trips through toPayload', () => {
    const payload = toPayload({ height: 171.3, chest: 90.5, sleeve: 60 }, 'male', 'regular')!
    const { model, build, entered } = fromProfile(payload)
    expect(toPayload(entered, model, build)).toEqual(payload)
    expect(Object.keys(entered).every((key) => (FIELDS as readonly string[]).includes(key))).toBe(true)
  })
})

describe('changedFields', () => {
  const saved = toPayload({ height: 175, chest: 90 }, 'male', 'lean')!

  it('is empty when nothing changed', () => {
    expect(changedFields({ ...saved }, saved)).toEqual({})
  })

  it('keeps only what changed, and a cleared field as null', () => {
    const next = toPayload({ height: 176 }, 'male', 'lean')!
    expect(changedFields(next, saved)).toEqual({ heightCm: 176, chestCm: null })
  })
})
