import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderStatusChip } from '../../src/components/orders/OrderStatusChip'
import { OrderTimeline } from '../../src/components/orders/OrderTimeline'
import { buildTimeline, STATUS_CHIP } from '../../src/utils/orders'
import { ALL_STATUSES, customerOrder } from '../fixtures/orders'

describe('OrderStatusChip', () => {
  it.each(ALL_STATUSES)('says %s in words, with an icon that is hidden from screen readers', (status) => {
    const { container } = render(<OrderStatusChip status={status} />)
    expect(screen.getByText(STATUS_CHIP[status].label)).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('OrderTimeline', () => {
  it('is a labelled list that marks the current step and says each step state in words', () => {
    render(<OrderTimeline steps={buildTimeline(customerOrder({ status: 'PENDING_PAYMENT' }))} />)
    const list = screen.getByRole('list', { name: 'Order progress' })
    const steps = within(list).getAllByRole('listitem')
    expect(steps).toHaveLength(6)
    // Latest first: the not-yet steps, then the current one, then what is done.
    expect(steps[0]).toHaveTextContent('Delivered. Not yet.')
    expect(steps[3]).not.toHaveAttribute('aria-current')
    expect(steps[3]).toHaveTextContent('Not yet')
    expect(steps[4]).toHaveAttribute('aria-current', 'step')
    expect(steps[4]).toHaveTextContent('Current step')
    expect(steps[5]).toHaveTextContent('Placed. Done.')
  })

  it('shows the reason under a cancelled order', () => {
    render(<OrderTimeline steps={buildTimeline(customerOrder({ status: 'CANCELLED', cancelledAt: '2026-10-26T05:00:00.000Z', cancellationReason: 'Wrong size' }))} />)
    expect(screen.getByText('Wrong size')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Cancelled. Cancelled.')
  })
})
