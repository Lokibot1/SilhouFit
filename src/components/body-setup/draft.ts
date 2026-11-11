import type { BodyBuildId, BodyModelId } from '../../service/bodyProfile'
import { FIELDS, fieldsFor, type Entered, type Field, type Unit } from './measurements'
import { SKIN_TONE_DEFAULT } from './skinTone'

// The setup in progress, kept in sessionStorage so a reload resumes it. It holds body measurements, so it lives for
// this tab only and is cleared on Finish, Skip, close and sign-out.
const KEY = 'silhoufit-body-setup'

export const MODELS: BodyModelId[] = ['male', 'female']
export const BUILDS: BodyBuildId[] = ['skinny', 'lean', 'skinny_fat', 'regular', 'muscular', 'overweight']

/** Steps are: 0 model, 1 build, then one per measurement field. The review screen is a flag, not a step. */
export interface Draft {
  email: string
  model: BodyModelId | null
  build: BodyBuildId | null
  step: number
  unit: Unit
  entered: Entered
  reviewing: boolean
  /** 0 lightest to 100 deepest. Only changes how the avatar looks. */
  skinTone: number
}

export type DraftAction =
  | { type: 'model'; model: BodyModelId }
  | { type: 'build'; build: BodyBuildId }
  | { type: 'step'; step: number }
  | { type: 'unit'; unit: Unit }
  | { type: 'set'; field: Field; value: number | undefined }
  | { type: 'review'; reviewing: boolean }
  | { type: 'skinTone'; value: number }

export function newDraft(email: string, from: Partial<Draft> = {}): Draft {
  return { email, model: null, build: null, step: 0, unit: 'metric', entered: {}, reviewing: false, skinTone: SKIN_TONE_DEFAULT, ...from }
}

/** The index of the last measurement step for a model. */
export function lastStep(model: BodyModelId | null) {
  return 1 + fieldsFor(model).length
}

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case 'model': {
      const step = Math.min(draft.step, lastStep(action.model))
      return { ...draft, model: action.model, step }
    }
    case 'build':
      return { ...draft, build: action.build }
    case 'step':
      return { ...draft, step: Math.max(0, Math.min(action.step, lastStep(draft.model))), reviewing: false }
    case 'unit':
      return { ...draft, unit: action.unit }
    case 'set': {
      const entered = { ...draft.entered }
      if (action.value === undefined) delete entered[action.field]
      else entered[action.field] = action.value
      return { ...draft, entered }
    }
    case 'review':
      return { ...draft, reviewing: action.reviewing }
    case 'skinTone':
      return { ...draft, skinTone: action.value }
  }
}

export function saveDraft(draft: Draft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    // Storage blocked: the draft then lives in memory for this page only.
  }
}

export function clearBodyDraft() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

/** The stored draft for this email, or null when there is none, it is unreadable, or it belongs to someone else. */
export function loadDraft(email: string): Draft | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Partial<Draft> | null
    if (!raw || typeof raw !== 'object' || raw.email !== email) return null
    const model = MODELS.find((m) => m === raw.model) ?? null
    const entered: Entered = {}
    if (raw.entered && typeof raw.entered === 'object') {
      for (const field of FIELDS) {
        const value = (raw.entered as Record<string, unknown>)[field]
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) entered[field] = value
      }
    }
    const step = typeof raw.step === 'number' && Number.isInteger(raw.step) ? raw.step : 0
    return {
      email,
      model,
      build: BUILDS.find((b) => b === raw.build) ?? null,
      step: model ? Math.max(0, Math.min(step, lastStep(model))) : 0,
      unit: raw.unit === 'imperial' ? 'imperial' : 'metric',
      entered,
      reviewing: raw.reviewing === true && model !== null && entered.height !== undefined,
      skinTone: typeof raw.skinTone === 'number' && Number.isInteger(raw.skinTone) && raw.skinTone >= 0 && raw.skinTone <= 100 ? raw.skinTone : SKIN_TONE_DEFAULT,
    }
  } catch {
    return null
  }
}
