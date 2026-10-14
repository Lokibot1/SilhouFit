import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { AddressForm } from '../../src/components/address/AddressForm'

const chunk = vi.hoisted(() => ({ attempts: 0 }))
// The first fetch of the map chunk fails; the second one works.
vi.mock('../../src/components/address/MapPicker', () => {
  chunk.attempts += 1
  if (chunk.attempts === 1) throw new Error('Failed to fetch dynamically imported module')
  return { default: () => <p>Map is here</p> }
})
vi.mock('../../src/service/psgc', async (original) => ({
  ...(await original<typeof import('../../src/service/psgc')>()),
  getRegions: () => new Promise(() => {}),
}))

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

describe('Map chunk failure', () => {
  it('fetches the map again on the next Pin on a map, without a reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup({ delay: null })
    render(<AddressForm initial={null} onSaved={() => {}} footer={(submit) => submit} />)

    await user.click(screen.getByRole('button', { name: 'Pin on a map' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("The map couldn't load")
    await user.click(screen.getByRole('button', { name: 'Back to form' }))
    vi.resetModules()

    await user.click(screen.getByRole('button', { name: 'Pin on a map' }))
    expect(await screen.findByText('Map is here')).toBeInTheDocument()
    expect(chunk.attempts).toBe(2)
  })
})
