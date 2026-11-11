import { HELP_CATEGORIES, HELP_LINK_PATHS, type HelpCategory, type PublicPath } from '../service/helpAnswers'

/** What the answer form holds. Keywords stay one comma separated text while they are typed. */
export interface HelpFormValues {
  question: string
  answer: string
  keywords: string
  category: HelpCategory
  /** '' for no link. */
  linkTo: PublicPath | ''
  linkLabel: string
  published: boolean
}
export type HelpField = keyof HelpFormValues
export type HelpErrors = Partial<Record<HelpField, string>>

/** Every field in on-screen order; validation and first-invalid focus both follow it. */
export const HELP_FIELD_ORDER: HelpField[] = ['question', 'answer', 'category', 'keywords', 'linkTo', 'linkLabel', 'published']

export const HELP_LIMITS = { questionMin: 8, questionMax: 120, answerMin: 10, answerMax: 600, keywordsMax: 10, keywordMax: 24, linkLabelMax: 40 } as const

// Customers can read every published answer, so none may carry contact details or point into the dashboards.
const EMAIL = /[^\s@]+@[^\s@]+/
const URL_LIKE = /https?:|www\./i
const DASHBOARD_PATH = /\/(admin|staff|superadmin)\b/i
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const HTML_TAG = /<\/?[a-z!][^>]*>?/i

/** Why a text may not be shown to customers, or null. Digits split by spaces, dashes or dots still count as one run. */
export function confidentialityProblem(text: string): string | null {
  if (CONTROL.test(text)) return 'Remove the hidden control characters.'
  if (HTML_TAG.test(text)) return 'Use plain text only; remove anything inside < >.'
  if (EMAIL.test(text)) return 'Remove the email address. Customers can reach us through the Contact page instead.'
  if (URL_LIKE.test(text)) return 'Remove the web address. Use the link option to point to a page.'
  if (/\d{7,}/.test(text.replace(/(?<=\d)[\s\-().](?=\d)/g, ''))) return 'Remove the phone or account number. Customers can reach us through the Contact page instead.'
  if (DASHBOARD_PATH.test(text)) return 'Remove the staff page address. Customers cannot open it.'
  return null
}

export const parseKeywords = (text: string): string[] => [...new Set(text.split(',').map((k) => k.trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean))]

export function validateHelpAnswer(values: HelpFormValues): HelpErrors {
  const errors: HelpErrors = {}
  const { questionMin, questionMax, answerMin, answerMax, keywordsMax, keywordMax, linkLabelMax } = HELP_LIMITS

  const question = values.question.trim()
  if (!question) errors.question = 'Enter the question customers ask.'
  else if (question.length < questionMin) errors.question = `Use at least ${questionMin} characters for the question.`
  else if (question.length > questionMax) errors.question = `The question can be at most ${questionMax} characters.`
  else errors.question = confidentialityProblem(question) ?? undefined

  const answer = values.answer.trim()
  if (!answer) errors.answer = 'Enter the answer customers should see.'
  else if (answer.length < answerMin) errors.answer = `Use at least ${answerMin} characters for the answer.`
  else if (answer.length > answerMax) errors.answer = `The answer can be at most ${answerMax} characters.`
  else errors.answer = confidentialityProblem(answer) ?? undefined

  if (!HELP_CATEGORIES.includes(values.category)) errors.category = 'Choose a topic for this question.'

  const keywords = parseKeywords(values.keywords)
  if (keywords.length > keywordsMax) errors.keywords = `Use at most ${keywordsMax} keywords.`
  else if (keywords.some((k) => k.length > keywordMax)) errors.keywords = `Each keyword can be at most ${keywordMax} characters.`
  else if (keywords.some((k) => !/^[\p{L}\p{N} ]+$/u.test(k))) errors.keywords = 'Keywords can only have letters, numbers and spaces, separated by commas.'
  else errors.keywords = confidentialityProblem(keywords.join(' ')) ?? undefined

  if (values.linkTo && !HELP_LINK_PATHS.includes(values.linkTo as PublicPath)) errors.linkTo = 'Choose one of the listed pages.'
  const label = values.linkLabel.trim()
  if (values.linkTo && !label) errors.linkLabel = 'Enter the text customers tap to open the page.'
  else if (label.length > linkLabelMax) errors.linkLabel = `The link text can be at most ${linkLabelMax} characters.`
  else if (label) errors.linkLabel = confidentialityProblem(label) ?? undefined

  for (const key of Object.keys(errors) as HelpField[]) if (!errors[key]) delete errors[key]
  return errors
}
