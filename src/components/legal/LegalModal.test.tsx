import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LegalModal } from './LegalModal'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
})

// jsdom does no layout, so scroll geometry is faked for every element.
let scrollHeight = 2000
let clientHeight = 400
let scrollTop = 0
beforeEach(() => {
  scrollHeight = 2000
  clientHeight = 400
  scrollTop = 0
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(() => scrollHeight)
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(() => clientHeight)
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(() => scrollTop)
})
afterEach(() => vi.restoreAllMocks())

function setup(doc: 'terms' | 'privacy' = 'terms') {
  const onAcknowledge = vi.fn()
  const onClose = vi.fn()
  render(<LegalModal doc={doc} open onAcknowledge={onAcknowledge} onClose={onClose} />)
  const understand = screen.getByRole('button', { name: 'I understand' })
  const region = screen.getByRole('region', { name: /text$/ })
  return { onAcknowledge, onClose, understand, region }
}

const scrollTo = (region: HTMLElement, top: number) => {
  scrollTop = top
  fireEvent.scroll(region)
}

describe('LegalModal', () => {
  it('shows the real policy text for each document', () => {
    setup('terms')
    expect(screen.getByRole('dialog', { name: 'Terms of Service' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Governing law' })).toBeInTheDocument()
    expect(screen.getByText('These terms are governed by the laws of the Philippines.')).toBeInTheDocument()
  })

  it('shows the privacy policy under its own title', () => {
    setup('privacy')
    expect(screen.getByRole('dialog', { name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How camera data is handled' })).toBeInTheDocument()
  })

  it('keeps "I understand" disabled, with a linked hint, until the end is reached', async () => {
    const user = userEvent.setup()
    const { understand, region, onAcknowledge } = setup()

    expect(understand).toHaveAttribute('aria-disabled', 'true')
    const hint = screen.getByText('Scroll to the end to continue')
    expect(understand).toHaveAttribute('aria-describedby', hint.id)
    await user.click(understand)
    expect(onAcknowledge).not.toHaveBeenCalled()

    scrollTo(region, 1000)
    expect(understand).toHaveAttribute('aria-disabled', 'true')

    // 1600 is the true bottom; 1595 is within the tolerance.
    scrollTo(region, 1595)
    expect(understand).toHaveAttribute('aria-disabled', 'false')
    expect(screen.getByRole('status')).toHaveTextContent('You have reached the end')
    await user.click(understand)
    expect(onAcknowledge).toHaveBeenCalledTimes(1)
  })

  it('enables immediately when the content already fits', () => {
    scrollHeight = 400
    const { understand } = setup()
    expect(understand).toHaveAttribute('aria-disabled', 'false')
  })

  it('re-checks when the window is resized', () => {
    const { understand } = setup()
    expect(understand).toHaveAttribute('aria-disabled', 'true')
    scrollHeight = 400
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(understand).toHaveAttribute('aria-disabled', 'false')
  })

  it('does not acknowledge when cancelled or dismissed with Escape', async () => {
    const user = userEvent.setup()
    scrollHeight = 400
    const { onAcknowledge, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close Terms of Service' }))
    expect(onClose).toHaveBeenCalledTimes(3)
    expect(onAcknowledge).not.toHaveBeenCalled()
  })
})
