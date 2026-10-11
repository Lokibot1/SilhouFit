import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { SpecSheet } from '../../src/components/shop/SpecSheet'
import { PRODUCTS } from '../../src/data/products'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList
})

const polo = PRODUCTS.find((p) => p.id === 'p01')! // two colours

function Harness({ action = 'buy', guest = false }: { action?: 'cart' | 'buy'; guest?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <SpecSheet open={open} onClose={() => setOpen(false)} product={polo} action={action} inCart={0} onConfirm={() => {}} guest={guest} />
    </>
  )
}

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open sheet' }))
  return screen.findByRole('dialog', { name: 'Choose options' })
}

describe('SpecSheet for guests', () => {
  it("tells a guest they'll sign in before paying, on Buy now only", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness guest />)
    expect(within(await openSheet(user)).getByText("You'll sign in before you pay.")).toBeInTheDocument()
    unmount()

    const second = render(<Harness guest action="cart" />)
    expect(within(await openSheet(user)).queryByText("You'll sign in before you pay.")).toBeNull()
    second.unmount()

    render(<Harness action="buy" />)
    expect(within(await openSheet(user)).queryByText("You'll sign in before you pay.")).toBeNull()
  })
})

describe('SpecSheet required choices', () => {
  it('marks size and, with several colours, colour as required before submitting', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const sheet = await openSheet(user)
    expect(within(sheet).getByText('Size', { selector: 'legend' })).toHaveTextContent('Size (required)')
    expect(within(sheet).getByText('Colour', { selector: 'legend' })).toHaveTextContent('Colour (required)')
  })

  it('moves focus to the colours when only the colour is missing', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const sheet = await openSheet(user)
    await user.click(within(sheet).getByRole('radio', { name: 'M' }))
    await user.click(within(sheet).getByRole('button', { name: 'Buy now' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Choose a colour to continue.')
    expect(within(sheet).getByRole('radio', { name: 'White' })).toHaveFocus()
  })
})

describe('SpecSheet closing', () => {
  it('returns focus to the opener when the backdrop is clicked, as it does for Escape', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open sheet' })
    await openSheet(user)
    const backdrop = document.querySelector('[aria-hidden="true"].absolute.inset-0') as HTMLElement
    await user.click(backdrop)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(opener).toHaveFocus()
  })
})
