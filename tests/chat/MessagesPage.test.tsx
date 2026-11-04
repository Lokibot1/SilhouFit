import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchMyConversation } from '../../src/service/chatApi'
import { clearSession, setSession } from '../../src/service/session'
import { MessagesPage } from '../../src/views/private/MessagesPage'

vi.mock('../../src/service/chatApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/chatApi')>()),
  fetchMyConversation: vi.fn().mockReturnValue(new Promise(() => {})),
}))
vi.mock('../../src/components/chat/ChatThread', () => ({ ChatThread: () => <p>thread</p> }))

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/messages']}>
      <Routes>
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  )

afterEach(() => {
  clearSession()
  vi.clearAllMocks()
})

describe('MessagesPage', () => {
  it('sends a guest to sign in without asking the server for a conversation', () => {
    renderPage()
    expect(screen.getByText('login page')).toBeInTheDocument()
    expect(fetchMyConversation).not.toHaveBeenCalled()
  })

  it('opens the customer conversation for a signed-in user', () => {
    setSession({ name: 'Lia', email: 'lia@example.com', role: 'customer' })
    renderPage()
    expect(fetchMyConversation).toHaveBeenCalledTimes(1)
  })
})
