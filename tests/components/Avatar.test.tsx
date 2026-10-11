import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from '../../src/components/ui/Avatar'

describe('Avatar', () => {
  it('shows the first and last initials', () => {
    render(<Avatar name="Ana Maria Reyes" />)
    expect(screen.getByRole('img', { name: 'Ana Maria Reyes' })).toHaveTextContent('AR')
  })

  it('uses one initial for a single name', () => {
    render(<Avatar name="cher" />)
    expect(screen.getByRole('img', { name: 'cher' })).toHaveTextContent('C')
  })

  it('gives the same name the same colour and different names different ones', () => {
    const colour = (name: string) => {
      const { unmount } = render(<Avatar name={name} />)
      const value = screen.getByRole('img', { name }).style.backgroundColor
      unmount()
      return value
    }
    expect(colour('Ana Reyes')).toBe(colour('Ana Reyes'))
    expect(colour('Ana Reyes')).not.toBe(colour('Ben Cruz'))
  })

  it('falls back to initials when the photo fails, and to a generic icon without a name', () => {
    const { unmount } = render(<Avatar name="Ana Reyes" src="/missing.webp" />)
    fireEvent.error(screen.getByRole('img', { name: 'Ana Reyes' }))
    expect(screen.getByRole('img', { name: 'Ana Reyes' })).toHaveTextContent('AR')
    unmount()

    render(<Avatar name="" />)
    expect(screen.getByRole('img', { name: 'Account' }).querySelector('svg')).not.toBeNull()
  })

  it('tries a new photo after an earlier one failed', () => {
    const { rerender } = render(<Avatar name="Ana Reyes" src="/missing.webp" />)
    fireEvent.error(document.querySelector('img')!)
    expect(document.querySelector('img')).toBeNull()
    rerender(<Avatar name="Ana Reyes" src="/new.webp" />)
    expect(document.querySelector('img')).toHaveAttribute('src', '/new.webp')
  })
})
