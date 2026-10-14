import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { SearchSelect } from '../../src/components/form/SearchSelect'
import { Modal } from '../../src/components/ui/Modal'

const OPTIONS = [
  { value: '1', label: 'Barangay 1' },
  { value: '2', label: 'Barangay 2' },
  { value: '10', label: 'Barangay 10' },
  { value: 'a', label: 'Alangilan' },
  { value: 'p', label: 'Pallocan Kanluran' },
]

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})

function Harness({ inModal = false, error }: { inModal?: boolean; error?: string }) {
  const [value, setValue] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const select = (
    <SearchSelect id="brgy" label="Barangay" noun="barangays" options={OPTIONS} value={value} onChange={setValue} error={error} />
  )
  return inModal ? (
    <Modal open={open} onClose={() => setOpen(false)} title="Dialog">
      {select}
      <button type="button">After</button>
    </Modal>
  ) : (
    select
  )
}

const trigger = () => screen.getByRole('button', { name: /Barangay/ })

describe('SearchSelect', () => {
  it('shows the placeholder, opens a searchable listbox and picks with the keyboard', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(trigger()).toHaveTextContent('Select')
    trigger().focus()
    await user.keyboard('{ArrowDown}')
    const search = await screen.findByRole('combobox', { name: 'Search barangays' })
    expect(search).toHaveFocus()
    expect(screen.getAllByRole('option')).toHaveLength(5)

    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger()).toHaveTextContent('Barangay 2')
    expect(trigger()).toHaveFocus()
  })

  it('filters as you type, ignoring accents and the word Barangay', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(trigger())
    await user.type(screen.getByRole('combobox', { name: 'Search barangays' }), 'brgy 1')
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Barangay 1', 'Barangay 10'])
  })

  it('says what to do when nothing matches', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(trigger())
    await user.type(screen.getByRole('combobox', { name: 'Search barangays' }), 'zzzz')
    expect(await screen.findByText('No barangays match "zzzz". Check the spelling or clear the search.')).toBeInTheDocument()
  })

  it('shows its inline error', () => {
    render(<Harness error="Choose your barangay." />)
    expect(trigger()).toHaveAccessibleDescription('Choose your barangay.')
  })

  describe('inside a dialog', () => {
    it('closes the list on Escape and leaves the dialog open', async () => {
      const user = userEvent.setup()
      render(<Harness inModal />)
      await user.click(trigger())
      await screen.findByRole('listbox')
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Dialog' })).toBeInTheDocument()
      expect(trigger()).toHaveFocus()

      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('closes the list on Tab without the dialog trap pulling focus elsewhere', async () => {
      const user = userEvent.setup()
      render(<Harness inModal />)
      await user.click(trigger())
      await screen.findByRole('listbox')
      await user.keyboard('{Tab}')
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(trigger()).toHaveFocus()
    })

    it('draws its list above the dialog', async () => {
      const user = userEvent.setup()
      render(<Harness inModal />)
      await user.click(trigger())
      const panel = (await screen.findByRole('listbox')).parentElement!
      expect(panel.style.zIndex).toBe('90')
    })
  })
})
