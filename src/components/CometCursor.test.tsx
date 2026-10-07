import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../contexts/ThemeContext'
import { LandingCometCursor } from './CometCursor'

const active = () => document.documentElement.classList.contains('comet-active')

beforeEach(() => {
  // A fine pointer without reduced motion: the only case where the comet runs.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('pointer: fine'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  )
})
afterEach(() => vi.restoreAllMocks())

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <LandingCometCursor />
        <Link to="/signup">to signup</Link>
        <Link to="/">to home</Link>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('LandingCometCursor', () => {
  it('runs the comet and hides the native cursor on "/"', () => {
    const { container, unmount } = renderAt('/')
    expect(container.querySelector('canvas')).toBeInTheDocument()
    expect(active()).toBe(true)
    unmount()
    expect(active()).toBe(false)
  })

  it.each(['/signup', '/about', '/terms-of-service', '/no-such-page'])(
    'mounts nothing and leaves the native cursor on %s',
    (path) => {
      const { container } = renderAt(path)
      expect(container.querySelector('canvas')).not.toBeInTheDocument()
      expect(active()).toBe(false)
    },
  )

  it('restores the native cursor when navigating away, and returns on coming back', async () => {
    const user = userEvent.setup()
    const { container, getByText } = renderAt('/')
    expect(active()).toBe(true)

    await user.click(getByText('to signup'))
    expect(container.querySelector('canvas')).not.toBeInTheDocument()
    expect(active()).toBe(false)

    await user.click(getByText('to home'))
    expect(active()).toBe(true)
  })
})
