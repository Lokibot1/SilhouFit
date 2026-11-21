import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LinkExpiredPage } from '../../src/views/public/LinkExpiredPage'

describe('LinkExpiredPage', () => {
  it('shows the 410 label, heading, title, meta description and both actions', () => {
    render(
      <MemoryRouter>
        <LinkExpiredPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'This link has expired' })).toBeInTheDocument()
    expect(screen.getByText(/Link expired/)).toHaveTextContent('(Error 410) // Link expired')
    expect(document.title).toBe('Link expired — SilhouFit')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toMatch(/expired/)
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute('href', '/login')
  })
})
