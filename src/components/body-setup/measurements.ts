import type { BodyBuildId, BodyModelId, BodyProfile } from '../../service/bodyProfile'

// The measurement set for the avatar setup. Pure TypeScript with no rendering, so the rules can be tested alone.
// Canonical values are cm (lengths) and kg (weight) at full precision; units only change how they are shown.

export const FIELDS = [
  'height',
  'weight',
  'shoulders',
  'sleeve',
  'bust',
  'chest',
  'torso',
  'waist',
  'hips',
  'thigh',
  'inseam',
  'outseam',
] as const
export type Field = (typeof FIELDS)[number]
export type Unit = 'metric' | 'imperial'
/** What the user typed in, in canonical units. Only fields they filled in are present. */
export type Entered = Partial<Record<Field, number>>

export interface FieldSpec {
  label: string
  /** Weight is a supporting value; girths go around the body; lengths run along it. */
  kind: 'mass' | 'height' | 'girth' | 'length'
  /** Needed for AR try-on. The backend itself only requires height. */
  required: boolean
  /** Canonical range (cm, or kg for weight). */
  min: number
  max: number
  what: string
}

export const SPECS: Record<Field, FieldSpec> = {
  height: { label: 'Height', kind: 'height', required: true, min: 100, max: 230, what: 'Your full standing height, barefoot.' },
  weight: { label: 'Weight', kind: 'mass', required: false, min: 30, max: 250, what: 'A supporting value only. It never replaces your tape measurements.' },
  shoulders: { label: 'Shoulder width', kind: 'length', required: true, min: 25, max: 70, what: 'Across your back, from the edge of one shoulder to the other.' },
  sleeve: { label: 'Sleeve length', kind: 'length', required: false, min: 35, max: 100, what: 'From the edge of your shoulder to your wrist bone.' },
  bust: { label: 'Bust', kind: 'girth', required: false, min: 60, max: 180, what: 'Around the fullest part of your bust.' },
  chest: { label: 'Chest', kind: 'girth', required: true, min: 60, max: 180, what: 'Around your chest, level across your back.' },
  torso: { label: 'Torso length', kind: 'length', required: false, min: 30, max: 80, what: 'From where your neck meets your shoulder down to your natural waist.' },
  waist: { label: 'Waist', kind: 'girth', required: true, min: 40, max: 200, what: 'Around the narrowest part of your torso.' },
  hips: { label: 'Hips', kind: 'girth', required: true, min: 60, max: 200, what: 'Around the fullest part of your hips.' },
  thigh: { label: 'Thigh', kind: 'girth', required: false, min: 30, max: 100, what: 'Around the fullest part of one upper thigh.' },
  inseam: { label: 'Inseam', kind: 'length', required: false, min: 40, max: 110, what: 'From your crotch to your ankle bone, along the inside of your leg.' },
  outseam: { label: 'Outseam', kind: 'length', required: false, min: 60, max: 140, what: 'From your natural waist to your ankle bone, along the outside of your leg.' },
}

export const MODEL_LABEL: Record<BodyModelId, string> = { male: 'Male', female: 'Female' }
export const BUILD_LABEL: Record<BodyBuildId, string> = {
  skinny: 'Skinny',
  lean: 'Lean',
  skinny_fat: 'Skinny Fat',
  regular: 'Regular',
  muscular: 'Muscular',
  overweight: 'Fat / Overweight',
}

/** How to take each measurement. Chest depends on the model because the bust is a separate measurement. */
export function howTo(field: Field, model: BodyModelId | null): string {
  switch (field) {
    case 'height':
      return 'Stand straight against a wall, barefoot, feet together. Rest a flat book on your head, mark the wall under it, then measure from the floor to the mark.'
    case 'weight':
      return 'Weigh yourself in light clothing. It only supports size advice, so skip it if you would rather not share it.'
    case 'shoulders':
      return 'Stand relaxed. Measure straight across your back from the bony point at the edge of one shoulder to the same point on the other. A helper makes this much easier.'
    case 'sleeve':
      return 'Let your arm hang relaxed with a slight bend. Measure from the bony point at the edge of your shoulder, down the outside of your arm, to your wrist bone.'
    case 'bust':
      return 'Wrap the tape around the fullest part of your bust and keep it level across your back. Breathe normally and keep the tape snug, not tight.'
    case 'chest':
      return model === 'female'
        ? 'Wrap the tape around your ribcage, level across your back, directly above your bust (the band across or under it). Your bust is the next measurement, taken at its fullest part.'
        : 'Wrap the tape around the fullest part of your chest, under your armpits and level across your back. Breathe normally and keep it snug, not tight.'
    case 'torso':
      return 'Measure from the point where your neck meets your shoulder, straight down the front of your body, to your natural waist. A helper holds the top end in place.'
    case 'waist':
      return 'Wrap the tape around your natural waist, the narrowest part of your torso, usually just above your belly button. Breathe out normally and do not pull in.'
    case 'hips':
      return 'Stand with your feet together. Wrap the tape around the fullest part of your hips and buttocks, keeping it level all the way round.'
    case 'thigh':
      return 'Stand with your weight even on both feet. Wrap the tape around the fullest part of one upper thigh, just below the crease where your leg meets your body.'
    case 'inseam':
      return 'Stand straight with your feet slightly apart. Measure from your crotch down the inside of your leg to your ankle bone.'
    case 'outseam':
      return 'Stand straight. Measure from your natural waist down the outside of your leg to your ankle bone.'
  }
}

/** The fields shown for a model. Bust is for the female model only. */
export function fieldsFor(model: BodyModelId | null): Field[] {
  return FIELDS.filter((field) => field !== 'bust' || model === 'female')
}

/** Needed for AR try-on; Finish only needs height. */
export const AR_FIELDS: Field[] = ['height', 'chest', 'waist', 'hips', 'shoulders']

export function missingForAr(entered: Entered): Field[] {
  return AR_FIELDS.filter((field) => entered[field] === undefined)
}

const CM_PER_IN = 2.54
const KG_PER_LB = 0.45359237

export function unitLabel(field: Field, unit: Unit) {
  if (field === 'weight') return unit === 'metric' ? 'kg' : 'lb'
  return unit === 'metric' ? 'cm' : 'in'
}

export function toCanonical(field: Field, shown: number, unit: Unit) {
  if (unit === 'metric') return shown
  return field === 'weight' ? shown * KG_PER_LB : shown * CM_PER_IN
}

export function fromCanonical(field: Field, canonical: number, unit: Unit) {
  if (unit === 'metric') return canonical
  return field === 'weight' ? canonical / KG_PER_LB : canonical / CM_PER_IN
}

/** A canonical value as it reads in a unit: one decimal at most, no trailing zero. */
export function formatValue(field: Field, canonical: number, unit: Unit) {
  return String(Number(fromCanonical(field, canonical, unit).toFixed(1)))
}

/** Keeps digits and the first decimal point. Letters, emoji and exponents never reach the field. */
export function sanitizeInput(text: string) {
  const [whole, ...rest] = text.replace(/[^\d.]/g, '').split('.')
  return rest.length ? `${whole}.${rest.join('')}` : whole
}

export type Parsed = { ok: true; value: number } | { ok: false; error: string }

/** Text to a number: digits and one decimal point only; rejects empty, negative, NaN and Infinity. */
export function parseInput(text: string): Parsed {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: 'Enter a number.' }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    return { ok: false, error: 'Use digits and one decimal point only, for example 72.5.' }
  }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'Enter a number greater than 0.' }
  return { ok: true, value }
}

/** Validates what was typed in the shown unit and returns the canonical value. */
export function validateField(field: Field, text: string, unit: Unit): Parsed {
  const parsed = parseInput(text)
  if (!parsed.ok) return parsed
  const canonical = toCanonical(field, parsed.value, unit)
  const { min, max, label } = SPECS[field]
  if (canonical < min || canonical > max) {
    const low = formatValue(field, min, unit)
    const high = formatValue(field, max, unit)
    return {
      ok: false,
      error: `${label} must be between ${low} and ${high} ${unitLabel(field, unit)}, but ${text.trim()} was entered. Check your tape reading, then enter it again.`,
    }
  }
  return { ok: true, value: canonical }
}

/** Soft cross-field checks. They never block; they ask the user to look again. */
export function warnings(entered: Entered): string[] {
  const { height, inseam, outseam, shoulders, chest, thigh, hips, torso } = entered
  const out: string[] = []
  if (height && inseam && inseam > height * 0.6) out.push('Your inseam is more than 60% of your height. Check it was taken to the ankle bone.')
  if (inseam && outseam && outseam <= inseam) out.push('Your outseam is not longer than your inseam. The outseam starts at your waist, so it is normally longer.')
  if (shoulders && chest && (shoulders > chest * 0.6 || shoulders < chest * 0.25)) {
    out.push('Your shoulder width looks unusual next to your chest. Check you measured across the back, not around.')
  }
  if (thigh && hips && thigh > hips * 0.75) out.push('Your thigh is large next to your hips. Check it is one thigh, not both.')
  if (height && torso && torso > height * 0.45) out.push('Your torso length is more than 45% of your height. Check it ends at your natural waist.')
  return out
}

const ROUND = (n: number) => Math.round(n * 10) / 10

/** The API body. Only what the user entered is sent, rounded to 0.1; everything else is null. Null without a height. */
export function toPayload(entered: Entered, model: BodyModelId | null, build: BodyBuildId | null): BodyProfile | null {
  if (entered.height === undefined) return null
  const pick = (field: Field) => (entered[field] === undefined ? null : ROUND(entered[field]))
  return {
    heightCm: ROUND(entered.height),
    weightKg: pick('weight'),
    shoulderWidthCm: pick('shoulders'),
    chestCm: pick('chest'),
    bustCm: model === 'female' ? pick('bust') : null,
    torsoLengthCm: pick('torso'),
    waistCm: pick('waist'),
    hipsCm: pick('hips'),
    inseamCm: pick('inseam'),
    outseamCm: pick('outseam'),
    thighCm: pick('thigh'),
    armLengthCm: pick('sleeve'),
    bodyModel: model,
    bodyBuild: build,
  }
}

/** A saved profile back to the setup's shape, for editing. */
export function fromProfile(profile: BodyProfile): { model: BodyModelId | null; build: BodyBuildId | null; entered: Entered } {
  const values: Record<Field, number | null> = {
    height: profile.heightCm,
    weight: profile.weightKg,
    shoulders: profile.shoulderWidthCm,
    sleeve: profile.armLengthCm,
    bust: profile.bustCm,
    chest: profile.chestCm,
    torso: profile.torsoLengthCm,
    waist: profile.waistCm,
    hips: profile.hipsCm,
    thigh: profile.thighCm,
    inseam: profile.inseamCm,
    outseam: profile.outseamCm,
  }
  const entered: Entered = {}
  for (const field of FIELDS) {
    const value = values[field]
    if (value !== null) entered[field] = value
  }
  return { model: profile.bodyModel, build: profile.bodyBuild, entered }
}
