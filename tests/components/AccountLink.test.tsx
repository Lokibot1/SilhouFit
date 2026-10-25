import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AccountLink } from '../../src/components/AccountLink'
import { getSession, setSession } from '../../src/service/session'

function renderLink(role?: 'customer' | 'staff' | 'admin' | 'superadmin') {
  return render(
    <MemoryRouter>
      <AccountLink user={{ name: 'Ana Reyes', role }} />
    </MemoryRouter>,
  )
}

describe('AccountLink', () => {
  it.each(['staff', 'admin', 'superadmin'] as const)('goes straight to the %s dashboard, with no menu', (role) => {
    renderLink(role)
    expect(screen.getByRole('link', { name: 'Dashboard, Ana Reyes' })).toHaveAttribute('href', `/${role}`)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it.each([['customer' as const], [undefined]])('goes to the profile for a %s', (role) => {
    renderLink(role)
    expect(screen.getByRole('link', { name: 'Profile, Ana Reyes' })).toHaveAttribute('href', '/profile')
  })
})

describe('session role', () => {
  it('keeps a known role and drops an unknown one', () => {
    setSession({ name: 'Ana', email: 'ana@example.com', role: 'admin' })
    expect(getSession()?.role).toBe('admin')
    localStorage.setItem('silhoufit-session', JSON.stringify({ name: 'Ana', email: 'ana@example.com', role: 'root' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'silhoufit-session' }))
    expect(getSession()?.role).toBeUndefined()
  })
})
