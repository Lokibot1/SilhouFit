import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { FloatingField } from '../../src/components/form/FloatingField'

function Harness({ type, label }: { type: 'text' | 'email' | 'password'; label: string }) {
  const [value, setValue] = useState('')
  return <FloatingField id="f" label={label} type={type} value={value} onChange={setValue} autoComplete="off" />
}

describe('FloatingField password type', () => {
  const input = () => screen.getByLabelText(/^password$/i)

  it('renders a masked input by default', () => {
    render(<Harness type="password" label="Password" />)
    expect(input()).toHaveAttribute('type', 'password')
  })

  it('offers a non-submitting toggle button that is not pressed by default', () => {
    render(<Harness type="password" label="Password" />)
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle).toHaveAttribute('type', 'button')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  it('reveals and re-masks the value, flipping label and aria-pressed, keeping the typed text', async () => {
    const user = userEvent.setup()
    render(<Harness type="password" label="Password" />)
    await user.type(input(), 'Secret1!')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input()).toHaveAttribute('type', 'text')
    expect(input()).toHaveValue('Secret1!')
    const hide = screen.getByRole('button', { name: 'Hide password' })
    expect(hide).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Show password' })).not.toBeInTheDocument()

    await user.click(hide)
    expect(input()).toHaveAttribute('type', 'password')
    expect(input()).toHaveValue('Secret1!')
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('turns off auto-capitalise and autocorrect while hidden and revealed', async () => {
    const user = userEvent.setup()
    render(<Harness type="password" label="Password" />)
    expect(input()).toHaveAttribute('autocapitalize', 'off')
    expect(input()).toHaveAttribute('autocorrect', 'off')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input()).toHaveAttribute('type', 'text')
    expect(input()).toHaveAttribute('autocapitalize', 'off')
    expect(input()).toHaveAttribute('autocorrect', 'off')
  })

  it('shows the toggle even while the field is empty', () => {
    render(<Harness type="password" label="Password" />)
    expect(input()).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
  })

  it('replaces the clear button instead of adding to it', async () => {
    const user = userEvent.setup()
    render(<Harness type="password" label="Password" />)
    await user.type(input(), 'abc')
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})

describe('FloatingField text fields (regression)', () => {
  it('keeps the clear button and has no show/hide toggle', async () => {
    const user = userEvent.setup()
    render(<Harness type="text" label="Last name" />)
    const field = screen.getByLabelText(/^last name$/i)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    await user.type(field, 'Lee')
    expect(screen.queryByRole('button', { name: /password/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear last name' }))
    expect(field).toHaveValue('')
    expect(field).toHaveFocus()
  })

  it('keeps an email field typed as email', () => {
    render(<Harness type="email" label="Email" />)
    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute('type', 'email')
  })
})
