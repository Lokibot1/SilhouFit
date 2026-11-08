import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorBoundary } from '../../src/components/RouteErrorBoundary'
import { ServerErrorPage } from '../../src/views/public/ServerErrorPage'

afterEach(() => vi.restoreAllMocks())

describe('ServerErrorPage', () => {
  it.each([
    [true, 'The service is reachable.'],
    [false, "The service can't be reached right now."],
  ])('checks the service status (reachable: %s)', async (ok, text) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok }))
    render(
      <MemoryRouter>
        <ServerErrorPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Check service status' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(text))
    expect(screen.getByRole('button', { name: ok ? 'Check service status' : 'Check again' })).toBeEnabled()
    vi.unstubAllGlobals()
  })

  it('shows the heading, page title, meta description and both actions', () => {
    render(
      <MemoryRouter>
        <ServerErrorPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: /our side\. not yours/i })).toBeInTheDocument()
    expect(document.title).toBe('Something broke — SilhouFit')
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
    expect(description).toMatch(/something went wrong/i)
    expect(description.length).toBeGreaterThanOrEqual(150)
    expect(description.length).toBeLessThanOrEqual(160)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')
  })

  it('runs the retry action when Try again is pressed', () => {
    const onRetry = vi.fn()
    render(
      <MemoryRouter>
        <ServerErrorPage onRetry={onRetry} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe('RouteErrorBoundary', () => {
  function Crash(): never {
    throw new Error('secret stack detail')
  }

  it('shows the 500 page for a crashing child without exposing the error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <MemoryRouter>
        <RouteErrorBoundary resetKey="/">
          <Crash />
        </RouteErrorBoundary>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: /our side\. not yours/i })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/secret stack detail|at Crash|\.tsx/)
  })

  it('renders children normally and recovers when the reset key changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let broken = true
    const Maybe = () => (broken ? <Crash /> : <p>All good</p>)
    const tree = (key: string) => (
      <MemoryRouter>
        <RouteErrorBoundary resetKey={key}>
          <Maybe />
        </RouteErrorBoundary>
      </MemoryRouter>
    )
    const { rerender } = render(tree('/a'))
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    broken = false
    rerender(tree('/b'))
    expect(screen.getByText('All good')).toBeInTheDocument()
  })
})
