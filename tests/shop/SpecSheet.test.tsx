import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { SpecSheet } from '../../src/components/shop/SpecSheet'
import { PRODUCTS } from '../../src/data/products'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

const byId = (id: string) => PRODUCTS.find((p) => p.id === id)!
const polo = byId('p01') // Tops, White and Navy, 24 in stock
const blazer = byId('p02') // Outerwear, one colour (Black), sale 4,990 from 6,490, 4 in stock

function Harness({
  product = polo,
  action = 'cart',
  inCart = 0,
  onConfirm = () => {},
  onClose = () => {},
}: {
  product?: typeof polo
  action?: 'cart' | 'buy'
  inCart?: number
  onConfirm?: (choice: { size: string; color: string; qty: number }) => void
  onClose?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <SpecSheet
        open={open}
        onClose={() => {
          setOpen(false)
          onClose()
        }}
        product={product}
        action={action}
        inCart={inCart}
        onConfirm={onConfirm}
      />
    </>
  )
}

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open sheet' }))
  return screen.findByRole('dialog', { name: 'Choose options' })
}

describe('SpecSheet', () => {
  it('shows the piece with its colours and category sizes', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const sheet = await openSheet(user)
    expect(within(sheet).getByRole('heading', { name: 'Heritage Polo' })).toBeInTheDocument()
    expect(within(sheet).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual([
      'White', 'Navy', 'XS', 'S', 'M', 'L', 'XL',
    ])
  })

  it('requires a size, says so inline and puts focus back on the sizes', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness product={blazer} onConfirm={onConfirm} />)
    const sheet = await openSheet(user)
    await user.click(within(sheet).getByRole('button', { name: 'Add to cart' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Choose a size to continue.')
    expect(onConfirm).not.toHaveBeenCalled()
    expect(within(sheet).getByRole('radio', { name: 'XS' })).toHaveFocus()

    await user.click(within(sheet).getByRole('radio', { name: 'M' }))
    expect(within(sheet).queryByRole('alert')).toBeNull()
  })

  it('preselects the only colour, and none when there are several', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness product={blazer} />)
    let sheet = await openSheet(user)
    expect(within(sheet).getByRole('radio', { name: 'Black' })).toBeChecked()
    unmount()

    render(<Harness product={polo} />)
    sheet = await openSheet(user)
    expect(within(sheet).getByRole('radio', { name: 'White' })).not.toBeChecked()
    expect(within(sheet).getByRole('radio', { name: 'Navy' })).not.toBeChecked()
  })

  it('needs a colour too when there are several', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const sheet = await openSheet(user)
    await user.click(within(sheet).getByRole('radio', { name: 'M' }))
    await user.click(within(sheet).getByRole('button', { name: 'Add to cart' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Choose a colour to continue.')
  })

  it('confirms with the chosen size, colour and quantity', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness action="buy" onConfirm={onConfirm} />)
    const sheet = await openSheet(user)
    await user.click(within(sheet).getByRole('radio', { name: 'L' }))
    await user.click(within(sheet).getByRole('radio', { name: 'Navy' }))
    await user.click(within(sheet).getByRole('button', { name: 'Increase quantity' }))
    await user.click(within(sheet).getByRole('button', { name: 'Buy now' }))
    expect(onConfirm).toHaveBeenCalledWith({ size: 'L', color: 'Navy', qty: 2 })
  })

  it('keeps the quantity between 1 and the stock, announcing it', async () => {
    const user = userEvent.setup()
    render(<Harness product={blazer} />)
    const sheet = await openSheet(user)
    const up = within(sheet).getByRole('button', { name: 'Increase quantity' })
    const down = within(sheet).getByRole('button', { name: 'Decrease quantity' })
    const value = sheet.querySelector('output')!
    expect(value).toHaveAttribute('aria-live', 'polite')
    expect(down).toBeDisabled()
    for (let i = 0; i < 6; i++) if (!(up as HTMLButtonElement).disabled) await user.click(up)
    expect(value).toHaveTextContent('4') // stock is 4
    expect(up).toBeDisabled()
    await user.click(down)
    expect(value).toHaveTextContent('3')
  })

  it('offers only what is left once some is in the cart, and nothing when all of it is', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness product={blazer} inCart={3} />)
    let sheet = await openSheet(user)
    expect(within(sheet).getByRole('button', { name: 'Increase quantity' })).toBeDisabled() // 1 left
    unmount()

    render(<Harness product={blazer} inCart={4} />)
    sheet = await openSheet(user)
    expect(within(sheet).getByText(/already in your cart/)).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Add to cart' })).toBeDisabled()
  })

  it('lets Buy now take the full stock even when some is in the cart', async () => {
    const user = userEvent.setup()
    render(<Harness product={blazer} action="buy" inCart={3} />)
    const sheet = await openSheet(user)
    await user.click(within(sheet).getByRole('button', { name: 'Increase quantity' }))
    expect(within(sheet).getByRole('button', { name: 'Increase quantity' })).toBeEnabled()
  })

  it('shows the sale price against the original and a live total', async () => {
    const user = userEvent.setup()
    render(<Harness product={blazer} />)
    const sheet = await openSheet(user)
    expect(sheet.querySelector('s')).toHaveTextContent('₱6,490.00')
    expect(within(sheet).getAllByText('₱4,990.00').length).toBeGreaterThan(0)
    await user.click(within(sheet).getByRole('button', { name: 'Increase quantity' }))
    expect(within(sheet).getByText('₱4,990.00 × 2')).toBeInTheDocument()
    expect(within(sheet).getByText('₱9,980.00')).toBeInTheDocument()
  })

  it('traps focus, closes on Escape and returns focus to what opened it', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Harness onClose={onClose} />)
    const trigger = screen.getByRole('button', { name: 'Open sheet' })
    const sheet = await openSheet(user)
    for (let i = 0; i < 20; i++) {
      await user.tab()
      expect(sheet.contains(document.activeElement)).toBe(true)
    }
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onClose).toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('starts fresh each time it opens', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    let sheet = await openSheet(user)
    await user.click(within(sheet).getByRole('radio', { name: 'M' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    sheet = await openSheet(user)
    expect(within(sheet).getByRole('radio', { name: 'M' })).not.toBeChecked()
  })
})
