import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { TakeoverBanner } from '../../src/components/chat/TakeoverBanner'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

const admin = { id: 'a1', name: 'Bo Admin', role: 'admin' as const }

function setup(props: Partial<Parameters<typeof TakeoverBanner>[0]> = {}) {
  const onTakeOver = vi.fn().mockResolvedValue(undefined)
  const onRelease = vi.fn().mockResolvedValue(undefined)
  render(<TakeoverBanner holder={admin} selfId="s1" canSend={false} canTakeOver={false} canRelease={false} acting={false} onTakeOver={onTakeOver} onRelease={onRelease} {...props} />)
  return { onTakeOver, onRelease }
}

describe('TakeoverBanner', () => {
  it('says who handles the thread and that the viewer can only read', () => {
    setup()
    expect(screen.getByRole('status')).toHaveTextContent('Handled by Bo Admin (Admin). You can read this conversation but not reply.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows nothing for a free thread the viewer cannot take over', () => {
    setup({ holder: null })
    expect(screen.queryByTestId('takeover-banner')).toBeNull()
  })

  it('asks "Are you sure?" and only takes over on the matching confirm button', async () => {
    const user = userEvent.setup()
    const { onTakeOver } = setup({ holder: null, canTakeOver: true, canSend: true })
    await user.click(screen.getByRole('button', { name: 'Take over' }))
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    expect(onTakeOver).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Take over' }))
    expect(onTakeOver).toHaveBeenCalledOnce()
  })

  it('releases only after confirming, and Cancel changes nothing', async () => {
    const user = userEvent.setup()
    const { onRelease } = setup({ holder: { ...admin, id: 's1' }, canSend: true, canRelease: true })
    expect(screen.getByRole('status')).toHaveTextContent('You are handling this conversation.')
    await user.click(screen.getByRole('button', { name: 'Release' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(onRelease).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Release' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Release conversation' }))
    expect(onRelease).toHaveBeenCalledOnce()
  })
})
