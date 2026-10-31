import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PhotoImg } from '../../src/components/ui/PhotoImg'

const CLASS = 'size-10 rounded-xl'

describe('PhotoImg', () => {
  it('shows the photo with its alt text', () => {
    render(<PhotoImg src="https://img.test/a.webp" alt="Hoodie front view" className={CLASS} />)
    expect(screen.getByRole('img', { name: 'Hoodie front view' })).toHaveAttribute('src', 'https://img.test/a.webp')
  })

  it.each([['null', null], ['empty', '']])('shows a named tile of the same size for a %s url', (_label, src) => {
    render(<PhotoImg src={src} alt="Hoodie" className={CLASS} />)
    const tile = screen.getByRole('img', { name: 'Hoodie (photo unavailable)' })
    expect(tile.tagName).toBe('DIV')
    expect(tile).toHaveClass('size-10', 'rounded-xl')
  })

  it('swaps in the tile when the file fails to load (404), and tries again for a new url', () => {
    const { rerender } = render(<PhotoImg src="https://img.test/missing.webp" alt="Hoodie" className={CLASS} />)
    fireEvent.error(screen.getByRole('img', { name: 'Hoodie' }))
    expect(screen.getByRole('img', { name: 'Hoodie (photo unavailable)' })).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    rerender(<PhotoImg src="https://img.test/uploaded.webp" alt="Hoodie" className={CLASS} />)
    expect(screen.getByRole('img', { name: 'Hoodie' })).toHaveAttribute('src', 'https://img.test/uploaded.webp')
  })
})
