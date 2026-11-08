import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RangeCalendar } from '../../src/components/ui/RangeCalendar'

const day = (label: string) => screen.getByRole('button', { name: label })

describe('RangeCalendar', () => {
  it('starts a range on the first click and ends it on the second, then asks to close', async () => {
    const onChange = vi.fn()
    const onClose = vi.fn()
    const { rerender } = render(<RangeCalendar start="2026-10-10" end="2026-10-20" onChange={onChange} onClose={onClose} />)
    await userEvent.click(day('October 22, 2026'))
    expect(onChange).toHaveBeenLastCalledWith('2026-10-22', '')
    expect(onClose).not.toHaveBeenCalled()
    rerender(<RangeCalendar start="2026-10-22" end="" onChange={onChange} onClose={onClose} />)
    await userEvent.click(day('October 29, 2026'))
    expect(onChange).toHaveBeenLastCalledWith('2026-10-22', '2026-10-29')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('with a latest day, later days and months after it cannot be chosen', () => {
    render(<RangeCalendar start="" end="" max="2026-10-15" onChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(day('October 15, 2026')).toBeEnabled()
    expect(day('October 16, 2026')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    fireEvent.keyDown(day('October 15, 2026'), { key: 'ArrowRight' })
    expect(day('October 15, 2026')).toHaveAttribute('tabindex', '0')
  })

  it('puts keyboard focus on the highlighted day when asked to', () => {
    render(<RangeCalendar autoFocus start="2026-10-12" end="" onChange={vi.fn()} onClose={vi.fn()} />)
    expect(day('October 12, 2026')).toHaveFocus()
  })
  it('in single mode a pick sets one date and closes; Clear empties it; the year select jumps and never passes the latest day', async () => {
    const onChange = vi.fn()
    const onClose = vi.fn()
    render(<RangeCalendar single start="2000-05-15" end="" max="2026-10-15" onChange={onChange} onClose={onClose} />)
    await userEvent.click(day('May 20, 2000'))
    expect(onChange).toHaveBeenLastCalledWith('2000-05-20', '')
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Year' }), '2026')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Month' }), '10')
    expect(day('October 15, 2026')).toBeEnabled()
    expect(day('October 16, 2026')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenLastCalledWith('', '')
  })
})
