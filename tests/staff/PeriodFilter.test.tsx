import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PeriodSegments, YearSelect } from '../../src/components/staff/PeriodFilter'
import { yearOptions, type PeriodFilterValue } from '../../src/utils/period'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

function Harness({ onChange }: { onChange?: (value: PeriodFilterValue) => void }) {
  const [value, setValue] = useState<PeriodFilterValue>({ period: 'month', year: yearOptions()[0] })
  const change = (next: PeriodFilterValue) => {
    setValue(next)
    onChange?.(next)
  }
  return (
    <>
      <PeriodSegments name="Sales" value={value} onChange={change} />
      <YearSelect name="Sales" value={value} onChange={change} />
    </>
  )
}

describe('PeriodSegments', () => {
  it('is a named radio group with the chosen period checked and one tab stop', () => {
    render(<Harness />)
    const group = screen.getByRole('radiogroup', { name: 'Sales period' })
    const radios = screen.getAllByRole('radio')
    expect(group).toBeInTheDocument()
    expect(radios.map((r) => r.textContent)).toEqual(['Day', 'Week', 'Month', 'Quarter', 'Year'])
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false', 'false'])
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([screen.getByRole('radio', { name: 'Month' })])
  })

  it('selects on click', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Week' }))
    expect(screen.getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'true')
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ period: 'week' }))
  })

  it('moves focus and selection with the arrow, Home and End keys, wrapping at the ends', async () => {
    render(<Harness />)
    const radio = (name: string) => screen.getByRole('radio', { name })
    radio('Month').focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(radio('Quarter')).toHaveFocus()
    expect(radio('Quarter')).toHaveAttribute('aria-checked', 'true')
    await userEvent.keyboard('{ArrowDown}{ArrowRight}')
    expect(radio('Day')).toHaveFocus()
    expect(radio('Day')).toHaveAttribute('aria-checked', 'true')
    await userEvent.keyboard('{ArrowLeft}')
    expect(radio('Year')).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(radio('Quarter')).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(radio('Day')).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(radio('Year')).toHaveFocus()
    expect(radio('Year')).toHaveAttribute('aria-checked', 'true')
    expect(radio('Day')).toHaveAttribute('aria-checked', 'false')
  })
})

describe('YearSelect', () => {
  it('is labelled, opens and changes the year', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const [current, previous] = yearOptions()
    const select = screen.getByRole('combobox', { name: 'Sales year' })
    expect(select).toHaveTextContent(String(current))
    await userEvent.click(select)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toHaveLength(3)
    await userEvent.click(screen.getByRole('option', { name: String(previous) }))
    expect(onChange).toHaveBeenLastCalledWith({ period: 'month', year: previous })
    expect(select).toHaveTextContent(String(previous))
  })
})
