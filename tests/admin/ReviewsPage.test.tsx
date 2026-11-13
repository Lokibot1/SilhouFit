import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteReply, deleteReview, listAdminReviews, replyToReview, restoreReview, type AdminReview } from '../../src/service/reviewsApi'
import { clearSession } from '../../src/service/session'
import { formatOrderTime } from '../../src/utils/format'
import { ReviewsPage } from '../../src/views/admin/ReviewsPage'
import { renderAdmin, setUpAdminDom } from '../shared/adminSession'

vi.mock('../../src/service/reviewsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/reviewsApi')>()),
  listAdminReviews: vi.fn(),
  replyToReview: vi.fn(),
  deleteReply: vi.fn(),
  deleteReview: vi.fn(),
  restoreReview: vi.fn(),
}))

const list = vi.mocked(listAdminReviews)
const reply = vi.mocked(replyToReview)
const removeReply = vi.mocked(deleteReply)
const remove = vi.mocked(deleteReview)
const restore = vi.mocked(restoreReview)

const review = (n: number, over: Partial<AdminReview> = {}): AdminReview => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  orderId: '11111111-0000-4000-8000-000000000001',
  productId: '22222222-0000-4000-8000-000000000001',
  rating: 4,
  comment: `Fits well, review ${n}.`,
  user: { id: `u${n}`, name: `Reviewer ${n}`, avatarUrl: null },
  images: [],
  purchasedVariants: [],
  adminReply: null,
  adminRepliedAt: null,
  isDeleted: false,
  createdAt: '2026-11-01T02:00:00.000Z',
  updatedAt: '2026-11-01T02:00:00.000Z',
  ...over,
})
const page = (data: AdminReview[], total = data.length) => ({ data, meta: { total, page: 1, limit: 20, totalPages: Math.max(1, Math.ceil(total / 20)) } })
const network = () => Object.assign(new Error('network'), { kind: 'network' })

beforeAll(setUpAdminDom)
beforeEach(() => {
  list.mockResolvedValue(page([review(1), review(2, { adminReply: 'Thanks for the kind words.', adminRepliedAt: '2026-11-02T02:00:00.000Z' })]))
  reply.mockResolvedValue(review(1))
  removeReply.mockResolvedValue(review(2))
  remove.mockResolvedValue(review(1, { isDeleted: true }))
  restore.mockResolvedValue(review(1))
})
afterEach(() => {
  vi.resetAllMocks()
  act(() => clearSession())
})

// jsdom loads no CSS, so the table and the card list are both on screen: these look in the table.
const table = () => screen.getByRole('table')
const row = (name: string) => within(table()).getAllByRole('row').find((r) => within(r).queryByText(name))!
const button = (name: string) => within(table()).getByRole('button', { name })

async function renderPage() {
  renderAdmin(<ReviewsPage />, '/admin/reviews')
  await within(table()).findByText('Reviewer 1')
}

describe('ReviewsPage', () => {
  it('shows skeleton rows while the reviews load, then the reviews', async () => {
    let finish!: (value: ReturnType<typeof page>) => void
    list.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderAdmin(<ReviewsPage />, '/admin/reviews')
    expect(table()).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Loading reviews')
    expect(screen.queryByText('Reviewer 1')).not.toBeInTheDocument()
    await act(async () => finish(page([review(1)])))
    expect(await within(table()).findByText('Reviewer 1')).toBeInTheDocument()
    expect(table()).toHaveAttribute('aria-busy', 'false')
  })

  it('lists each review with its product id, date and status, and the pager total', async () => {
    await renderPage()
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20, includeDeleted: false, sortBy: 'newest' }), expect.anything())
    const first = row('Reviewer 1')
    expect(within(first).getByText('22222222')).toBeInTheDocument()
    expect(within(first).getByText(formatOrderTime('2026-11-01T02:00:00.000Z'))).toBeInTheDocument()
    expect(within(first).getByText('Published')).toBeInTheDocument()
    expect(within(first).queryByText('Replied')).not.toBeInTheDocument()
    expect(within(row('Reviewer 2')).getByText('Replied')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
    expect(screen.getByText('Displaying 1–2 of 2')).toBeInTheDocument()
  })

  it('names what failed and retries', async () => {
    list.mockRejectedValueOnce(network())
    renderAdmin(<ReviewsPage />, '/admin/reviews')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the reviews.")
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await within(table()).findByText('Reviewer 1')).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('tells staff there are no reviews yet', async () => {
    list.mockResolvedValue(page([]))
    renderAdmin(<ReviewsPage />, '/admin/reviews')
    expect(await screen.findByText('No reviews yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('asks for deleted reviews only when Include deleted is on', async () => {
    await renderPage()
    list.mockResolvedValue(page([review(3, { isDeleted: true })]))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include deleted reviews' }))
    expect(await within(table()).findByText('Deleted')).toBeInTheDocument()
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ includeDeleted: true, page: 1 }), expect.anything())
    // A deleted review can only be restored.
    const deleted = row('Reviewer 3')
    expect(within(deleted).queryByRole('button', { name: /^Reply/ })).not.toBeInTheDocument()
    await userEvent.click(within(deleted).getByRole('button', { name: "Restore Reviewer 3's review" }))
    await waitFor(() => expect(restore).toHaveBeenCalledWith(review(3).id))
    expect(await screen.findByText("Reviewer 3's review is restored.")).toBeInTheDocument()
  })

  it('posts a reply with its character count, then reads the list again', async () => {
    await renderPage()
    await userEvent.click(button("Reply to Reviewer 1's review"))
    const dialog = await screen.findByRole('dialog', { name: 'Reply to review' })
    expect(within(dialog).getByText('0/2000')).toBeInTheDocument()
    const post = within(dialog).getByRole('button', { name: 'Post reply' })
    expect(post).toBeDisabled()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Your reply' }), 'Thank you!')
    expect(within(dialog).getByText('10/2000')).toBeInTheDocument()
    await userEvent.click(post)
    await waitFor(() => expect(reply).toHaveBeenCalledWith(review(1).id, 'Thank you!'))
    expect(await screen.findByText('Reply posted.')).toBeInTheDocument()
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  })

  it('edits an existing reply, starting from its text', async () => {
    await renderPage()
    await userEvent.click(button("Edit your reply to Reviewer 2's review"))
    const dialog = await screen.findByRole('dialog', { name: 'Edit reply' })
    const box = within(dialog).getByRole('textbox', { name: 'Your reply' })
    expect(box).toHaveValue('Thanks for the kind words.')
    expect(within(dialog).getByRole('button', { name: 'Save reply' })).toBeDisabled()
    await userEvent.clear(box)
    await userEvent.type(box, 'Thanks again.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save reply' }))
    await waitFor(() => expect(reply).toHaveBeenCalledWith(review(2).id, 'Thanks again.'))
    expect(await screen.findByText('Reply updated.')).toBeInTheDocument()
  })

  it('keeps the dialog and the text when the reply fails, and says why', async () => {
    reply.mockRejectedValueOnce(network())
    await renderPage()
    await userEvent.click(button("Reply to Reviewer 1's review"))
    const dialog = await screen.findByRole('dialog', { name: 'Reply to review' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Your reply' }), 'Hello')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Post reply' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("We couldn't post the reply. The connection dropped")
    expect(within(dialog).getByRole('textbox', { name: 'Your reply' })).toHaveValue('Hello')
  })

  it('asks before removing a reply, and Cancel changes nothing', async () => {
    await renderPage()
    await userEvent.click(button("Remove your reply to Reviewer 2's review"))
    const dialog = await screen.findByRole('dialog', { name: 'Remove your reply?' })
    expect(within(dialog).getByText('Are you sure?')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(removeReply).not.toHaveBeenCalled()
    await userEvent.click(button("Remove your reply to Reviewer 2's review"))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remove your reply?' })).getByRole('button', { name: 'Remove reply' }))
    await waitFor(() => expect(removeReply).toHaveBeenCalledWith(review(2).id))
    expect(await screen.findByText('Reply removed.')).toBeInTheDocument()
  })

  it('deletes a review after confirming, and Undo restores it', async () => {
    await renderPage()
    await userEvent.click(button("Delete Reviewer 1's review"))
    const dialog = await screen.findByRole('dialog', { name: "Delete Reviewer 1's review?" })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete review' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith(review(1).id))
    expect(await screen.findByText("Reviewer 1's review is deleted.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(restore).toHaveBeenCalledWith(review(1).id))
    expect(await screen.findByText("Reviewer 1's review is restored.")).toBeInTheDocument()
  })

  it('disables the row buttons while its request runs', async () => {
    let finish!: () => void
    remove.mockReturnValue(new Promise((resolve) => (finish = () => resolve(review(1, { isDeleted: true })))))
    await renderPage()
    await userEvent.click(button("Delete Reviewer 1's review"))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete review' }))
    await waitFor(() => expect(button("Reply to Reviewer 1's review")).toBeDisabled())
    expect(button("Reply to Reviewer 1's review")).toBeDisabled()
    await act(async () => finish())
    await waitFor(() => expect(button("Reply to Reviewer 1's review")).toBeEnabled())
  })
})
