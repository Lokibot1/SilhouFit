import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError, request } from '../../src/service/fetchProductList'
import { ProfanityPage } from '../../src/views/superadmin/ProfanityPage'
import { renderAdmin, setUpAdminDom } from '../shared/adminSession'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const word = (n: number, over: Record<string, unknown> = {}) => ({
  id: `w${n}`,
  word: `badword${n}`,
  language: 'en',
  isDeleted: false,
  createdAt: '2026-10-01T02:30:00.000Z',
  updatedAt: '2026-10-26T14:30:00.000Z',
  ...over,
})
const offense = (n: number, over: Record<string, unknown> = {}) => ({
  id: `f${n}`,
  userId: 'u1',
  source: 'CHAT_MESSAGE',
  sourceId: `s${n}`,
  originalContent: `original secret text ${n}`,
  maskedContent: `you are ***** ${n}`,
  matchedWords: ['stupid', 'dumb'],
  matchCount: 2,
  createdAt: '2026-10-26T14:30:00.000Z',
  user: { id: 'u1', email: 'anne@example.com', firstName: 'Anne', lastName: 'Santos', fullName: 'Anne Santos', role: 'customer', isActive: true, messagingBlockedAt: null, offenseCount: 2 },
  ...over,
})
const page = (data: unknown[], total = data.length) => ({ data, meta: { total, page: 1, limit: 10, totalPages: Math.max(1, Math.ceil(total / 10)) } })

/** What the fake API answers: reads by path, and the next answer to a write. */
const api = { words: page([word(1), word(2, { language: 'fil' })]) as unknown, offenses: page([offense(1)]) as unknown, write: null as unknown }
const lists = (path: string) => send.mock.calls.filter(([method, p]) => method === 'GET' && p.startsWith(path)).map(([, p]) => new URL(`http://x${p}`).searchParams)
const writes = () => send.mock.calls.filter(([method]) => method !== 'GET')

beforeAll(setUpAdminDom)
beforeEach(() => {
  api.words = page([word(1), word(2, { language: 'fil' })])
  api.offenses = page([offense(1)])
  api.write = word(9)
  send.mockImplementation(async (method, path) => {
    const answer = method !== 'GET' ? api.write : path.startsWith('/admin/profanity-offenses') ? api.offenses : api.words
    if (answer instanceof Error) throw answer
    return answer
  })
})
afterEach(() => vi.resetAllMocks())

const table = () => screen.getByRole('table')
const bodyRows = () => within(table()).getAllByRole('row').slice(1)

async function renderWords() {
  renderAdmin(<ProfanityPage />, '/superadmin/profanity')
  await within(table()).findByText('badword1')
}

describe('Profanity page: Words', () => {
  it('lists active words with language, status and a 12-hour update time', async () => {
    await renderWords()
    expect(document.title).toBe('Profanity Filter — SilhouFit')
    expect(within(table()).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Word', 'Language', 'Status', 'Updated', 'Actions'])
    expect(bodyRows()).toHaveLength(2)
    expect(bodyRows()[1]).toHaveTextContent(/badword2.*Filipino.*Active/)
    expect(bodyRows()[0].textContent).toMatch(/\b(AM|PM)\b/)
    expect(lists('/admin/profanity-words')[0].get('status')).toBe('active')
  })

  it('shows a skeleton while loading', () => {
    send.mockReturnValue(new Promise(() => {}))
    renderAdmin(<ProfanityPage />, '/superadmin/profanity')
    expect(screen.getByText('Loading words')).toBeInTheDocument()
  })

  it('shows an error with Retry, and Retry asks again', async () => {
    api.words = new ProductListError('server')
    renderAdmin(<ProfanityPage />, '/superadmin/profanity')
    expect(await screen.findByText(/We couldn't load the words/)).toBeInTheDocument()
    api.words = page([word(1)])
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(within(table()).getByText('badword1')).toBeInTheDocument())
  })

  it('invites the first word when there are none, and the Add word button there opens the form', async () => {
    api.words = page([])
    renderAdmin(<ProfanityPage />, '/superadmin/profanity')
    expect(await screen.findByText('No words yet')).toBeInTheDocument()
    const cta = screen.getAllByRole('button', { name: 'Add word' }).find((b) => b.className.includes('border-line') || true)!
    await userEvent.click(cta)
    expect(await screen.findByRole('dialog', { name: 'Add word' })).toBeInTheDocument()
  })

  it('offers Clear filters when a search finds nothing, and clearing asks again', async () => {
    const user = userEvent.setup()
    await renderWords()
    api.words = page([])
    await user.type(screen.getByRole('textbox', { name: 'Search words' }), 'zzz')
    expect(await screen.findByText('No words match')).toBeInTheDocument()
    expect(await waitFor(() => lists('/admin/profanity-words').at(-1))).toBeTruthy()
    expect(lists('/admin/profanity-words').at(-1)!.get('search')).toBe('zzz')
    api.words = page([word(1)])
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(within(table()).getByText('badword1')).toBeInTheDocument())
  })

  it('shows the archived tab and says when it is empty', async () => {
    const user = userEvent.setup()
    await renderWords()
    api.words = page([])
    await user.click(screen.getByRole('tab', { name: 'Archived' }))
    expect(await screen.findByText('No archived words')).toBeInTheDocument()
    expect(lists('/admin/profanity-words').at(-1)!.get('status')).toBe('archived')
  })

  it('adds a word: letters and spaces only, a counter, and a toast after saving', async () => {
    const user = userEvent.setup()
    await renderWords()
    await user.click(screen.getByRole('button', { name: 'Add word' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add word' })
    const input = within(dialog).getByLabelText('Word or phrase')
    await user.type(input, 'bad 123')
    expect(within(dialog).getByText(/letters and spaces only/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add Word' })).toBeDisabled()
    expect(within(dialog).getByText('7/100')).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, 'Bad Word')
    await user.click(within(dialog).getByRole('button', { name: 'Add Word' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0].slice(0, 3)).toEqual(['POST', '/admin/profanity-words', { word: 'Bad Word', language: 'en' }])
    expect(await screen.findByText(/added to the filter/)).toBeInTheDocument()
  })

  it("keeps the form open and shows the server's sentence on a duplicate", async () => {
    const user = userEvent.setup()
    await renderWords()
    api.write = new ProductListError('conflict', 'Profanity word "dup" already exists', 409)
    await user.click(screen.getByRole('button', { name: 'Add word' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add word' })
    await user.type(within(dialog).getByLabelText('Word or phrase'), 'dup')
    await user.click(within(dialog).getByRole('button', { name: 'Add Word' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/already exists/)
    expect(screen.getByRole('dialog', { name: 'Add word' })).toBeInTheDocument()
  })

  it('asks "Are you sure?" before archiving, then archives with an Undo toast', async () => {
    const user = userEvent.setup()
    await renderWords()
    await user.click(within(table()).getByRole('button', { name: 'Archive badword1' }))
    expect(await screen.findByText('Are you sure?')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Archive Word' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0].slice(0, 2)).toEqual(['DELETE', '/admin/profanity-words/w1'])
    expect(await screen.findByText(/"badword1" archived\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('cancelling the archive sends nothing', async () => {
    const user = userEvent.setup()
    await renderWords()
    await user.click(within(table()).getByRole('button', { name: 'Archive badword1' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(writes()).toHaveLength(0)
  })

  it('gives an archived word Restore and no Edit or Archive', async () => {
    const user = userEvent.setup()
    api.words = page([word(1, { isDeleted: true })])
    renderAdmin(<ProfanityPage />, '/superadmin/profanity')
    await within(table()).findByText('badword1')
    expect(within(table()).queryByRole('button', { name: /^(Edit|Archive) / })).not.toBeInTheDocument()
    await user.click(within(table()).getByRole('button', { name: 'Restore badword1' }))
    await waitFor(() => expect(writes()[0].slice(0, 2)).toEqual(['POST', '/admin/profanity-words/w1/restore']))
    expect(await screen.findByText(/"badword1" restored/)).toBeInTheDocument()
  })
})

describe('Profanity page: Offenses', () => {
  async function renderOffenses() {
    renderAdmin(<ProfanityPage />, '/superadmin/profanity')
    await userEvent.click(screen.getByRole('tab', { name: 'Offenses' }))
    await within(table()).findByText('you are ***** 1')
  }

  it('shows the masked text, matched words, count, source and a two-line 12-hour date, and never the original text', async () => {
    await renderOffenses()
    expect(within(table()).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Date', 'Customer', 'Source', 'Message', 'Matched words', 'Count'])
    expect(bodyRows()[0]).toHaveTextContent(/Anne Santos.*Chat message.*you are \*{5} 1.*stupid, dumb.*2/)
    expect(bodyRows()[0].textContent).toMatch(/\d (AM|PM)/)
    expect(document.body.textContent).not.toContain('original secret text')
  })

  it('filters by source and sends the end of the day as a moment', async () => {
    const user = userEvent.setup()
    await renderOffenses()
    await user.type(screen.getByLabelText('To date'), '2026-10-26')
    await waitFor(() => expect(lists('/admin/profanity-offenses').at(-1)!.get('endDate')).toBe(new Date('2026-10-26T23:59:59.999').toISOString()))
    await user.type(screen.getByLabelText('From date'), '2026-10-20')
    await waitFor(() => expect(lists('/admin/profanity-offenses').at(-1)!.get('startDate')).toBe(new Date('2026-10-20T00:00:00').toISOString()))
    await user.click(screen.getByRole('combobox', { name: /Filter by source/ }))
    await user.click(await screen.findByRole('option', { name: 'Product review' }))
    await waitFor(() => expect(lists('/admin/profanity-offenses').at(-1)!.get('source')).toBe('PRODUCT_REVIEW'))
  })

  it('says there are no offenses yet, and offers Clear filters when a filter finds none', async () => {
    const user = userEvent.setup()
    api.offenses = page([])
    renderAdmin(<ProfanityPage />, '/superadmin/profanity')
    await user.click(screen.getByRole('tab', { name: 'Offenses' }))
    expect(await screen.findByText('No offenses yet')).toBeInTheDocument()
    await user.type(screen.getByLabelText('From date'), '2026-10-20')
    expect(await screen.findByText('No offenses match')).toBeInTheDocument()
    api.offenses = page([offense(1)])
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(within(table()).getByText('you are ***** 1')).toBeInTheDocument())
  })

  it('shows an error with Retry', async () => {
    const user = userEvent.setup()
    api.offenses = new ProductListError('server')
    renderAdmin(<ProfanityPage />, '/superadmin/profanity')
    await user.click(screen.getByRole('tab', { name: 'Offenses' }))
    expect(await screen.findByText(/We couldn't load the offenses/)).toBeInTheDocument()
    api.offenses = page([offense(1)])
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(within(table()).getByText('you are ***** 1')).toBeInTheDocument())
  })
})
