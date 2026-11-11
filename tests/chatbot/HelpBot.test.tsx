import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HelpBot } from '../../src/components/chat/dock/HelpBot'
import { close, getDock, getHelpSession, openChat, replyAfter, reset } from '../../src/service/chatDock'
import { clearSession, setSession } from '../../src/service/session'
import * as service from '../../src/service/helpAnswers'
import { Where } from '../shared/adminSession'

vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))
vi.mock('../../src/service/helpAnswers', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/service/helpAnswers')>()
  return { ...real, listPublicAnswers: vi.fn(real.listPublicAnswers) }
})

const original = service.getHelpAnswers()
const network = () => Object.assign(new Error('network'), { kind: 'network' })

beforeAll(() => {
  // Reduced motion: the bot answers at once instead of after its typing pause.
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollTo = () => {}
})
beforeEach(() => {
  clearSession()
  reset()
  service.setHelpAnswers(original)
})
afterEach(() => vi.clearAllMocks())

function setup() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Where />
      <HelpBot />
    </MemoryRouter>,
  )
}
const field = () => screen.findByRole('textbox', { name: 'Message' })

describe('HelpBot answers', () => {
  it('welcomes with suggested questions, answers a tapped one with its link and related questions', async () => {
    const user = userEvent.setup()
    setup()
    expect(await screen.findByText(/I'm KRAL Help/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'How do I enter my measurements?' }))
    expect(screen.getByText(/Enter your measurements in centimetres or inches/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open body setup' })).toHaveAttribute('href', '/profile/measurements')
    expect(screen.getByRole('button', { name: 'How accurate is the sizing?' })).toBeInTheDocument()
  })

  it('browses topics, then the questions of one topic', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByRole('button', { name: 'Browse topics' }))
    await user.click(screen.getByRole('button', { name: 'Sizing' }))
    expect(screen.getByRole('button', { name: 'How do I find my size?' })).toBeInTheDocument()
  })

  it('answers a typed question from the saved list', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(await field(), 'how do i reset my password{Enter}')
    expect(await screen.findByText(/choose Forgot password/)).toBeInTheDocument()
  })

  it('shows what was typed as plain text, never as markup', async () => {
    const user = userEvent.setup()
    const { container } = setup()
    await user.type(await field(), '<script>alert(1)</script>{Enter}')
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
  })

  it('says it has no answer instead of guessing, and offers a person or a rephrase', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(await field(), 'zebra giraffe{Enter}')
    expect(await screen.findByText("I don't have an answer for that yet.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Talk to a person' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Rephrase' }))
    expect(await field()).toHaveFocus()
  })

  it('never answers from a draft', async () => {
    const user = userEvent.setup()
    service.setHelpAnswers(original.map((a) => (a.question === 'How do I reset my password?' ? { ...a, published: false } : a)))
    setup()
    await user.type(await field(), 'how do i reset my password{Enter}')
    expect(await screen.findByText("I don't have an answer for that yet.")).toBeInTheDocument()
    expect(screen.queryByText(/choose Forgot password/)).toBeNull()
  })
})

describe('Talk to a person', () => {
  it('sends a guest to sign in first, then back to the messages', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(await field(), 'zebra{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Talk to a person' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Fmessages')
  })

  it('opens the signed-in customer’s own chat', async () => {
    const user = userEvent.setup()
    setSession({ name: 'Lia Cruz', email: 'lia@example.com', role: 'customer' })
    setup()
    await user.type(await field(), 'zebra{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Talk to a person' }))
    expect(getDock().boxes.find((box) => box.id === 'mine')?.mode).toBe('open')
  })

  it('is not offered to staff', async () => {
    const user = userEvent.setup()
    setSession({ name: 'Dev Admin', email: 'admin@silhoufit.dev', role: 'admin' })
    setup()
    await user.type(await field(), 'zebra{Enter}')
    expect(await screen.findByRole('button', { name: 'Rephrase' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Talk to a person' })).toBeNull()
  })
})

describe('HelpBot states', () => {
  it('shows a skeleton while the answers load', () => {
    vi.mocked(service.listPublicAnswers).mockReturnValueOnce(new Promise(() => {}))
    setup()
    expect(screen.getByRole('status', { name: 'Loading conversation' })).toBeInTheDocument()
  })

  it('explains a failed load, retries, and still offers a person', async () => {
    const user = userEvent.setup()
    vi.mocked(service.listPublicAnswers).mockRejectedValueOnce(network())
    setup()
    expect(await screen.findByText(/couldn.t load the help answers/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Talk to a person' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/I'm KRAL Help/)).toBeInTheDocument()
  })

  it('says so when nothing is published, and offers a person', async () => {
    service.setHelpAnswers(original.map((a) => ({ ...a, published: false })))
    setup()
    expect(await screen.findByText('No saved answers yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Talk to a person' })).toBeInTheDocument()
  })
})

describe('the transcript', () => {
  it('is cleared on sign-out', async () => {
    const user = userEvent.setup()
    openChat('help', { name: 'KRAL Help' })
    setup()
    await user.click(await screen.findByRole('button', { name: 'How accurate is the sizing?' }))
    expect(getHelpSession().messages).toHaveLength(2)
    reset()
    expect(getHelpSession().messages).toHaveLength(0)
  })

  it('closing the help box drops the transcript', async () => {
    const user = userEvent.setup()
    openChat('help', { name: 'KRAL Help' })
    setup()
    await user.click(await screen.findByRole('button', { name: 'How accurate is the sizing?' }))
    close('help')
    expect(getHelpSession().messages).toHaveLength(0)
  })

  it('shows typing until the reply arrives, and drops a reply that closing cancelled', () => {
    vi.useFakeTimers()
    replyAfter(500, { text: 'Hello' })
    expect(getHelpSession().typing).toBe(true)
    vi.advanceTimersByTime(500)
    expect(getHelpSession()).toMatchObject({ typing: false, messages: [{ text: 'Hello' }] })
    replyAfter(500, { text: 'Late' })
    close('help')
    vi.advanceTimersByTime(500)
    expect(getHelpSession().messages).toHaveLength(0)
    vi.useRealTimers()
  })
})
