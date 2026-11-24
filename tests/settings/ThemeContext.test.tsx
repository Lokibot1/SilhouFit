import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from '../../src/contexts/ThemeContext'

let osDark = false
let listeners: Array<() => void> = []

function Probe() {
  const { theme, preference, setPreference } = useTheme()
  return (
    <>
      <p data-testid="state">{`${preference}/${theme}`}</p>
      <button onClick={() => setPreference('light')}>Light</button>
      <button onClick={() => setPreference('dark')}>Dark</button>
      <button onClick={() => setPreference('system')}>System</button>
    </>
  )
}

const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )

beforeEach(() => {
  osDark = false
  listeners = []
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query.includes('prefers-color-scheme') && osDark
    },
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: () => void) => (listeners = listeners.filter((l) => l !== fn)),
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('ThemeContext', () => {
  it('follows the device while on System, and stops following once Light or Dark is chosen', async () => {
    renderProbe()
    expect(screen.getByTestId('state')).toHaveTextContent('system/light')
    act(() => {
      osDark = true
      listeners.forEach((fn) => fn())
    })
    expect(screen.getByTestId('state')).toHaveTextContent('system/dark')
    expect(document.documentElement).toHaveClass('dark')

    await userEvent.click(screen.getByRole('button', { name: 'Light' }))
    expect(listeners).toHaveLength(0)
    expect(screen.getByTestId('state')).toHaveTextContent('light/light')
  })

  it('saves Light and Dark and sets the dark class', async () => {
    renderProbe()
    await userEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(localStorage.getItem('silhoufit-theme')).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    await userEvent.click(screen.getByRole('button', { name: 'Light' }))
    expect(localStorage.getItem('silhoufit-theme')).toBe('light')
    expect(document.documentElement).not.toHaveClass('dark')
    await userEvent.click(screen.getByRole('button', { name: 'System' }))
    expect(localStorage.getItem('silhoufit-theme')).toBe('system')
  })

  it('keeps a stored light or dark value working', () => {
    localStorage.setItem('silhoufit-theme', 'dark')
    renderProbe()
    expect(screen.getByTestId('state')).toHaveTextContent('dark/dark')
  })
})
