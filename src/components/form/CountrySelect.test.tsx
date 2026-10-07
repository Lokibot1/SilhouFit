import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { COUNTRIES } from '../../data/countries'
import { CountrySelect } from './CountrySelect'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
})

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

function Harness({ onPick = () => {} }: { onPick?: (code: string) => void }) {
  const [code, setCode] = useState('PH')
  return (
    <>
      <CountrySelect
        id="country"
        value={code}
        onChange={(next) => {
          setCode(next)
          onPick(next)
        }}
      />
      <button type="button">Outside</button>
    </>
  )
}

const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
const trigger = () => screen.getByRole('button', { name: /country calling code/i })
const search = () => screen.getByRole('combobox', { name: 'Search countries' })
const settle = () => act(() => void vi.advanceTimersByTime(200))

describe('CountrySelect', () => {
  it('shows the ISO code and dial code of the selected country, with no flag', () => {
    render(<Harness />)
    expect(trigger()).toHaveTextContent('PH+63')
    expect(trigger()).toHaveAccessibleName('Country calling code: Philippines +63')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens a labelled listbox with the selected option marked and the search focused', async () => {
    const user = setup()
    render(<Harness />)
    await user.click(trigger())

    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(search()).toHaveFocus()
    const list = screen.getByRole('listbox', { name: 'Countries' })
    expect(trigger()).toHaveAttribute('aria-controls', list.id)
    expect(search()).toHaveAttribute('aria-controls', list.id)
    expect(within(list).getAllByRole('option')).toHaveLength(COUNTRIES.length)
    const selected = screen.getByRole('option', { name: /Philippines/ })
    expect(selected).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /Japan/ })).toHaveAttribute('aria-selected', 'false')
    expect(search()).toHaveAttribute('aria-activedescendant', selected.id)
  })

  it('filters after the debounce, not before', async () => {
    const user = setup()
    render(<Harness />)
    await user.click(trigger())
    await user.type(search(), 'jap')

    expect(screen.getAllByRole('option').length).toBeGreaterThan(100)
    await settle()
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Japan'),
    ])
  })

  it('finds countries by dial code and ranks an exact ISO code first', async () => {
    const user = setup()
    render(<Harness />)
    await user.click(trigger())
    await user.type(search(), '+44')
    await settle()
    expect(screen.getByRole('option', { name: /United Kingdom/ })).toBeInTheDocument()

    await user.clear(search())
    await user.type(search(), 'us')
    await settle()
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('United States')
  })

  it('selects by click, closes and returns focus to the button', async () => {
    const user = setup()
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    await user.click(trigger())
    await user.click(screen.getByRole('option', { name: /Japan/ }))

    expect(onPick).toHaveBeenCalledWith('JP')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger()).toHaveTextContent('JP+81')
    expect(trigger()).toHaveFocus()
  })

  it('moves with arrow keys, Home and End, and selects with Enter', async () => {
    const user = setup()
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    await user.click(trigger())

    await user.keyboard('{Home}')
    expect(search()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id)
    await user.keyboard('{ArrowDown}')
    expect(search()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id)
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(search()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id)
    await user.keyboard('{End}')
    const all = screen.getAllByRole('option')
    expect(search()).toHaveAttribute('aria-activedescendant', all[all.length - 1].id)

    await user.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith(COUNTRIES[COUNTRIES.length - 1].code)
    expect(trigger()).toHaveFocus()
  })

  it('selects the top result after typing with Enter', async () => {
    const user = setup()
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    await user.click(trigger())
    await user.type(search(), 'germ')
    await settle()
    await user.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith('DE')
  })

  it('opens from the keyboard with ArrowDown', async () => {
    const user = setup()
    render(<Harness />)
    trigger().focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(search()).toHaveFocus()
  })

  it('closes on Escape and returns focus to the button without changing the value', async () => {
    const user = setup()
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    await user.click(trigger())
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(onPick).not.toHaveBeenCalled()
  })

  it('closes when clicking outside', async () => {
    const user = setup()
    render(<Harness />)
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows an empty state with a next step when nothing matches', async () => {
    const user = setup()
    render(<Harness />)
    await user.click(trigger())
    await user.type(search(), 'xyz')
    await settle()

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent(
      'No countries match "xyz". Try a different name or code, or clear the search.',
    )
    expect(search()).not.toHaveAttribute('aria-activedescendant')
  })

  it('strips emoji from the search and caps it at 40 characters', async () => {
    const user = setup()
    render(<Harness />)
    await user.click(trigger())
    await user.click(search())
    await user.paste(`ph\u{1F600}${'a'.repeat(60)}`)
    expect(search()).toHaveValue(`ph${'a'.repeat(38)}`)
  })
})
