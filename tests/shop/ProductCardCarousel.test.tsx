import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProductCard } from '../../src/components/shop/ProductCard'
import { PRODUCTS, productImages, type Product } from '../../src/data/products'

const base: Product = { ...PRODUCTS.find((p) => p.id === 'p02')!, images: undefined }
const three: Product = { ...base, images: ['/images/gallery/a.webp', '/images/gallery/b.webp'] }

function setup(product: Product) {
  const handlers = { onToggleSaved: vi.fn(), onAddToCart: vi.fn(), onBuy: vi.fn() }
  const { container } = render(<ProductCard product={product} index={0} saved={false} {...handlers} />)
  return { container, ...handlers }
}

describe('ProductCard image carousel', () => {
  it('lists the main image first, then the extras', () => {
    expect(productImages(three)).toEqual([base.image, ...three.images!])
    expect(productImages(base)).toEqual([base.image])
  })

  it('shows no chevrons or dots for a single image', () => {
    const { container } = setup(base)
    expect(screen.queryByRole('button', { name: 'Previous image' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next image' })).not.toBeInTheDocument()
    expect(container.querySelectorAll('ol li')).toHaveLength(0)
  })

  it('draws one dot and one lazy-loaded image per extra photo', () => {
    const { container } = setup(three)
    expect(container.querySelectorAll('ol li')).toHaveLength(3)
    const imgs = container.querySelectorAll('img')
    expect(imgs).toHaveLength(3)
    expect(imgs[1]).toHaveAttribute('loading', 'lazy')
    expect(imgs[2]).toHaveAttribute('loading', 'lazy')
  })

  it('advances and wraps around without touching the card actions', async () => {
    const user = userEvent.setup()
    const { container, onToggleSaved, onAddToCart, onBuy } = setup(three)
    const track = container.querySelector('img')!.parentElement!
    const next = screen.getByRole('button', { name: 'Next image' })
    const prev = screen.getByRole('button', { name: 'Previous image' })

    expect(track.style.transform).toBe('translateX(-0%)')
    await user.click(next)
    expect(track.style.transform).toBe('translateX(-100%)')
    await user.click(next)
    await user.click(next)
    expect(track.style.transform).toBe('translateX(-0%)')
    await user.click(prev)
    expect(track.style.transform).toBe('translateX(-200%)')
    expect(screen.getByText('Image 3 of 3')).toBeInTheDocument()
    expect(onToggleSaved).not.toHaveBeenCalled()
    expect(onAddToCart).not.toHaveBeenCalled()
    expect(onBuy).not.toHaveBeenCalled()
  })
})
