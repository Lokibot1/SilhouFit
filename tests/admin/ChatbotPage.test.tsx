import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../../src/service/fetchProductList'
import * as service from '../../src/service/helpAnswers'
import { ChatbotPage } from '../../src/views/admin/ChatbotPage'
import { renderAdmin, setUpAdminDom } from '../shared/adminSession'
import { apiFaq, FAQS, faqStore, type ApiFaq } from '../shared/faqs'

vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))
vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
vi.mock('../../src/service/helpAnswers', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/service/helpAnswers')>()
  return {
    ...real,
    listHelpAnswers: vi.fn(real.listHelpAnswers),
    createHelpAnswer: vi.fn(real.createHelpAnswer),
    updateHelpAnswer: vi.fn(real.updateHelpAnswer),
    deleteHelpAnswer: vi.fn(real.deleteHelpAnswer),
    moveHelpAnswer: vi.fn(real.moveHelpAnswer),
  }
})

const PATH = '/admin/chatbot'
const serve = (rows: ApiFaq[]) => {
  const store = faqStore(rows)
  vi.mocked(request).mockImplementation(async (m, p, b) => store.handle(m, p, b).json)
}
const network = () => Object.assign(new Error('network'), { kind: 'network' })

beforeAll(setUpAdminDom)
beforeEach(() => serve(FAQS))
afterEach(() => vi.clearAllMocks())

// jsdom loads no CSS, so the table and the card list are both on screen: these look in the table.
const table = () => screen.getByRole('table')
const bodyRows = () => within(table()).getAllByRole('row').slice(1)
const rowOf = (question: string) => {
  const row = bodyRows().find((r) => within(r).queryByText(question))
  if (!row) throw new Error(`no row for ${question}`)
  return row
}
const searchBox = () => screen.getByRole('textbox', { name: 'Search questions' })
const FIRST = FAQS[0].question

async function renderPage() {
  renderAdmin(<ChatbotPage />, PATH)
  await within(table()).findByText(FIRST)
}

async function openAdd() {
  await userEvent.click(screen.getAllByRole('button', { name: 'Add question' })[0])
  return screen.findByRole('dialog', { name: 'Add question' })
}

describe('Help Chatbot page', () => {
  it('shows the title, no sample-data badge and the first page of questions', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Help Chatbot' })).toBeInTheDocument()
    expect(document.title).toBe('Help Chatbot — SilhouFit')
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content
    expect(meta.length).toBeGreaterThanOrEqual(150)
    expect(meta.length).toBeLessThanOrEqual(160)
    expect(screen.queryByText('Sample data')).toBeNull()
    expect(bodyRows()).toHaveLength(10)
    expect(screen.getByText('Displaying 1–10 of 15')).toBeInTheDocument()
    expect(within(rowOf(FIRST)).getByText('Published')).toBeInTheDocument()
  })

  it('shows a skeleton while the list loads', () => {
    vi.mocked(service.listHelpAnswers).mockReturnValueOnce(new Promise(() => {}))
    renderAdmin(<ChatbotPage />, PATH)
    expect(table()).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Loading questions')).toBeInTheDocument()
  })

  it('explains a failed load and loads again on Retry', async () => {
    vi.mocked(service.listHelpAnswers).mockRejectedValueOnce(network())
    renderAdmin(<ChatbotPage />, PATH)
    expect(await screen.findByText(/couldn.t load the help answers/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await within(table()).findByText(FIRST)).toBeInTheDocument()
  })

  it('says so when there are no questions, with a way to add one', async () => {
    serve([apiFaq(1, { isDeleted: true })])
    renderAdmin(<ChatbotPage />, PATH)
    expect(await screen.findByText('No questions yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add question' }).length).toBeGreaterThan(1)
  })

  it('searches after a pause, and offers Clear filters when nothing matches', async () => {
    await renderPage()
    await userEvent.type(searchBox(), 'zzzz')
    expect(await screen.findByText('No questions match')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Displaying 1–10 of 15')).toBeInTheDocument()
    expect(searchBox()).toHaveValue('')
  })

  const pick = async (option: string) => {
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: option }))
  }

  it('filters to only Published or only Drafts, and Clear filters resets it', async () => {
    serve([...FAQS.slice(0, 3), apiFaq(20, { question: 'A draft about gloves?', isActive: false, order: 4 })])
    await renderPage()
    await pick('Drafts')
    expect(await screen.findByText('Displaying 1–1 of 1')).toBeInTheDocument()
    expect(within(bodyRows()[0]).getByText('A draft about gloves?')).toBeInTheDocument()

    await pick('Published')
    expect(await screen.findByText('Displaying 1–3 of 3')).toBeInTheDocument()
    expect(bodyRows().every((r) => within(r).queryByText('Draft') === null)).toBe(true)

    await userEvent.type(searchBox(), 'gloves')
    expect(await screen.findByText('No questions match')).toBeInTheDocument()
    expect(screen.getByText(/clear the search, topic and status filters/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Displaying 1–4 of 4')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('All statuses')
  })
})

describe('the question sheet', () => {
  it('shows what is wrong in each field and counts characters', async () => {
    await renderPage()
    const dialog = await openAdd()
    expect(within(dialog).getByText('Customers see no button under this answer.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add question' }))
    expect(await within(dialog).findByText('Enter the question customers ask.')).toBeInTheDocument()
    expect(within(dialog).getByText('Enter the answer customers should see.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Question')).toHaveFocus()
    expect(service.createHelpAnswer).not.toHaveBeenCalled()

    await userEvent.type(within(dialog).getByLabelText('Question'), 'Why?')
    expect(within(dialog).getByText('4/120')).toBeInTheDocument()
    expect(within(dialog).getByText('Use at least 8 characters for the question.')).toBeInTheDocument()

    await userEvent.type(within(dialog).getByLabelText('Answer'), 'Mail us at help@kral.ph')
    expect(within(dialog).getByText('23/600')).toBeInTheDocument()
    expect(within(dialog).getByText(/Remove the email address/)).toBeInTheDocument()

    await userEvent.type(within(dialog).getByLabelText(/^Keywords/), 'a, b')
    expect(within(dialog).getByText('2/10')).toBeInTheDocument()
  })

  it('adds a draft, then publishes it so customers can see it', async () => {
    await renderPage()
    const dialog = await openAdd()
    await userEvent.type(within(dialog).getByLabelText('Question'), 'Do you gift wrap orders?')
    await userEvent.type(within(dialog).getByLabelText('Answer'), 'Gift wrapping is not offered yet.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add question' }))

    expect(await screen.findByText('Question "Do you gift wrap orders?" added as a draft')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(service.createHelpAnswer).toHaveBeenCalledWith(expect.objectContaining({ question: 'Do you gift wrap orders?', published: false }))
    expect((await service.listPublicAnswers()).some((a) => a.question === 'Do you gift wrap orders?')).toBe(false)

    await userEvent.type(searchBox(), 'gift wrap')
    const row = await waitFor(() => rowOf('Do you gift wrap orders?'))
    expect(within(row).getByText('Draft')).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: 'Edit Do you gift wrap orders?' }))
    const edit = await screen.findByRole('dialog', { name: 'Edit question' })
    await userEvent.click(within(edit).getByRole('switch', { name: 'Published' }))
    await userEvent.click(within(edit).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(within(rowOf('Do you gift wrap orders?')).getByText('Published')).toBeInTheDocument())
    expect((await service.listPublicAnswers()).some((a) => a.question === 'Do you gift wrap orders?')).toBe(true)
  })

  it('adds a question at the position typed, which puts it first', async () => {
    await renderPage()
    const dialog = await openAdd()
    await userEvent.type(within(dialog).getByLabelText('Question'), 'Do you gift wrap orders?')
    await userEvent.type(within(dialog).getByLabelText('Answer'), 'Gift wrapping is not offered yet.')
    await userEvent.type(within(dialog).getByLabelText(/^Position/), '1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add question' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(service.createHelpAnswer).toHaveBeenCalledWith(expect.objectContaining({ order: 1 }))
    await waitFor(() => expect(within(bodyRows()[0]).getByText('Do you gift wrap orders?')).toBeInTheDocument())
  })

  it('shows an error for a position of 0 and sends nothing', async () => {
    await renderPage()
    const dialog = await openAdd()
    await userEvent.type(within(dialog).getByLabelText('Question'), 'Do you gift wrap orders?')
    await userEvent.type(within(dialog).getByLabelText('Answer'), 'Gift wrapping is not offered yet.')
    await userEvent.type(within(dialog).getByLabelText(/^Position/), '0')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add question' }))

    expect(await within(dialog).findByText('Enter a whole number from 1, or leave it blank to place it last.')).toBeInTheDocument()
    expect(service.createHelpAnswer).not.toHaveBeenCalled()
  })

  it('opens Edit with the current position filled in', async () => {
    await renderPage()
    await userEvent.click(within(rowOf(FAQS[2].question)).getByRole('button', { name: `Edit ${FAQS[2].question}` }))
    const edit = await screen.findByRole('dialog', { name: 'Edit question' })
    expect(within(edit).getByLabelText(/^Position/)).toHaveValue('3')
  })
})

describe('deleting', () => {
  it('asks first, and deletes only after the confirm button', async () => {
    await renderPage()
    await userEvent.click(within(rowOf(FIRST)).getByRole('button', { name: `Delete ${FIRST}` }))
    const dialog = await screen.findByRole('dialog', { name: `Delete "${FIRST}"?` })
    expect(within(dialog).getByText('Are you sure?')).toBeInTheDocument()
    expect(service.deleteHelpAnswer).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(service.deleteHelpAnswer).not.toHaveBeenCalled()

    await userEvent.click(within(rowOf(FIRST)).getByRole('button', { name: `Delete ${FIRST}` }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete question' }))
    expect(await screen.findByText(`"${FIRST}" deleted`)).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('DELETE', `/faqs/${FAQS[0].id}`, undefined, undefined)
    await waitFor(() => expect(within(table()).queryByText(FIRST)).toBeNull())
  })
})

describe('reordering', () => {
  it('moves a question down and announces its new position', async () => {
    await renderPage()
    await userEvent.click(within(rowOf(FIRST)).getByRole('button', { name: `Move down: ${FIRST}` }))
    expect(await screen.findByText('Moved to position 2')).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('PATCH', `/faqs/${FAQS[0].id}`, { order: 2 }, undefined)
    await waitFor(() => expect(within(bodyRows()[1]).getByText(FIRST)).toBeInTheDocument())
  })

  it('cannot move the first question up', async () => {
    await renderPage()
    const up = within(rowOf(FIRST)).getByRole('button', { name: `Move up: ${FIRST}` })
    expect(up).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(up)
    expect(service.moveHelpAnswer).not.toHaveBeenCalled()
  })

  it('is switched off while the list is searched', async () => {
    await renderPage()
    await userEvent.type(searchBox(), 'sizing')
    await screen.findByText('Displaying 1–1 of 1')
    const down = within(bodyRows()[0]).getByRole('button', { name: /^Move down/ })
    expect(down).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(down)
    expect(service.moveHelpAnswer).not.toHaveBeenCalled()
  })

  it('is switched off while the status filter is on', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Published' }))
    await screen.findByText('Displaying 1–10 of 15')
    const down = within(rowOf(FIRST)).getByRole('button', { name: `Move down: ${FIRST}` })
    expect(down).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(down)
    expect(service.moveHelpAnswer).not.toHaveBeenCalled()
  })
})
