import { MotionGlobalConfig } from 'motion/react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './ToastProvider'
import { useToast, type ToastOptions } from './useToast'

function Trigger({ toast }: { toast: ToastOptions }) {
  const { show } = useToast()
  return (
    <button type="button" onClick={() => show(toast)}>
      show
    </button>
  )
}

function setup(toast: ToastOptions) {
  render(
    <ToastProvider>
      <Trigger toast={toast} />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'show' }))
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('ToastProvider', () => {
  beforeEach(() => {
    // jsdom has no animation frames to finish exit transitions.
    MotionGlobalConfig.skipAnimations = true
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('auto-dismisses after 4500ms', async () => {
    setup({ kind: 'success', message: 'Saved' })
    expect(screen.getByRole('status')).toHaveTextContent('Saved')

    await advance(4400)
    expect(screen.getByRole('status')).toBeInTheDocument()
    await advance(1000)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('pauses while hovered and resumes on leave', async () => {
    setup({ kind: 'info', message: 'Heads up' })
    const toast = screen.getByRole('status')

    await advance(3000)
    fireEvent.mouseEnter(toast)
    await advance(10_000)
    expect(screen.getByRole('status')).toBeInTheDocument()

    fireEvent.mouseLeave(toast)
    await advance(2000)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows one toast at a time; a new one replaces the current', async () => {
    render(
      <ToastProvider>
        <Trigger toast={{ kind: 'info', message: 'First' }} />
        <Trigger toast={{ kind: 'info', message: 'Second' }} />
      </ToastProvider>,
    )
    const [first, second] = screen.getAllByRole('button', { name: 'show' })
    fireEvent.click(first)
    fireEvent.click(second)
    await advance(1000)

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Second')
  })

  it('runs the action and dismisses', async () => {
    const onClick = vi.fn()
    setup({ kind: 'error', message: 'Failed', action: { label: 'Try again', onClick } })
    expect(screen.getByRole('alert')).toHaveTextContent('Failed')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await advance(1000)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('dismisses on Escape and with the close button', async () => {
    setup({ kind: 'success', message: 'Saved' })
    fireEvent.keyDown(document, { key: 'Escape' })
    await advance(1000)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'show' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    await advance(1000)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
