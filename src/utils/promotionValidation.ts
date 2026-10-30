import type { PromoAppliesTo, PromoType, Promotion } from '../service/promotions'
import { stripEmoji } from './signUpValidation'

/** What the promotion form holds. Numbers stay text while they are typed. */
export interface PromotionFormValues {
  name: string
  code: string
  type: PromoType
  value: string
  appliesTo: PromoAppliesTo
  startsAt: string
  endsAt: string
  usageLimit: string
  minSpend: string
}
export type PromotionField = keyof PromotionFormValues
export type PromotionErrors = Partial<Record<PromotionField, string>>

/** Every field in on-screen order; validation and first-invalid focus both follow it. */
export const PROMOTION_FIELD_ORDER: PromotionField[] = ['name', 'code', 'type', 'value', 'appliesTo', 'startsAt', 'endsAt', 'usageLimit', 'minSpend']

export const PROMO_LIMITS = {
  nameMax: 40,
  codeMin: 4,
  codeMax: 20,
  percentMin: 1,
  percentMax: 90,
  fixedMax: 100000,
  usageMax: 1000000,
  minSpendMax: 1000000,
  productsMax: 20,
} as const

/** Letters, numbers and single spaces; no emoji or symbols. */
export const sanitizeName = (value: string) =>
  stripEmoji(value)
    .replace(/[^\p{L}\p{M}\p{N} ]/gu, '')
    .replace(/ {2,}/g, ' ')
    .replace(/^ /, '')
    .slice(0, PROMO_LIMITS.nameMax)

/** Upper case letters and digits only, however it was typed or pasted. */
export const sanitizeCode = (value: string) => stripEmoji(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, PROMO_LIMITS.codeMax)

const WHOLE = /^\d+$/
const MONEY = /^\d+(\.\d{1,2})?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** `existing` holds the other promotions' ids and codes; the one being edited (`editingId`) may keep its own code. */
export function validatePromotion(values: PromotionFormValues, existing: Pick<Promotion, 'id' | 'code'>[], editingId?: string): PromotionErrors {
  const errors: PromotionErrors = {}
  const { nameMax, codeMin, codeMax, percentMin, percentMax, fixedMax, usageMax, minSpendMax, productsMax } = PROMO_LIMITS

  const name = values.name.trim()
  if (!name) errors.name = 'Enter a name so you can tell this promotion apart.'
  else if (name.length < 3) errors.name = 'Use at least 3 characters for the name.'
  else if (name.length > nameMax) errors.name = `The name can be at most ${nameMax} characters.`

  const code = values.code.trim()
  if (!code) errors.code = 'Enter the code shoppers will type at checkout.'
  else if (!/^[A-Z0-9]+$/.test(code)) errors.code = 'A code can only have capital letters and numbers.'
  else if (code.length < codeMin || code.length > codeMax) errors.code = `Use ${codeMin} to ${codeMax} characters for the code.`
  else if (existing.some((p) => p.id !== editingId && p.code.toLowerCase() === code.toLowerCase())) errors.code = 'Another promotion already uses this code. Choose a different one.'

  const value = values.value.trim()
  if (!value) errors.value = values.type === 'percent' ? 'Enter how many percent off.' : 'Enter how many pesos off.'
  else if (values.type === 'percent') {
    if (!WHOLE.test(value)) errors.value = 'Use a whole number of percent, such as 20.'
    else if (Number(value) < percentMin || Number(value) > percentMax) errors.value = `Percent off must be from ${percentMin} to ${percentMax}.`
  } else if (!MONEY.test(value)) errors.value = 'Use pesos with at most 2 decimals, such as 200 or 199.50.'
  else if (Number(value) <= 0) errors.value = 'Pesos off must be more than 0.'
  else if (Number(value) > fixedMax) errors.value = `Pesos off can be at most ₱${fixedMax.toLocaleString('en-PH')}.`

  const { appliesTo } = values
  if (appliesTo.scope === 'category' && !appliesTo.category.trim()) errors.appliesTo = 'Choose the category this promotion applies to.'
  else if (appliesTo.scope === 'products' && appliesTo.products.length === 0) errors.appliesTo = 'Add at least 1 product to put on sale.'
  else if (appliesTo.scope === 'products' && appliesTo.products.length > productsMax) errors.appliesTo = `Choose at most ${productsMax} products.`

  if (!DATE.test(values.startsAt)) errors.startsAt = 'Choose the first day of the sale.'
  if (!DATE.test(values.endsAt)) errors.endsAt = 'Choose the last day of the sale.'
  else if (DATE.test(values.startsAt) && values.endsAt < values.startsAt) errors.endsAt = "End date can't be before the start date."

  const limit = values.usageLimit.trim()
  if (limit) {
    if (!WHOLE.test(limit)) errors.usageLimit = 'Use a whole number, or leave it empty for no limit.'
    else if (Number(limit) < 1) errors.usageLimit = 'The usage limit must be at least 1, or leave it empty for no limit.'
    else if (Number(limit) > usageMax) errors.usageLimit = `The usage limit can be at most ${usageMax.toLocaleString('en-PH')}.`
  }

  const spend = values.minSpend.trim()
  if (spend) {
    if (!MONEY.test(spend)) errors.minSpend = 'Use pesos with at most 2 decimals, or leave it empty for no minimum.'
    else if (Number(spend) > minSpendMax) errors.minSpend = `The minimum spend can be at most ₱${minSpendMax.toLocaleString('en-PH')}.`
  }

  return errors
}
