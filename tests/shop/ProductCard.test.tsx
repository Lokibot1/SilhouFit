import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ProductCard } from '../../src/components/shop/ProductCard'
import { PRODUCTS } from '../../src/data/products'

const blazer = PRODUCTS.find((p) => p.id === 'p02')!
const soldOut = PRODUCTS.find((p) => p.id === 'p24')!

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
    expect(warning.closest('p')).toHaveTextContent('Only 4 left · In store only')
    expect(screen.getByRole('img', { name: blazer.alt }).parentElement).not.toContainElement(warning)
  })
})
