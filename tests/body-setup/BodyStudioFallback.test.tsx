import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { saveBodyProfile } from '../../src/service/bodyProfile'
import { clearSession, setSession } from '../../src/service/session'
import { BodySetupPage } from '../../src/views/private/BodySetupPage'

// A device without WebGL: creating the renderer throws, exactly as three does when the context cannot be made.
const gl = vi.hoisted(() => ({ supported: true, constructed: 0 }))
vi.mock('three', async (original) => ({
  ...(await original<typeof import('three')>()),
  WebGLRenderer: class {
    constructor() {
      gl.constructed += 1
      throw new Error('Error creating WebGL context.')
    }
  },
}))
vi.mock('../../src/components/landing/chromeBody', async (original) => ({
  ...(await original<typeof import('../../src/components/landing/chromeBody')>()),
  webglSupported: () => gl.supported,
}))
vi.mock('../../src/service/bodyProfile', async (original) => ({
  ...(await original<typeof import('../../src/service/bodyProfile')>()),
  getBodyProfile: vi.fn().mockResolvedValue(null),
  saveBodyProfile: vi.fn(),
}))

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollIntoView = vi.fn()
})
beforeEach(() => {
  gl.supported = true
  gl.constructed = 0
  sessionStorage.clear()
  localStorage.clear()
  act(() => setSession({ name: 'Anne Santos', email: 'anne@example.com' }))
  vi.mocked(saveBodyProfile).mockImplementation(async (profile) => profile)
})
afterEach(() => {
  act(() => clearSession())
  vi.clearAllMocks()
})

describe('BodySetupPage without WebGL', () => {
  it('shows the flat fallback with a plain explanation and keeps every measurement usable through to saving', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <MemoryRouter initialEntries={['/profile/measurements']}>
        <ToastProvider>
          <Routes>
            <Route path="/profile" element={<p>profile page</p>} />
            <Route path="/profile/measurements" element={<BodySetupPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('radio', { name: /^(Selected)?Male/ }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' })) // build left unchosen
    expect(await screen.findByText('The 3D preview is not available on this device. You can still enter every measurement.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rotate the body left' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()

    await user.type(await screen.findByRole('textbox'), '175')
    for (let i = 0; i < 11; i++) await user.click(screen.getByRole('button', { name: /^(Next|Review)$/ }))
    await user.click(await screen.findByRole('checkbox', { name: /Save my measurements/ }))
    await user.click(screen.getByRole('button', { name: /Finish Setup/ }))

    await waitFor(() => expect(saveBodyProfile).toHaveBeenCalled())
    expect(vi.mocked(saveBodyProfile).mock.calls[0][0]).toMatchObject({ heightCm: 175, bodyModel: 'male' })
    expect(await screen.findByText('profile page')).toBeInTheDocument()
  })

  it('checks for WebGL first, so a device without it never constructs a renderer or logs three errors', async () => {
    gl.supported = false
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const user = userEvent.setup({ delay: null })
      render(
        <MemoryRouter initialEntries={['/profile/measurements']}>
          <ToastProvider>
            <Routes>
              <Route path="/profile/measurements" element={<BodySetupPage />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>,
      )
      await user.click(await screen.findByRole('radio', { name: /^(Selected)?Male/ }))
      await user.click(screen.getByRole('button', { name: 'Next' }))
      expect(await screen.findByText('The 3D preview is not available on this device. You can still enter every measurement.')).toBeInTheDocument()
      expect(gl.constructed).toBe(0)
      expect(errors).not.toHaveBeenCalled()
      expect(document.querySelector('canvas')).toBeNull()
    } finally {
      errors.mockRestore()
    }
  })

  it('still shows the fallback when the renderer cannot be made even though the probe passed', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <MemoryRouter initialEntries={['/profile/measurements']}>
        <ToastProvider>
          <Routes>
            <Route path="/profile/measurements" element={<BodySetupPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('radio', { name: /^(Selected)?Male/ }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('The 3D preview is not available on this device. You can still enter every measurement.')).toBeInTheDocument()
    expect(gl.constructed).toBeGreaterThan(0)
    expect(document.querySelector('canvas')).toBeNull()
  })
})
