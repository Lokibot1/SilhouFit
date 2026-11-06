import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { SampleDataBadge } from '../../src/components/ui/SampleDataBadge'
import { ActivityLogsPage } from '../../src/views/admin/ActivityLogsPage'
import { ArInsightsPage } from '../../src/views/admin/ArInsightsPage'
import { PromotionsPage } from '../../src/views/admin/PromotionsPage'
import { RefundsPage } from '../../src/views/admin/RefundsPage'
import { StaffOnlineOrdersPage } from '../../src/views/staff/StaffOnlineOrdersPage'
import { renderAdmin, setUpAdminDom } from '../shared/adminSession'

vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))

beforeAll(setUpAdminDom)

describe('SampleDataBadge', () => {
  it('says "Sample data" in words and can be reached with the keyboard', async () => {
    renderAdmin(<SampleDataBadge reason="These figures are placeholders." />)
    const badge = screen.getByText('Sample data')
    await userEvent.setup().tab()
    expect(badge).toHaveFocus()
  })
})

// Pages that read placeholder data until their backend exists; each shows the badge in its header, next to the title.
describe.each([
  ['/admin/activity-logs', 'Activity logs', ActivityLogsPage],
  ['/admin/ar-insights', 'AR Fitting Insights', ArInsightsPage],
  ['/admin/refunds', 'Returns & Refunds', RefundsPage],
  ['/admin/promotions', 'Pricing & Promotions', PromotionsPage],
  ['/staff/online-orders', 'Online orders', StaffOnlineOrdersPage],
] as const)('%s', (path, title, Page) => {
  it(`badges ${title} as sample data, once`, () => {
    renderAdmin(<Page />, path)
    const heading = screen.getByRole('heading', { level: 1, name: title })
    expect(screen.getAllByText('Sample data')).toHaveLength(1)
    expect(heading.closest('header')).toContainElement(screen.getByText('Sample data'))
  })
})
