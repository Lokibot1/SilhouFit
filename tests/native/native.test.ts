import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const registered: unknown[][] = []
const addListener = vi.fn((...args: unknown[]) => registered.push(args))
const close = vi.fn()
const setStyle = vi.fn()
vi.mock('@capacitor/app', () => ({ App: { addListener } }))
vi.mock('@capacitor/browser', () => ({ Browser: { close } }))
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { setStyle }, Style: { Dark: 'DARK', Light: 'LIGHT' } }))

const { handleAppUrl, syncStatusBar } = await import('../../src/native')

const replace = vi.fn()
beforeEach(() => {
  vi.stubGlobal('location', { replace })
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('native app URL handling', () => {
  it('registers an appUrlOpen listener that forwards the url', () => {
    expect(registered).toEqual([['appUrlOpen', expect.any(Function)]])
  })

  it('closes the browser and replays the callback query and hash in the webview', () => {
    handleAppUrl('com.silhoufit.app://auth/callback?code=abc#access_token=t')
    expect(close).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('/auth/callback?code=abc#access_token=t')
  })

  it.each(['com.silhoufit.app://other?code=1', 'https://evil.test/auth/callback?code=1'])(
    'ignores %s',
    (url) => {
      handleAppUrl(url)
      expect(close).not.toHaveBeenCalled()
      expect(replace).not.toHaveBeenCalled()
    },
  )

  it('maps the theme to a status bar style', () => {
    syncStatusBar('dark')
    syncStatusBar('light')
    expect(setStyle).toHaveBeenNthCalledWith(1, { style: 'DARK' })
    expect(setStyle).toHaveBeenNthCalledWith(2, { style: 'LIGHT' })
  })
})
