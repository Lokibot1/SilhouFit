import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ContactPage } from '../../src/views/public/ContactPage'

describe('ContactPage', () => {
  it('says contact is coming soon, with the team email and a way home', () => {
    render(
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Contact us' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'team@silhoufit.dev' })).toHaveAttribute('href', 'mailto:team@silhoufit.dev')
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
  })
})
