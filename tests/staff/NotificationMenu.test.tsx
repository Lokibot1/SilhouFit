import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { NotificationMenu } from '../../src/components/staff/NotificationMenu'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { fetchStaffNotifications, type StaffNotification } from '../../src/service/fetchStaffNotifications'

vi.mock('../../src/service/fetchStaffNotifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchStaffNotifications')>()),
  fetchStaffNotifications: vi.fn(),
}))
const load = vi.mocked(fetchStaffNotifications)

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 22, 8, 0) - minutes * 60_000).toISOString()
const LIST: StaffNotification[] = [
  { id: 'n1', kind: 'low', message: 'Fence-Line Blazer is low on stock: 4 left', createdAt: at(12), read: false },
  { id: 'n2', kind: 'out', message: 'Washed Black Tee is sold out', createdAt: at(47), read: false },
  { id: 'n3', kind: 'low', message: 'Heritage Polo is low on stock: 6 left', createdAt: at(1560), read: true },
]

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => vi.clearAllMocks())

function renderBell() {
  return render(
    <ToastProvider>
      <NotificationMenu />
    </ToastProvider>,
  )
}

describe('NotificationMenu', () => {
  it('shows a skeleton while loading, then the list with times in 12-hour form', async () => {
    let answer: (list: StaffNotification[]) => void = () => {}
    load.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    renderBell()
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByRole('status', { name: 'Loading notifications' })).toBeInTheDocument()
    act(() => answer(LIST))
    const panel = await screen.findByRole('group', { name: 'Notifications' })
    expect(await within(panel).findByText('Washed Black Tee is sold out')).toBeInTheDocument()
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument()
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3)
    expect(within(panel).getAllByText(/\d{1,2}:\d{2}\s(AM|PM)/, { selector: 'time' })).toHaveLength(3)
    expect(within(panel).getByText('Sample data')).toBeInTheDocument()
  })

  it('counts the unread notifications on the bell, and marks them New in the list', async () => {
    load.mockResolvedValue(LIST)
    renderBell()
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    await userEvent.click(bell)
    const panel = await screen.findByRole('group', { name: 'Notifications' })
    expect(within(panel).getAllByText('New')).toHaveLength(2)
  })

  it('marks all as read, with a toast, and clears the badge', async () => {
    load.mockResolvedValue(LIST)
    renderBell()
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }))
    expect(screen.getByText('All notifications marked as read')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.queryByText('New')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('explains a failed load and retries', async () => {
    load.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'network' })).mockResolvedValue(LIST)
    renderBell()
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText("We couldn't load notifications.")).toBeInTheDocument()
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Washed Black Tee is sold out')).toBeInTheDocument()
  })

  it('says when there is nothing new', async () => {
    load.mockResolvedValue([])
    renderBell()
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument()
  })

  it('closes on Escape and puts focus back on the bell', async () => {
    load.mockResolvedValue(LIST)
    renderBell()
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    await userEvent.click(bell)
    await screen.findByRole('group', { name: 'Notifications' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Notifications' })).toBeNull())
    expect(bell).toHaveFocus()
  })

  it('closes on an outside click, and when Tab leaves the last button', async () => {
    load.mockResolvedValue(LIST)
    renderBell()
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    await userEvent.click(bell)
    await screen.findByRole('group', { name: 'Notifications' })
    await userEvent.click(document.body)
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Notifications' })).toBeNull())
    act(() => bell.focus())
    await userEvent.click(bell)
    expect(await screen.findByRole('button', { name: 'Mark all as read' })).toHaveFocus()
    await userEvent.tab()
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Notifications' })).toBeNull())
    expect(bell).toHaveFocus()
  })
})
