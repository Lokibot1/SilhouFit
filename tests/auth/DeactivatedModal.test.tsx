import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { DeactivatedModal } from '../../src/components/auth/DeactivatedModal'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

function Harness() {
  const [open, setOpen] = useState(true)
  return <DeactivatedModal open={open} onAcknowledge={() => setOpen(false)} />
}

describe('DeactivatedModal', () => {
  it('stays open on Escape and closes only with "I understand"', async () => {
    render(<Harness />)
    expect(screen.getByText('This account has been deactivated')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'I understand' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'I understand' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'I understand' })).toBeNull())
  })
})
