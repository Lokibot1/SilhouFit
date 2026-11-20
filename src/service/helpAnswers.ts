// The saved answers behind the "SilhouFit Bot" chatbot: the types, then the service over the FAQ API (GET, POST, PATCH and DELETE /faqs).
import type { HelpField } from '../utils/helpAnswerValidation'
import { ProductListError, request } from './fetchProductList'
import type { RequestOptions } from './simulateRequest'

/** A public page an answer can point to; anything else is rejected when the answer is saved. */
export const HELP_LINK_PATHS = ['/shop', '/cart', '/wishlist', '/orders', '/profile/measurements', '/login', '/signup', '/about', '/contact', '/refund-policy', '/privacy-policy', '/terms-of-service', '/cookie-policy'] as const
export type PublicPath = (typeof HELP_LINK_PATHS)[number]

export const HELP_CATEGORIES = ['orders', 'shipping', 'returns', 'sizing', 'ar-fitting', 'account', 'privacy', 'payments'] as const
export type HelpCategory = (typeof HELP_CATEGORIES)[number]
export const HELP_CATEGORY_LABELS: Record<HelpCategory, string> = {
  orders: 'Orders',
  shipping: 'Shipping',
  returns: 'Returns',
  sizing: 'Sizing',
  'ar-fitting': 'AR fitting',
  account: 'Account',
  privacy: 'Privacy',
  payments: 'Payments',
}

/** What the button under an answer says for each page. The API stores only the page, so the words come from here. */
export const HELP_LINK_TEXT: Record<PublicPath, string> = {
  '/shop': 'Browse the shop',
  '/cart': 'Open my cart',
  '/wishlist': 'Open my wishlist',
  '/orders': 'Open my orders',
  '/profile/measurements': 'Open body setup',
  '/login': 'Sign in',
  '/signup': 'Create an account',
  '/about': 'About KRAL',
  '/contact': 'Open the contact page',
  '/refund-policy': 'Read the refund policy',
  '/privacy-policy': 'Read the privacy policy',
  '/terms-of-service': 'Read the terms of service',
  '/cookie-policy': 'Read the cookie policy',
}

export interface HelpLink {
  label: string
  to: PublicPath
}

export interface HelpAnswer {
  id: string
  question: string
  /** Plain text. */
  answer: string
  keywords: string[]
  category: HelpCategory
  link: HelpLink | null
  published: boolean
  /** Position in the full list, from 1. */
  order: number
  updatedAt: string
}

/** All the chatbot ever sees of an answer: a published one, without who changed it or when. */
export type PublicHelpAnswer = Pick<HelpAnswer, 'id' | 'question' | 'answer' | 'keywords' | 'category' | 'link'>

export type HelpAnswerInput = Pick<HelpAnswer, 'question' | 'answer' | 'keywords' | 'category' | 'link' | 'published'> & {
  /** The position to put it at, from 1; the API shifts the others. Left out, a new answer goes last and an edited one stays put. */
  order?: number
}

export interface HelpPage {
  data: HelpAnswer[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface HelpQuery {
  search?: string
  category?: HelpCategory
  page?: number
  limit?: number
}

export const HELP_PER_PAGE = 10
export const HELP_PER_PAGE_OPTIONS = [10, 25, 50]
export const MAX_HELP_SEARCH = 60

// The API calls the AR fitting topic ar_fitting.
const toTopic = (category: HelpCategory) => category.replace('-', '_')
const toCategory = (topic: unknown): HelpCategory | null => {
  const category = typeof topic === 'string' ? topic.replace('_', '-') : ''
  return HELP_CATEGORIES.includes(category as HelpCategory) ? (category as HelpCategory) : null
}
const isPath = (value: unknown): value is PublicPath => HELP_LINK_PATHS.includes(value as PublicPath)
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** One FAQ from the API; an unreadable one is dropped, and a link to anywhere but the listed pages is not shown. */
function toAnswer(value: unknown): HelpAnswer | null {
  if (!isRecord(value)) return null
  const category = toCategory(value.topic)
  if (typeof value.id !== 'string' || typeof value.question !== 'string' || typeof value.answer !== 'string' || !category) return null
  return {
    id: value.id,
    question: value.question,
    answer: value.answer,
    keywords: Array.isArray(value.keywords) ? value.keywords.filter((k): k is string => typeof k === 'string') : [],
    category,
    link: isPath(value.link) ? { to: value.link, label: HELP_LINK_TEXT[value.link] } : null,
    published: value.isActive === true,
    order: typeof value.order === 'number' ? value.order : 0,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  }
}

function toAnswers(body: unknown, keep: (row: Record<string, unknown>) => boolean = () => true): HelpAnswer[] {
  if (!isRecord(body) || !Array.isArray(body.data)) throw new ProductListError('server')
  return body.data.filter((row) => isRecord(row) && keep(row)).flatMap((row) => toAnswer(row) ?? [])
}

// The API caps a page at 100 and the list is small, so one request reads every answer.
const ALL = 'limit=100&sortBy=order&sortOrder=asc'

// The rows read last, so a list can size its placeholder before the next read arrives.
let cache: HelpAnswer[] = []
export const getHelpAnswers = () => cache

/** Every answer, drafts included, deleted ones left out, in order. */
async function readAll(signal?: AbortSignal): Promise<HelpAnswer[]> {
  // `status=all` also lists soft-deleted answers, which the API marks `isDeleted`.
  cache = toAnswers(await request('GET', `/faqs?status=all&${ALL}`, undefined, signal), (row) => row.isDeleted !== true)
  return cache
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/** Called after every change, so a list can load again. */
export function subscribeHelpAnswers(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const FIELD_WORDS: [RegExp, HelpField][] = [
  [/^question\b/i, 'question'],
  [/^answer\b/i, 'answer'],
  [/^topic\b/i, 'category'],
  [/^keywords?\b/i, 'keywords'],
  [/^link\b/i, 'linkTo'],
  [/^order\b/i, 'position'],
]

/** Rewords a rule the server says was broken so the form can show it next to its field; any other failure passes through. */
async function save<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (!(error instanceof ProductListError) || error.kind !== 'validation' || !error.detail) throw error
    const detail = error.detail
    const field = FIELD_WORDS.find(([word]) => word.test(detail))?.[1]
    throw Object.assign(new Error(detail), { kind: 'validation', field })
  }
}

const toBody = (input: HelpAnswerInput) => ({
  question: input.question,
  answer: input.answer,
  topic: toTopic(input.category),
  keywords: input.keywords,
  link: input.link?.to ?? null,
  isActive: input.published,
  ...(input.order ? { order: input.order } : {}),
})

const one = (body: unknown): HelpAnswer => {
  const answer = toAnswer(body)
  if (!answer) throw new ProductListError('server')
  return answer
}

/** GET /faqs (no sign-in): the published answers in order, and only the fields the chatbot needs. */
export async function listPublicAnswers({ signal }: RequestOptions = {}): Promise<PublicHelpAnswer[]> {
  return toAnswers(await request('GET', `/faqs?${ALL}`, undefined, signal)).map(({ id, question, answer, keywords, category, link }) => ({ id, question, answer, keywords, category, link }))
}

/** Every answer for the admin list, then the search (question text, ignoring case), topic filter and page, all applied here. */
export async function listHelpAnswers({ signal, search, category, page = 1, limit = HELP_PER_PAGE }: HelpQuery & RequestOptions = {}): Promise<HelpPage> {
  const needle = search?.trim().toLowerCase().slice(0, MAX_HELP_SEARCH)
  const matched = (await readAll(signal)).filter((a) => (!category || a.category === category) && (!needle || a.question.toLowerCase().includes(needle)))
  return { data: matched.slice((page - 1) * limit, page * limit), meta: { total: matched.length, page, limit, totalPages: Math.ceil(matched.length / limit) } }
}

/** POST /faqs: the answer is added last, unless a position is given. */
export async function createHelpAnswer(input: HelpAnswerInput, { signal }: RequestOptions = {}): Promise<HelpAnswer> {
  const created = one(await save(() => request('POST', '/faqs', toBody(input), signal)))
  notify()
  return created
}

/** PATCH /faqs/:id. */
export async function updateHelpAnswer(id: string, input: HelpAnswerInput, { signal }: RequestOptions = {}): Promise<HelpAnswer> {
  const saved = one(await save(() => request('PATCH', `/faqs/${encodeURIComponent(id)}`, toBody(input), signal)))
  notify()
  return saved
}

/** DELETE /faqs/:id (the API keeps the row, marked deleted, and closes the gap in the order). */
export async function deleteHelpAnswer(id: string, { signal }: RequestOptions = {}): Promise<void> {
  await request('DELETE', `/faqs/${encodeURIComponent(id)}`, undefined, signal)
  notify()
}

/** PATCH /faqs/:id with the neighbour's position; the API shifts the others. At either end nothing moves. Returns the new position. */
export async function moveHelpAnswer(id: string, direction: 'up' | 'down', { signal }: RequestOptions = {}): Promise<number> {
  const rows = await readAll(signal)
  const from = rows.findIndex((a) => a.id === id)
  if (from < 0) throw new ProductListError('not-found')
  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= rows.length) return rows[from].order
  await request('PATCH', `/faqs/${encodeURIComponent(id)}`, { order: rows[to].order }, signal)
  notify()
  return rows[to].order
}
