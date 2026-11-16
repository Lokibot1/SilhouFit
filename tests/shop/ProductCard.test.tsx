import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ProductCard } from '../../src/components/shop/ProductCard'
import { BLAZER as blazer, SOLD_OUT as soldOut } from '../fixtures/shopProducts'

function setup(product = blazer, list = false) {
  const handlers = { onToggleSaved: vi.fn(), onAddToCart: vi.fn(), onBuy: vi.fn() }
  render(
    <MemoryRouter>
      <ProductCard product={product} index={0} list={list} saved={false} {...handlers} />
    </MemoryRouter>,
  )
  return handlers
}

describe('ProductCard cart buttons', () => {
  it('names both buttons after the piece and passes it on when pressed', async () => {
    const user = userEvent.setup()
    const { onAddToCart, onBuy } = setup()
    const add = screen.getByRole('button', { name: 'Add Fence-Line Blazer to cart' })
    const buy = screen.getByRole('button', { name: 'Buy Fence-Line Blazer' })
    expect(add).toHaveTextContent('Add to cart')
    expect(buy).toHaveTextContent('Buy')

    await user.click(add)
    expect(onAddToCart).toHaveBeenCalledWith(blazer)
    await user.click(buy)
    expect(onBuy).toHaveBeenCalledWith(blazer)
  })

  it('uses compact targets: 36px with a mouse, 44px on touch', () => {
    setup()
    for (const name of [/^Add .* to cart$/, /^Buy /]) {
      expect(screen.getByRole('button', { name })).toHaveClass('min-h-9', 'pointer-coarse:min-h-11')
    }
  })

  it('shows the buttons in the list layout too', () => {
    setup(blazer, true)
    expect(screen.getByRole('button', { name: 'Buy Fence-Line Blazer' })).toBeInTheDocument()
  })

  it('disables both buttons for a sold-out piece, with a reason, and does nothing on click', async () => {
    const user = userEvent.setup()
    const { onAddToCart, onBuy } = setup(soldOut)
    const add = screen.getByRole('button', { name: 'Add Field Denim Jacket to cart, sold out' })
    const buy = screen.getByRole('button', { name: 'Buy Field Denim Jacket, sold out' })
    for (const button of [add, buy]) {
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveAttribute('title', 'Sold out')
    }
    expect(screen.getAllByText('Sold out').length).toBeGreaterThan(0)

    await user.click(add)
    await user.click(buy)
    expect(onAddToCart).not.toHaveBeenCalled()
    expect(onBuy).not.toHaveBeenCalled()
  })

  it('puts the low-stock warning in the availability line, not on the photo', () => {
    setup()
    const warning = screen.getByText('Only 4 left')
    expect(warning).toHaveClass('text-danger')
    expect(warning.closest('p')).toHaveTextContent('Only 4 left')
    expect(screen.getByRole('img', { name: blazer.alt }).parentElement).not.toContainElement(warning)
  })
})

describe('ProductCard colours from the list', () => {
  it('names each colour once, as the list sends them', () => {
    setup({ ...blazer, colors: [{ name: 'Navy', hex: '#1b2a49' }, { name: 'Sand', hex: '#d8c3a5' }] })
    expect(screen.getByText('Available in Navy, Sand')).toBeInTheDocument()
  })

  it('shows no colour row when the list sends none', () => {
    setup({ ...blazer, colors: [] })
    expect(screen.queryByText(/^Available in/)).not.toBeInTheDocument()
  })
})

describe('ProductCard rating and sold line', () => {
  const line = (text: string) => screen.getByText(text, { selector: '[aria-hidden="true"]' }).closest('p')!

  it('shows the rating, review count and units sold on one line, with the screen reader wording', () => {
    setup({ ...blazer, rating: 4.5, reviews: 12, sold: 34 })
    expect(line('4.5 (12) · 34 sold')).toHaveClass('tabular-nums')
    expect(screen.getByText('Rated 4.5 out of 5 from 12 reviews, 34 sold')).toHaveClass('sr-only')
  })

  it('shows no line at all with no reviews and nothing sold', () => {
    setup({ ...blazer, rating: 0, reviews: 0, sold: 0 })
    expect(screen.queryByText(/sold|Rated/)).not.toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows only the sold count, with no separator, when there are no reviews', () => {
    setup({ ...blazer, rating: 0, reviews: 0, sold: 34 })
    expect(line('34 sold')).toHaveClass('tabular-nums')
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Rated/)).not.toBeInTheDocument()
  })
})
