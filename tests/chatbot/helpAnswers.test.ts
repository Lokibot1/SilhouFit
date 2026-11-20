import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as service from '../../src/service/helpAnswers'
import { ProductListError, request } from '../../src/service/fetchProductList'
import { apiFaq, faqStore, type ApiFaq } from '../shared/faqs'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const input = (over: Partial<service.HelpAnswerInput> = {}): service.HelpAnswerInput => ({
  question: 'Do you gift wrap orders?',
  answer: 'Gift wrapping is not offered yet.',
  keywords: ['gift'],
  category: 'orders',
  link: null,
  published: true,
  ...over,
})
const body = { question: 'Do you gift wrap orders?', answer: 'Gift wrapping is not offered yet.', topic: 'orders', keywords: ['gift'], link: null, isActive: true }

/** Answers every call from a store of these rows. */
function serve(rows: ApiFaq[]) {
  const store = faqStore(rows)
  send.mockImplementation(async (m, p, b) => store.handle(m, p, b).json)
  return store
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('listPublicAnswers', () => {
  it('asks for the published answers in order, without status=all', async () => {
    serve([apiFaq(1)])
    await service.listPublicAnswers()
    expect(send).toHaveBeenCalledWith('GET', '/faqs?limit=100&sortBy=order&sortOrder=asc', undefined, undefined)
  })

  it('shows only the fields the chatbot needs, with the topic and link read for the chatbot', async () => {
    serve([apiFaq(1, { topic: 'ar_fitting', link: '/profile/measurements' })])
    const [shown] = await service.listPublicAnswers()
    expect(shown.category).toBe('ar-fitting')
    expect(shown.link).toEqual({ to: '/profile/measurements', label: 'Open body setup' })
    expect(Object.keys(shown).sort()).toEqual(['answer', 'category', 'id', 'keywords', 'link', 'question'])
  })

  it('shows no link to a staff page or another site, and drops a row with an unknown topic', async () => {
    serve([apiFaq(1, { link: '/admin/users' }), apiFaq(2, { link: 'https://x' }), apiFaq(3, { topic: 'weather' })])
    const shown = await service.listPublicAnswers()
    expect(shown).toHaveLength(2)
    expect(shown.map((a) => a.link)).toEqual([null, null])
  })
})

describe('listHelpAnswers', () => {
  const rows = () => [apiFaq(1, { question: 'How do I pay?', topic: 'payments' }), apiFaq(2, { question: 'A draft question', isActive: false }), apiFaq(3, { question: 'Gone question', isDeleted: true }), apiFaq(4, { question: 'Where is my parcel?' })]

  it('asks for every answer with status=all, keeps drafts and drops deleted ones', async () => {
    serve(rows())
    const { data, meta } = await service.listHelpAnswers()
    expect(send.mock.calls[0][1]).toBe('/faqs?status=all&limit=100&sortBy=order&sortOrder=asc')
    expect(data.map((a) => [a.question, a.published])).toEqual([
      ['How do I pay?', true],
      ['A draft question', false],
      ['Where is my parcel?', true],
    ])
    expect(meta.total).toBe(3)
  })

  it('searches the question text ignoring case, and filters by topic', async () => {
    serve(rows())
    expect((await service.listHelpAnswers({ search: 'PARCEL' })).data.map((a) => a.question)).toEqual(['Where is my parcel?'])
    expect((await service.listHelpAnswers({ category: 'payments' })).data.map((a) => a.question)).toEqual(['How do I pay?'])
  })

  it('pages the result', async () => {
    serve(rows())
    const { data, meta } = await service.listHelpAnswers({ page: 2, limit: 1 })
    expect(data.map((a) => a.question)).toEqual(['A draft question'])
    expect(meta).toEqual({ total: 3, page: 2, limit: 1, totalPages: 3 })
  })

  it('rejects an answer that is not a list', async () => {
    send.mockResolvedValue({})
    await expect(service.listHelpAnswers()).rejects.toMatchObject({ kind: 'server' })
  })
})

describe('saving', () => {
  it('creates with the API body, and tells a listener', async () => {
    serve([])
    const seen = vi.fn()
    const stop = service.subscribeHelpAnswers(seen)
    await service.createHelpAnswer(input({ category: 'ar-fitting', link: { to: '/shop', label: 'Browse the shop' } }))
    expect(send).toHaveBeenCalledWith('POST', '/faqs', { ...body, topic: 'ar_fitting', link: '/shop' }, undefined)
    expect(seen).toHaveBeenCalledTimes(1)
    stop()
  })

  it('updates with a PATCH of the same body', async () => {
    serve([apiFaq(1)])
    await service.updateHelpAnswer('faq-1', input())
    expect(send).toHaveBeenCalledWith('PATCH', '/faqs/faq-1', body, undefined)
  })

  it('names the field of a rule the server says was broken', async () => {
    send.mockRejectedValueOnce(new ProductListError('validation', 'question must be shorter than or equal to 120 characters', 400))
    await expect(service.createHelpAnswer(input())).rejects.toMatchObject({ kind: 'validation', field: 'question' })
    send.mockRejectedValueOnce(new ProductListError('validation', 'topic must be one of the following values: orders', 400))
    await expect(service.createHelpAnswer(input())).rejects.toMatchObject({ kind: 'validation', field: 'category' })
  })

  it('sends the position only when one is given, on create and on update', async () => {
    serve([apiFaq(1)])
    await service.createHelpAnswer(input({ order: 2 }))
    expect(send).toHaveBeenLastCalledWith('POST', '/faqs', { ...body, order: 2 }, undefined)
    await service.updateHelpAnswer('faq-1', input({ order: 3 }))
    expect(send).toHaveBeenLastCalledWith('PATCH', '/faqs/faq-1', { ...body, order: 3 }, undefined)
    await service.createHelpAnswer(input({ order: undefined }))
    expect(send).toHaveBeenLastCalledWith('POST', '/faqs', body, undefined)
  })

  it('names the position field when the server rejects the order', async () => {
    send.mockRejectedValueOnce(new ProductListError('validation', 'order must not be less than 1', 400))
    await expect(service.createHelpAnswer(input({ order: 1 }))).rejects.toMatchObject({ kind: 'validation', field: 'position' })
  })

  it('lets any other failure through', async () => {
    send.mockRejectedValueOnce(new ProductListError('server'))
    await expect(service.createHelpAnswer(input())).rejects.toMatchObject({ kind: 'server' })
  })

  it('deletes with a DELETE and tells a listener', async () => {
    send.mockResolvedValue({})
    const seen = vi.fn()
    const stop = service.subscribeHelpAnswers(seen)
    await service.deleteHelpAnswer('faq-1')
    expect(send).toHaveBeenCalledWith('DELETE', '/faqs/faq-1', undefined, undefined)
    expect(seen).toHaveBeenCalledTimes(1)
    stop()
  })
})

describe('moveHelpAnswer', () => {
  const rows = () => [apiFaq(1, { id: 'a' }), apiFaq(9, { id: 'x', isDeleted: true, order: 0 }), apiFaq(2, { id: 'b' }), apiFaq(3, { id: 'c' })]

  it('moves one place up with the neighbour position and reports it', async () => {
    serve(rows())
    expect(await service.moveHelpAnswer('b', 'up')).toBe(1)
    expect(send).toHaveBeenCalledWith('PATCH', '/faqs/b', { order: 1 }, undefined)
  })

  it('does nothing at either end', async () => {
    serve(rows())
    expect(await service.moveHelpAnswer('a', 'up')).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(await service.moveHelpAnswer('c', 'down')).toBe(3)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('rejects an answer that is not there', async () => {
    serve(rows())
    await expect(service.moveHelpAnswer('nope', 'up')).rejects.toMatchObject({ kind: 'not-found' })
  })
})
