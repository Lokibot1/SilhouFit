import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Select } from '../../src/components/ui/Select'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})

const OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
]

function Harness({ onChange = () => {} }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('featured')
  return (
    <>
      <Select
        label="Sort by"
        value={value}
        options={OPTIONS}
        triggerPrefix="Sort: "
        onChange={(next) => {
          setValue(next)
          onChange(next)
        }}
      />
      <button type="button">Elsewhere</button>
    </>
  )
}

const trigger = () => screen.getByRole('combobox', { name: 'Sort by' })
const listbox = () => screen.getByRole('listbox', { name: 'Sort by' })

describe('Select', () => {
  it('is named by its label, shows the value and starts closed', () => {
    render(<Harness />)
    expect(trigger()).toHaveTextContent('Sort: Featured')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveAttribute('aria-haspopup', 'listbox')
    expect(screen.getByLabelText('Sort by')).toBe(trigger())
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens on click, wires aria and marks the selected option', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(trigger()).toHaveAttribute('aria-controls', listbox().id)
    const options = within(listbox()).getAllByRole('option')
    expect(options).toHaveLength(4)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(trigger()).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(trigger()).toHaveFocus() // focus never leaves the trigger
  })

  it.each(['{Enter}', ' ', '{ArrowDown}', '{ArrowUp}'])('opens with %j', async (key) => {
    const user = userEvent.setup()
    render(<Harness />)
    trigger().focus()
    await user.keyboard(key)
    expect(listbox()).toBeInTheDocument()
  })

  it('moves with the arrows, Home and End and selects with Enter', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)
    trigger().focus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(trigger()).toHaveAttribute('aria-activedescendant', within(listbox()).getAllByRole('option')[1].id)
    await user.keyboard('{End}')
    expect(trigger()).toHaveAttribute('aria-activedescendant', within(listbox()).getAllByRole('option')[3].id)
    await user.keyboard('{Home}{ArrowDown}')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(onChange).toHaveBeenCalledWith('newest')
    expect(trigger()).toHaveTextContent('Sort: Newest')
    expect(trigger()).toHaveFocus()
  })

  it('selects with Space too', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    trigger().focus()
    await user.keyboard('{ArrowDown}{ArrowDown} ')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(trigger()).toHaveTextContent('Sort: Newest')
  })

  it('jumps by typing, with a repeated letter cycling', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    trigger().focus()
    await user.keyboard('{ArrowDown}')
    await user.keyboard('n')
    expect(trigger()).toHaveAttribute('aria-activedescendant', within(listbox()).getAllByRole('option')[1].id)
    await new Promise((resolve) => setTimeout(resolve, 600)) // the buffer clears after 500ms
    await user.keyboard('p')
    expect(trigger()).toHaveAttribute('aria-activedescendant', within(listbox()).getAllByRole('option')[2].id)
    await new Promise((resolve) => setTimeout(resolve, 600))
    await user.keyboard('p') // the same letter again moves to the next match
    expect(trigger()).toHaveAttribute('aria-activedescendant', within(listbox()).getAllByRole('option')[3].id)
  })

  it('closes on Escape without changing the value and keeps focus', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)
    trigger().focus()
    await user.keyboard('{ArrowDown}{ArrowDown}{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger()).toHaveTextContent('Sort: Featured')
    expect(trigger()).toHaveFocus()
  })

  it('closes on Tab and on a click outside', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(trigger())
    await user.tab()
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())

    await user.click(trigger())
    await user.click(document.body)
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('selects an option by clicking it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(trigger())
    await user.click(screen.getByRole('option', { name: 'Price: high to low' }))
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(trigger()).toHaveTextContent('Sort: Price: high to low')
  })

  it('shows a pick at once even when the parent hands the new value back late', async () => {
    function Slow() {
      const [value, setValue] = useState('featured')
      return (
        <Select
          label="Sort by"
          value={value}
          options={OPTIONS}
          triggerPrefix="Sort: "
          onChange={(next) => setTimeout(() => setValue(next), 400)}
        />
      )
    }
    const user = userEvent.setup()
    render(<Slow />)
    await user.click(trigger())
    await user.click(screen.getByRole('option', { name: 'Newest' }))
    expect(trigger()).toHaveTextContent('Sort: Newest') // not "Featured" while the parent catches up
    await waitFor(() => expect(trigger()).toHaveTextContent('Sort: Newest'))
  })

  it('never truncates an option: rows keep their full label on one line', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(trigger())
    const row = screen.getByRole('option', { name: 'Price: high to low' })
    expect(row.querySelector('.truncate')).toBeNull()
    expect(row.querySelector('.whitespace-nowrap')).not.toBeNull()
  })
})
