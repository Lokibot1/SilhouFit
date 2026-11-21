import { isTime, toCustomer } from './adminOrdersApi'
import { ProductListError, request } from './fetchProductList'
import { isMoney, isRecord, oneOf } from './ordersApi'
import type { RequestOptions } from './simulateRequest'

// The profanity filter: the API's /admin/profanity-words and /admin/profanity-offenses endpoints (superadmin only). The API rejects query keys it does not know,
// so only the keys below are ever sent. No cache and no polling: every read goes to the server. The API also sends each offense's original, unmasked text;
// it is dropped here and never kept, so nothing on screen can show it.

export const OFFENSE_SOURCES = ['CHAT_MESSAGE', 'PRODUCT_REVIEW'] as const
export type OffenseSource = (typeof OFFENSE_SOURCES)[number]
export const OFFENSE_SOURCE_LABELS: Record<OffenseSource, string> = { CHAT_MESSAGE: 'Chat message', PRODUCT_REVIEW: 'Product review' }

export const WORD_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'fil', label: 'Filipino' },
]
export const languageLabel = (code: string) => WORD_LANGUAGES.find((language) => language.value === code)?.label ?? code

export type WordStatus = 'active' | 'archived' | 'all'

export interface ProfanityWord {
  id: string
  word: string
  language: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface Offense {
  id: string
  userId: string
  source: OffenseSource
  /** The text as it was delivered: the flagged words are already asterisks. */
  maskedContent: string
  matchedWords: string[]
  matchCount: number
  createdAt: string
  /** Null when the API did not include the account. */
  customer: { name: string; email: string } | null
}

interface Meta {
  total: number
  page: number
  limit: number
  totalPages: number
}
export interface WordsPage {
  data: ProfanityWord[]
  meta: Meta
}
export interface OffensesPage {
  data: Offense[]
  meta: Meta
}

export interface WordsParams {
  page?: number
  limit?: number
  search?: string
  language?: string
  status?: WordStatus
}

export interface OffensesParams {
  page?: number
  limit?: number
  userId?: string
  source?: OffenseSource
  /** ISO times. A date-only endDate would leave that day out, so send the end of the day. */
  startDate?: string
  endDate?: string
}

export const WORD_MAX = 100
export const MAX_WORD_SEARCH = 60
export const PROFANITY_PER_PAGE = 10
export const PROFANITY_PER_PAGE_OPTIONS = [10, 25, 50]

const bad = () => new ProductListError('server')

function toWord(value: unknown): ProfanityWord {
  if (!isRecord(value)) throw bad()
  const { id, word, language, isDeleted, createdAt, updatedAt } = value
  if (typeof id !== 'string' || typeof word !== 'string' || typeof language !== 'string' || !isTime(createdAt) || !isTime(updatedAt)) throw bad()
  return { id, word, language, isArchived: isDeleted === true, createdAt, updatedAt }
}

function toOffense(value: unknown): Offense {
  if (!isRecord(value)) throw bad()
  const { id, userId, source, maskedContent, matchedWords, matchCount, createdAt } = value
  if (typeof id !== 'string' || typeof userId !== 'string' || !oneOf(OFFENSE_SOURCES, source) || typeof maskedContent !== 'string' || !isTime(createdAt)) throw bad()
  if (!Array.isArray(matchedWords) || !matchedWords.every((word) => typeof word === 'string')) throw bad()
  return { id, userId, source, maskedContent, matchedWords, matchCount: isMoney(matchCount) ? matchCount : matchedWords.length, createdAt, customer: toCustomer(value.user) }
}

function toPage<T>(body: unknown, map: (value: unknown) => T, page: number, limit: number): { data: T[]; meta: Meta } {
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || !isMoney(meta.total)) throw bad()
  return { data: body.data.map(map), meta: { total: meta.total, page: Number(meta.page) || page, limit: Number(meta.limit) || limit, totalPages: Number(meta.totalPages) || 0 } }
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/** Called after every word is added, changed, archived or restored, so the list can load again. */
export function subscribeProfanity(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

const wordPath = (id: string) => `/admin/profanity-words/${encodeURIComponent(id)}`

/** Feature: Profanity filter – List offenses. GET /admin/profanity-offenses, newest first. */
export async function listOffenses({ page = 1, limit = PROFANITY_PER_PAGE, userId, source, startDate, endDate }: OffensesParams, { signal }: RequestOptions = {}): Promise<OffensesPage> {
  const query = new URLSearchParams({ page: String(page), limit: String(Math.min(limit, 100)) })
  if (userId) query.set('userId', userId)
  if (source) query.set('source', source)
  if (startDate) query.set('startDate', startDate)
  if (endDate) query.set('endDate', endDate)
  return toPage(await request('GET', `/admin/profanity-offenses?${query}`, undefined, signal), toOffense, page, limit)
}

/** Feature: Profanity filter – List words. GET /admin/profanity-words; the API lists active words unless asked for archived or all. */
export async function listWords({ page = 1, limit = PROFANITY_PER_PAGE, search, language, status }: WordsParams, { signal }: RequestOptions = {}): Promise<WordsPage> {
  const query = new URLSearchParams({ page: String(page), limit: String(Math.min(limit, 100)) })
  if (search) query.set('search', search)
  if (language) query.set('language', language)
  if (status) query.set('status', status)
  return toPage(await request('GET', `/admin/profanity-words?${query}`, undefined, signal), toWord, page, limit)
}

/** POST /admin/profanity-words. The API trims and lowercases the word; an active duplicate is a 409, an archived one comes back active. */
export async function createWord(input: { word: string; language: string }): Promise<ProfanityWord> {
  const word = toWord(await request('POST', '/admin/profanity-words', input))
  notify()
  return word
}

/** PATCH /admin/profanity-words/:id. An archived word is a 404 and a word that exists already a 409. */
export async function updateWord(id: string, input: { word: string; language: string }): Promise<ProfanityWord> {
  const word = toWord(await request('PATCH', wordPath(id), input))
  notify()
  return word
}

/** DELETE /admin/profanity-words/:id archives the word (it stops masking, and can be restored). Already archived is a 404. */
export async function archiveWord(id: string): Promise<ProfanityWord> {
  const word = toWord(await request('DELETE', wordPath(id), undefined))
  notify()
  return word
}

/** POST /admin/profanity-words/:id/restore. */
export async function restoreWord(id: string): Promise<ProfanityWord> {
  const word = toWord(await request('POST', `${wordPath(id)}/restore`, undefined))
  notify()
  return word
}
