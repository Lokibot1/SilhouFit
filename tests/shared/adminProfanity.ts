import type { Page, Route } from '@playwright/test'
import { fail, type AdminReply } from './adminOrders'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const PAGE_ORIGIN = 'http://localhost:5173'

/** A uuid that is the same on every run: words are `adminWordId(1)`, offenses `adminOffenseId(1)`... */
export const adminWordId = (n: number) => `00000000-0000-4000-8000-${String(700000 + n).padStart(12, '0')}`
export const adminOffenseId = (n: number) => `00000000-0000-4000-8000-${String(800000 + n).padStart(12, '0')}`
export type AdminWordDto = ReturnType<typeof adminWord>
export type AdminOffenseDto = ReturnType<typeof adminOffense>

/** A word as /admin/profanity-words sends it. Word 1 is the newest. */
export const adminWord = (n: number, over: Record<string, unknown> = {}) => ({
  id: adminWordId(n),
  word: `word${String.fromCharCode(96 + (n % 26 || 26))}`,
  language: 'en',
  isDeleted: false,
  createdAt: new Date(Date.UTC(2026, 9, 1, 2, 30) - n * 3_600_000).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 1, 2, 30) - n * 3_600_000).toISOString(),
  ...over,
})

/** An offense as /admin/profanity-offenses sends it, including the original text the page must never show. Offense 1 is the newest. */
export const adminOffense = (n: number, over: Record<string, unknown> = {}) => ({
  id: adminOffenseId(n),
  userId: 'u1',
  source: 'CHAT_MESSAGE',
  sourceId: `s${n}`,
  originalContent: `original secret text ${n}`,
  maskedContent: `you are ***** ${n}`,
  matchedWords: ['stupid'],
  matchCount: 1,
  createdAt: new Date(Date.UTC(2026, 9, 1, 2, 30) - n * 3_600_000).toISOString(),
  user: { id: 'u1', email: 'anne@example.com', firstName: 'Anne', lastName: 'Santos', fullName: 'Anne Santos', role: 'customer', isActive: true, messagingBlockedAt: null, offenseCount: n },
  ...over,
})

export const manyAdminWords = (count: number) => Array.from({ length: count }, (_, i) => adminWord(i + 1))
export const manyAdminOffenses = (count: number) => Array.from({ length: count }, (_, i) => adminOffense(i + 1))

export interface AdminProfanityMock {
  words: AdminWordDto[]
  offenses: AdminOffenseDto[]
  /** The query strings of GET /admin/profanity-words and GET /admin/profanity-offenses, in order. */
  wordLists: URLSearchParams[]
  offenseLists: URLSearchParams[]
  /** Every write as "METHOD /path after /admin/profanity-words", in order. */
  writes: string[]
  /** The JSON body of each write, in the same order; null where none was sent. */
  bodies: unknown[]
  /** The next answer to a write. */
  nextWrite?: AdminReply
}

const WORD_KEYS = ['page', 'limit', 'search', 'language', 'status']
const OFFENSE_KEYS = ['page', 'limit', 'userId', 'source', 'startDate', 'endDate']

/**
 * Stands in for the /admin/profanity-words and /admin/profanity-offenses endpoints with in-memory lists: only the keys the API knows (anything else is a 400),
 * a limit of 100 at most, words active unless asked for archived or all, an endDate that is a moment (so a date-only one is not what the page sends),
 * 409 for an active duplicate, 404 for an archived word that is edited or archived, and restore. Register it after mockAuth. Only requests to another origin than the page are answered.
 */
export async function mockAdminProfanity(page: Page, initial: { words?: AdminWordDto[]; offenses?: AdminOffenseDto[] } = {}): Promise<AdminProfanityMock> {
  const mock: AdminProfanityMock = { words: [...(initial.words ?? [])], offenses: [...(initial.offenses ?? [])], wordLists: [], offenseLists: [], writes: [], bodies: [] }
  const paged = <T>(rows: T[], q: URLSearchParams) => {
    const limit = Number(q.get('limit') ?? 20)
    const pageNo = Number(q.get('page') ?? 1)
    return { data: rows.slice((pageNo - 1) * limit, pageNo * limit), meta: { total: rows.length, page: pageNo, limit, totalPages: Math.ceil(rows.length / limit) } }
  }
  const handle = async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(request.url())
    const reply = (r: AdminReply) => route.fulfill({ status: r.status, json: r.json, headers: CORS })
    const [, , resource, id = null, action = null] = url.pathname.split('/')

    if (request.method() !== 'GET') {
      mock.writes.push(`${request.method()} ${url.pathname.replace('/admin/profanity-words', '') || '/'}`)
      const body = request.postData() ? (request.postDataJSON() as { word?: string; language?: string }) : null
      mock.bodies.push(body)
      if (mock.nextWrite) {
        const next = mock.nextWrite
        mock.nextWrite = undefined
        return reply(next)
      }
      const now = new Date().toISOString()
      if (!id) {
        const word = (body?.word ?? '').trim().toLowerCase()
        const language = body?.language ?? 'en'
        if (mock.words.some((w) => w.word === word && !w.isDeleted)) return reply(fail(409, `Profanity word "${word}" already exists`))
        const archived = mock.words.find((w) => w.word === word && w.isDeleted)
        const created = archived ? Object.assign(archived, { isDeleted: false, language, updatedAt: now }) : adminWord(mock.words.length + 1, { word, language, createdAt: now, updatedAt: now })
        if (!archived) mock.words.unshift(created)
        return reply({ status: 201, json: created })
      }
      const found = mock.words.find((w) => w.id === id)
      if (!found) return reply(fail(404, `Profanity word with ID "${id}" not found`))
      if (action === 'restore') return reply({ status: 200, json: Object.assign(found, { isDeleted: false, updatedAt: now }) })
      if (found.isDeleted) return reply(fail(404, `Profanity word with ID "${id}" not found`))
      if (request.method() === 'DELETE') return reply({ status: 200, json: Object.assign(found, { isDeleted: true, updatedAt: now }) })
      const word = body?.word?.trim().toLowerCase()
      if (word && mock.words.some((w) => w.id !== id && w.word === word && !w.isDeleted)) return reply(fail(409, `Profanity word "${word}" already exists`))
      return reply({ status: 200, json: Object.assign(found, { ...(word && { word }), ...(body?.language && { language: body.language }), updatedAt: now }) })
    }

    const q = url.searchParams
    const known = resource === 'profanity-offenses' ? OFFENSE_KEYS : WORD_KEYS
    ;(resource === 'profanity-offenses' ? mock.offenseLists : mock.wordLists).push(q)
    const unknown = [...q.keys()].filter((key) => !known.includes(key))
    if (unknown.length) return reply(fail(400, unknown.map((key) => `property ${key} should not exist`)))
    if (Number(q.get('limit') ?? 20) > 100) return reply(fail(400, 'limit must not be greater than 100'))

    if (resource === 'profanity-offenses') {
      const start = q.get('startDate')
      const end = q.get('endDate')
      const matched = mock.offenses
        .filter((o) => !q.get('source') || o.source === q.get('source'))
        .filter((o) => !start || o.createdAt >= new Date(start).toISOString())
        .filter((o) => !end || o.createdAt <= new Date(end).toISOString())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return reply({ status: 200, json: paged(matched, q) })
    }
    const status = q.get('status') ?? 'active'
    const search = (q.get('search') ?? '').trim().toLowerCase()
    const matched = mock.words
      .filter((w) => status === 'all' || (status === 'archived') === w.isDeleted)
      .filter((w) => !q.get('language') || w.language === q.get('language'))
      .filter((w) => !search || w.word.includes(search))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return reply({ status: 200, json: paged(matched, q) })
  }
  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/admin\/profanity-(words|offenses)(\/|$)/.test(url.pathname), handle)
  return mock
}
