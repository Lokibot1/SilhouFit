import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MotionGlobalConfig } from 'motion/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { DateRangeField } from '../../src/components/ui/DateRangeField'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

function Harness({ start = '2026-10-10', end = '2026-10-20', onEscape = vi.fn() }) {
  const [range, setRange] = useState({ start, end })
  return (
    <div onKeyDown={(event) => event.key === 'Escape' && onEscape()}>
      <DateRangeField id="dates" label="Sale dates" start={range.start} end={range.end} onChange={(s, e) => setRange({ start: s, end: e })} />
    </div>
  )
}

const trigger = () => screen.getByRole('button', { name: /^Sale dates/ })
const day = (label: string) => screen.getByRole('button', { name: label })

describe('DateRangeField', () => {
  it('shows the range in one field and the empty prompt when nothing is chosen', () => {
    const { unmount } = render(<Harness />)
    expect(trigger()).toHaveTextContent('Oct 10, 2026 – Oct 20, 2026')
    unmount()
    render(<Harness start="" end="" />)
    expect(trigger()).toHaveTextContent('Select dates')
  })

  it('opens on the month of the start date and marks both ends', async () => {
    render(<Harness />)
    await userEvent.click(trigger())
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(day('October 10, 2026')).toHaveAttribute('aria-pressed', 'true')
    expect(day('October 20, 2026')).toHaveAttribute('aria-pressed', 'true')
    expect(day('October 15, 2026')).toHaveAttribute('aria-pressed', 'false')
  })

  it('the first click starts a new range, the second ends it and closes the calendar', async () => {
    render(<Harness />)
    await userEvent.click(trigger())
    await userEvent.click(day('October 22, 2026'))
    expect(trigger()).toHaveTextContent('Oct 22, 2026 – Select end date')
    await userEvent.click(day('October 29, 2026'))
    expect(trigger()).toHaveTextContent('Oct 22, 2026 – Oct 29, 2026')
    expect(screen.queryByRole('group')).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it('a day before the first day starts over, and the same day is a one-day sale', async () => {
    render(<Harness start="2026-10-10" end="" />)
    await userEvent.click(trigger())
    await userEvent.click(day('October 5, 2026'))
    expect(trigger()).toHaveTextContent('Oct 5, 2026 – Select end date')
    await userEvent.click(day('October 5, 2026'))
    expect(trigger()).toHaveTextContent('Oct 5, 2026 – Oct 5, 2026')
  })

  it('moves between months with the arrows and the keyboard', async () => {
    render(<Harness />)
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('November 2026')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('September 2026')).toBeInTheDocument()
  })

  it('arrow keys move the focused day, across a month end', async () => {
    render(<Harness start="2026-10-31" end="" />)
    await userEvent.click(trigger())
    expect(day('October 31, 2026')).toHaveFocus()
    fireEvent.keyDown(day('October 31, 2026'), { key: 'ArrowRight' })
    expect(await screen.findByText('November 2026')).toBeInTheDocument()
    expect(day('November 1, 2026')).toHaveFocus()
    fireEvent.keyDown(day('November 1, 2026'), { key: 'PageDown' })
    expect(await screen.findByText('December 2026')).toBeInTheDocument()
  })

  it('Escape closes only the calendar and does not reach the drawer around it', async () => {
    const onEscape = vi.fn()
    render(<Harness onEscape={onEscape} />)
    await userEvent.click(trigger())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group')).toBeNull()
    expect(onEscape).not.toHaveBeenCalled()
    expect(trigger()).toHaveFocus()
  })

  it('floats outside the form and shows one month, the arrows reach the next', async () => {
    const { container } = render(<Harness />)
    await userEvent.click(trigger())
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(screen.queryByText('November 2026')).toBeNull()
    expect(container.querySelector('[role=group]')).toBeNull() // not part of the form's own layout
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('November 2026')).toBeInTheDocument()
    await userEvent.click(day('November 3, 2026'))
    expect(trigger()).toHaveTextContent('Nov 3, 2026 – Select end date')
  })

  it('a press outside closes it', async () => {
    render(<Harness />)
    await userEvent.click(trigger())
    await userEvent.click(document.body)
    expect(screen.queryByRole('group')).toBeNull()
  })
})
