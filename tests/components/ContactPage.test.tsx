import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { ContactPage } from '../../src/views/public/ContactPage'

function renderPage() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <ContactPage />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('ContactPage', () => {
  it('shows the team email and the contact form', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Contact us' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'team@silhoufit.dev' })[0]).toHaveAttribute('href', 'mailto:team@silhoufit.dev')
    expect(screen.getByRole('form', { name: 'Contact the team' })).toBeInTheDocument()
  })

  it('shows inline errors for each required field and sends nothing', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(screen.getByText('Name is required.')).toBeInTheDocument()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Message is required.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the phone to numbers and a leading plus, 13 characters at most', async () => {
    renderPage()
    const phone = screen.getByLabelText('Phone (optional)')
    await userEvent.type(phone, '+63 (917) 123-4567 89abc')
    expect(phone).toHaveValue('+639171234567')
  })

  it('flags language that is not allowed in the message', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText('Message'), 'this is fucking slow')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(screen.getByText(/isn't allowed/)).toBeInTheDocument()
  })
})
