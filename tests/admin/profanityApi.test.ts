import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError, request } from '../../src/service/fetchProductList'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const { archiveWord, createWord, listOffenses, listWords, restoreWord, subscribeProfanity, updateWord } = await import('../../src/service/profanity')

const apiWord = (over: Record<string, unknown> = {}) => ({ id: 'w1', word: 'stupid', language: 'en', isDeleted: false, createdAt: '2026-10-01T02:00:00.000Z', updatedAt: '2026-10-02T02:00:00.000Z', ...over })
const apiOffense = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  userId: 'u1',
  source: 'CHAT_MESSAGE',
  sourceId: 's1',
  originalContent: 'you are stupid',
  maskedContent: 'you are ******',
  matchedWords: ['stupid'],
  matchCount: 1,
  createdAt: '2026-10-26T14:30:00.000Z',
  user: { id: 'u1', email: 'anne@example.com', firstName: 'Anne', lastName: 'Santos', fullName: 'Anne Santos', role: 'customer', isActive: true, messagingBlockedAt: null, offenseCount: 1 },
  ...over,
})
const page = (data: unknown[]) => ({ data, meta: { total: data.length, page: 1, limit: 10, totalPages: 1 } })

beforeEach(() => vi.resetAllMocks())

describe('listing offenses', () => {
  it('leaves out every filter that is not set', async () => {
    send.mockResolvedValue(page([]))
    await listOffenses({})
    expect(send).toHaveBeenCalledWith('GET', '/admin/profanity-offenses?page=1&limit=10', undefined, undefined)
  })

  it('sends only keys the API knows, with the limit capped at 100', async () => {
    send.mockResolvedValue(page([]))
    await listOffenses({ page: 2, limit: 500, userId: 'u1', source: 'PRODUCT_REVIEW', startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-02T15:59:59.999Z' })
    const query = new URL(`http://x${send.mock.calls[0][1]}`).searchParams
    expect([...query.keys()]).toEqual(['page', 'limit', 'userId', 'source', 'startDate', 'endDate'])
    expect(query.get('limit')).toBe('100')
  })

  it('maps an offense and never keeps the original text', async () => {
    send.mockResolvedValue(page([apiOffense(), apiOffense({ id: 'f2', user: undefined })]))
    const { data } = await listOffenses({})
    expect(data[0]).toEqual({
      id: 'f1',
      userId: 'u1',
      source: 'CHAT_MESSAGE',
      maskedContent: 'you are ******',
      matchedWords: ['stupid'],
      matchCount: 1,
      createdAt: '2026-10-26T14:30:00.000Z',
      customer: { name: 'Anne Santos', email: 'anne@example.com' },
    })
    expect(JSON.stringify(data)).not.toContain('you are stupid')
    expect(data[1].customer).toBeNull()
  })

  it('rejects a body that is not a page, or an offense with an unknown source', async () => {
    send.mockResolvedValue({ nope: true })
    await expect(listOffenses({})).rejects.toBeInstanceOf(ProductListError)
    send.mockResolvedValue(page([apiOffense({ source: 'EMAIL' })]))
    await expect(listOffenses({})).rejects.toBeInstanceOf(ProductListError)
  })
})

describe('listing words', () => {
  it('sends only the keys that are set', async () => {
    send.mockResolvedValue(page([]))
    await listWords({ search: 'stu', language: 'fil', status: 'archived', page: 3, limit: 25 })
    const query = new URL(`http://x${send.mock.calls[0][1]}`).searchParams
    expect(Object.fromEntries(query)).toEqual({ page: '3', limit: '25', search: 'stu', language: 'fil', status: 'archived' })
  })

  it('maps isDeleted to isArchived', async () => {
    send.mockResolvedValue(page([apiWord(), apiWord({ id: 'w2', isDeleted: true })]))
    const { data, meta } = await listWords({})
    expect(data.map((w) => w.isArchived)).toEqual([false, true])
    expect(meta).toEqual({ total: 2, page: 1, limit: 10, totalPages: 1 })
  })
})

describe('changing words', () => {
  it('creates, updates, archives and restores through the right endpoints, and notifies after each', async () => {
    const seen = vi.fn()
    const stop = subscribeProfanity(seen)
    send.mockResolvedValue(apiWord())
    await createWord({ word: 'stupid', language: 'en' })
    await updateWord('w 1', { word: 'dumb', language: 'fil' })
    await archiveWord('w1')
    await restoreWord('w1')
    expect(send.mock.calls.map(([method, path]) => `${method} ${path}`)).toEqual([
      'POST /admin/profanity-words',
      'PATCH /admin/profanity-words/w%201',
      'DELETE /admin/profanity-words/w1',
      'POST /admin/profanity-words/w1/restore',
    ])
    expect(send.mock.calls[0][2]).toEqual({ word: 'stupid', language: 'en' })
    expect(seen).toHaveBeenCalledTimes(4)
    stop()
  })

  it('does not notify when the API refuses, and keeps its error', async () => {
    const seen = vi.fn()
    const stop = subscribeProfanity(seen)
    send.mockRejectedValue(new ProductListError('conflict', 'Word already exists', 409))
    await expect(createWord({ word: 'stupid', language: 'en' })).rejects.toMatchObject({ status: 409, detail: 'Word already exists' })
    expect(seen).not.toHaveBeenCalled()
    stop()
  })
})
