import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomerDetailsSheet } from '../../src/components/admin/users/CustomerDetailsSheet'
import { getModerationStatus } from '../../src/service/moderation'
import type { CustomerAccount } from '../../src/types/accounts'
import { renderAdmin, resetAdminAccounts, setUpAdminDom } from '../shared/adminSession'

vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))

const customer = (id: string, firstName: string): CustomerAccount => ({ id, role: 'customer', firstName, lastName: 'Test', email: `${firstName}@example.com`, phone: '', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', lastSignInAt: null })

beforeAll(setUpAdminDom)
beforeEach(resetAdminAccounts)

describe('CustomerDetailsSheet', () => {
  it('shows the offenses with 12-hour times and the current status', () => {
    renderAdmin(<CustomerDetailsSheet account={customer('cus-005', 'Bea')} onClose={() => {}} />)
    expect(screen.getByText('Messaging blocked', { selector: 'span' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: /Offenses/ })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(list.textContent).toMatch(/\b(AM|PM)\b/)
  })

  it('asks first, then bans with the verb button and shows the action in the history', async () => {
    const user = userEvent.setup()
    renderAdmin(<CustomerDetailsSheet account={customer('cus-010', 'Carlo')} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Ban account' }))
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Reason/), 'Harassment')
    await user.click(screen.getByRole('button', { name: 'Ban Account' }))
    await waitFor(() => expect(getModerationStatus('cus-010')).toBe('banned'))
    expect(await screen.findByText(/Banned by/)).toBeInTheDocument()
    expect(screen.getByText('Reason: Harassment')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unban account' })).toBeInTheDocument()
  })
})
