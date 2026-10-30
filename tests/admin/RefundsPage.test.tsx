import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as service from '../../src/service/refunds'
import { getRefunds, REFUND_REASON_LABELS, setRefunds, type RefundRequest } from '../../src/service/refunds'
import { clearSession, setSession } from '../../src/service/session'
import { formatOrderTime, formatPeso } from '../../src/utils/format'
import { RefundsPage } from '../../src/views/admin/RefundsPage'
import { renderAdmin, setUpAdminDom } from '../shared/adminSession'

vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))
vi.mock('../../src/service/refunds', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/service/refunds')>()
  return {
    ...real,
    getRefundSummary: vi.fn(real.getRefundSummary),
    listRefunds: vi.fn(real.listRefunds),
    approveRefund: vi.fn(real.approveRefund),
    rejectRefund: vi.fn(real.rejectRefund),
  }
})

const PATH = '/admin/refunds'
const original = getRefunds()
const network = () => Object.assign(new Error('network'), { kind: 'network' })

/** The default view: newest request first. */
const recent = [...original].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
const pendingOnes = recent.filter((r) => r.status === 'pending')
const count = (status: RefundRequest['status']) => original.filter((r) => r.status === status).length
const refunded = () => original.reduce((sum, r) => sum + (r.approvedAmount ?? 0), 0)

beforeAll(setUpAdminDom)
afterEach(() => {
  vi.clearAllMocks()
  act(() => clearSession())
  setRefunds(original)
})

// jsdom loads no CSS, so the table and the card list are both on screen: these look in the table.
const table = () => screen.getByRole('table')
const bodyRows = () => within(table()).getAllByRole('row').slice(1)
const rowOf = (request: RefundRequest) => bodyRows().find((r) => within(r).queryByText(request.requestNo))!
const cards = () => screen.getByRole('region', { name: 'Refund requests at a glance' })
const figure = (label: string) => within(cards()).getByText(label).nextSibling
const searchBox = () => screen.getByRole('textbox', { name: 'Search refund requests by request number, order, customer or staff' })
const header = (name: string) => within(table()).getByRole('columnheader', { name })
const pagerText = (from: number, to: number, total: number) => `Displaying ${from}–${to} of ${total}`

async function renderPage() {
  renderAdmin(<RefundsPage />, PATH)
  await within(table()).findByText(recent[0].requestNo)
  await within(cards()).findByText('Total refunded')
}

async function showPending() {
  await userEvent.click(screen.getByRole('tab', { name: 'Pending' }))
  await within(table()).findByText(pendingOnes[0].requestNo)
}

async function openSheet(request: RefundRequest) {
  await userEvent.click(within(rowOf(request)).getByRole('button', { name: request.requestNo }))
  return screen.findByRole('dialog', { name: request.requestNo })
}

/** The pending request on top of the Pending tab, its sheet open. */
async function openPending() {
  await renderPage()
  await showPending()
  return { request: pendingOnes[0], dialog: await openSheet(pendingOnes[0]) }
}

describe('Returns & Refunds page', () => {
  it('shows the title, the four cards and the first page of requests', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Returns & Refunds' })).toBeInTheDocument()
    expect(document.title).toBe('Returns & Refunds — SilhouFit')
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content
    expect(meta.length).toBeGreaterThanOrEqual(150)
    expect(meta.length).toBeLessThanOrEqual(160)

    expect(figure('Pending')).toHaveTextContent(String(count('pending')))
    expect(figure('Approved')).toHaveTextContent(String(count('approved')))
    expect(figure('Rejected')).toHaveTextContent(String(count('rejected')))
    expect(figure('Total refunded')).toHaveTextContent(formatPeso(refunded()))
    expect(within(cards()).getByText(`${count('approved')} approved requests`)).toBeInTheDocument()

    expect(bodyRows()).toHaveLength(10)
    expect(bodyRows().map((r) => within(r).getByRole('button').textContent)).toEqual(recent.slice(0, 10).map((r) => r.requestNo))
    expect(screen.getByText(pagerText(1, 10, original.length))).toBeInTheDocument()
    const first = rowOf(recent[0])
    expect(within(first).getByText(formatPeso(recent[0].amount))).toBeInTheDocument()
    expect(within(first).getByText(REFUND_REASON_LABELS[recent[0].reason])).toBeInTheDocument()
    expect(within(first).getByText(recent[0].customerName)).toBeInTheDocument()
  })

  it('reserves as many placeholder rows as the first page while it loads', async () => {
    renderAdmin(<RefundsPage />, PATH)
    expect(bodyRows()).toHaveLength(10)
    expect(within(screen.getByRole('list', { name: 'Refund requests' })).getAllByRole('listitem')).toHaveLength(10)
    await within(table()).findByText(recent[0].requestNo)
    expect(bodyRows()).toHaveLength(10)
    expect(within(screen.getByRole('list', { name: 'Refund requests' })).getAllByRole('listitem')).toHaveLength(10)
  })

  it('filters by status with the tabs', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('tab', { name: 'Pending' }))
    const pending = count('pending')
    expect(await screen.findByText(pagerText(1, Math.min(10, pending), pending))).toBeInTheDocument()
    for (const r of bodyRows()) expect(within(r).getByText('Pending')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Rejected' }))
    const rejected = count('rejected')
    expect(await screen.findByText(pagerText(1, Math.min(10, rejected), rejected))).toBeInTheDocument()
    for (const r of bodyRows()) expect(within(r).getByText('Rejected')).toBeInTheDocument()
  })

  it('searches request, order, customer and staff after a pause, and offers Clear filters when nothing matches', async () => {
    await renderPage()
    await userEvent.type(searchBox(), original[0].requestNo)
    expect(await screen.findByText(pagerText(1, 1, 1))).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(1)

    await userEvent.clear(searchBox())
    const order = original[3].orderNo
    await userEvent.type(searchBox(), order.toLowerCase())
    const byOrder = original.filter((r) => r.orderNo.toLowerCase().includes(order.toLowerCase())).length
    expect(await screen.findByText(pagerText(1, byOrder, byOrder))).toBeInTheDocument()

    await userEvent.clear(searchBox())
    const staff = original.find((r) => r.requestedBy !== 'Customer')!.requestedBy
    await userEvent.type(searchBox(), staff)
    const byStaff = original.filter((r) => r.requestedBy === staff).length
    expect(await screen.findByText(pagerText(1, Math.min(10, byStaff), byStaff))).toBeInTheDocument()

    await userEvent.clear(searchBox())
    await userEvent.type(searchBox(), 'zzzz')
    expect(await screen.findByText('No refund requests match')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText(pagerText(1, 10, original.length))).toBeInTheDocument()
    expect(searchBox()).toHaveValue('')
  })

  it('sorts by a column, flips the direction on a second click and right-aligns the amounts', async () => {
    await renderPage()
    expect(header('Requested at')).toHaveAttribute('aria-sort', 'descending')

    await userEvent.click(within(header('Amount')).getByRole('button'))
    await waitFor(() => expect(header('Amount')).toHaveAttribute('aria-sort', 'ascending'))
    expect(header('Requested at')).not.toHaveAttribute('aria-sort')
    const lowest = Math.min(...original.map((r) => r.amount))
    await waitFor(() => expect(within(bodyRows()[0]).getByText(formatPeso(lowest))).toBeInTheDocument())
    expect(within(bodyRows()[0]).getByText(formatPeso(lowest))).toHaveClass('text-right', 'tabular-nums')
    expect(header('Amount').className).toContain('text-right')
    expect(header('Customer').className).toContain('text-left')

    await userEvent.click(within(header('Amount')).getByRole('button'))
    await waitFor(() => expect(header('Amount')).toHaveAttribute('aria-sort', 'descending'))
    const highest = Math.max(...original.map((r) => r.amount))
    await waitFor(() => expect(within(bodyRows()[0]).getByText(formatPeso(highest))).toBeInTheDocument())
  })

  it('pages through the requests and falls back to the first page when the page no longer exists', async () => {
    expect(original.length).toBeGreaterThan(20)
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText(pagerText(11, 20, original.length))).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText(pagerText(21, Math.min(30, original.length), original.length))).toBeInTheDocument()

    act(() => setRefunds(original.slice(0, 15)))
    expect(await screen.findByText('There are no refund requests on page 3.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Go to the first page' }))
    expect(await screen.findByText(pagerText(1, 10, 15))).toBeInTheDocument()
  })

  it('opens a request in a sheet with its items, reason, amount and a link to the order, and Escape closes it', async () => {
    await renderPage()
    const request = recent[0]
    const link = within(rowOf(request)).getByRole('link', { name: request.orderNo })
    expect(link).toHaveAttribute('href', `/admin/transactions?q=${encodeURIComponent(request.orderNo)}`)

    const button = within(rowOf(request)).getByRole('button', { name: request.requestNo })
    const dialog = await openSheet(request)
    expect(within(dialog).getByText(request.customerName)).toBeInTheDocument()
    expect(within(dialog).getByText(REFUND_REASON_LABELS[request.reason])).toBeInTheDocument()
    expect(within(dialog).getByText(request.reasonText)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: request.orderNo })).toHaveAttribute('href', `/admin/transactions?q=${request.orderNo}`)
    for (const item of request.items) expect(within(dialog).getAllByText(item.name).length).toBeGreaterThan(0)
    expect(within(dialog).getByText('Order total').nextSibling).toHaveTextContent(formatPeso(request.orderTotal))
    expect(within(dialog).getByText('Requested').nextSibling).toHaveTextContent(formatPeso(request.amount))

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(button).toHaveFocus()
  })

  it('approves the full amount after a confirmation, records the admin, and updates the cards and the sheet', async () => {
    act(() => setSession({ name: 'Dev Admin', email: 'admin@silhoufit.dev', role: 'admin' }))
    const { request, dialog } = await openPending()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve refund' }))
    const full = request.amount === request.orderTotal ? 'Full refund' : 'Requested amount'
    expect(within(dialog).getByRole('radio', { name: `${full} (${formatPeso(request.amount)})` })).toBeChecked()
    await userEvent.type(within(dialog).getByLabelText(/^Note/), 'Checked the item photos')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review approval' }))

    const confirm = await screen.findByRole('dialog', { name: `Approve ${formatPeso(request.amount)} refund for ${request.orderNo}?` })
    expect(service.approveRefund).not.toHaveBeenCalled()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Approve refund' }))

    expect(await screen.findByText(`Refund ${request.requestNo} approved: ${formatPeso(request.amount)}`)).toBeInTheDocument()
    expect(service.approveRefund).toHaveBeenCalledWith(request.id, { amount: request.amount, note: 'Checked the item photos', decidedBy: 'Dev Admin' })
    const sheet = screen.getByRole('dialog', { name: request.requestNo })
    expect(within(sheet).getByText(/^Approved by Dev Admin on/)).toBeInTheDocument()
    expect(within(sheet).getByText(`Refunded: ${formatPeso(request.amount)}`)).toBeInTheDocument()
    expect(within(sheet).getByText('Note: Checked the item photos')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'Approve refund' })).toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Reject refund' })).toBeNull()

    await waitFor(() => expect(figure('Pending')).toHaveTextContent(String(count('pending') - 1)))
    expect(figure('Approved')).toHaveTextContent(String(count('approved') + 1))
    expect(figure('Total refunded')).toHaveTextContent(formatPeso(refunded() + request.amount))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(table()).queryByText(request.requestNo)).toBeNull()
  })

  it('checks a partial amount in the field before it asks for the confirmation', async () => {
    const { request, dialog } = await openPending()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve refund' }))
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Partial refund' }))
    const amount = within(dialog).getByLabelText('Amount to refund')
    const review = () => userEvent.click(within(dialog).getByRole('button', { name: 'Review approval' }))

    await review()
    expect(await within(dialog).findByText('Enter the amount to refund.')).toBeInTheDocument()
    expect(amount).toHaveFocus()

    await userEvent.type(amount, '0')
    await userEvent.tab()
    expect(await within(dialog).findByText('The refund must be more than ₱0.00.')).toBeInTheDocument()

    await userEvent.clear(amount)
    await userEvent.type(amount, String(request.orderTotal + 1))
    await review()
    expect(await within(dialog).findByText(`Enter an amount of at most ${formatPeso(request.orderTotal)}, the order total.`)).toBeInTheDocument()

    // The field keeps only digits and 2 decimals, so letters and a third decimal never get in.
    await userEvent.clear(amount)
    await userEvent.type(amount, 'ab')
    expect(amount).toHaveValue('')
    await userEvent.type(amount, '1.234')
    expect(amount).toHaveValue('1.23')

    expect(service.approveRefund).not.toHaveBeenCalled()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    await review()
    await userEvent.click(within(await screen.findByRole('dialog', { name: `Approve ${formatPeso(1.23)} refund for ${request.orderNo}?` })).getByRole('button', { name: 'Approve refund' }))
    expect(await screen.findByText(`Refund ${request.requestNo} approved: ${formatPeso(1.23)}`)).toBeInTheDocument()
    expect(service.approveRefund).toHaveBeenCalledWith(request.id, expect.objectContaining({ amount: 1.23 }))
  })

  it('needs a reason of at least 10 characters to reject, counts it, and confirms with a secondary button', async () => {
    const { request, dialog } = await openPending()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject refund' }))
    const reason = within(dialog).getByLabelText('Reason for rejecting')
    expect(within(dialog).getByText('0/300')).toBeInTheDocument()

    await userEvent.type(reason, 'too short')
    expect(within(dialog).getByText('9/300')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review rejection' }))
    expect(await within(dialog).findByText('Use at least 10 characters so the reason is clear.')).toBeInTheDocument()
    expect(service.rejectRefund).not.toHaveBeenCalled()

    await userEvent.type(reason, ' by far')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review rejection' }))
    const confirm = await screen.findByRole('dialog', { name: `Reject refund ${request.requestNo}?` })
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toBeEnabled()
    const reject = within(confirm).getByRole('button', { name: 'Reject refund' })
    expect(reject).toHaveClass('glass-btn')
    expect(reject).not.toHaveClass('bg-fg')

    let finish: (value: RefundRequest) => void = () => {}
    vi.mocked(service.rejectRefund).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    await userEvent.click(reject)
    expect(await within(confirm).findByRole('button', { name: 'Reject refund' })).toBeDisabled()
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await userEvent.click(reject)
    expect(service.rejectRefund).toHaveBeenCalledTimes(1)

    await act(async () => finish({ ...request, status: 'rejected', decidedBy: 'Admin', decidedAt: new Date().toISOString(), approvedAmount: null, decisionNote: 'too short by far' }))
    expect(await screen.findByText(`Refund ${request.requestNo} rejected`)).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText('Reason: too short by far')).toBeInTheDocument()
  })

  it('shows a decided request without controls, and refuses to decide it again', async () => {
    await renderPage()
    const rejected = recent.find((r) => r.status === 'rejected')!
    await userEvent.click(screen.getByRole('tab', { name: 'Rejected' }))
    await within(table()).findByText(rejected.requestNo)
    const dialog = await openSheet(rejected)
    expect(within(dialog).getByText(new RegExp(`^Rejected by ${rejected.decidedBy}`))).toBeInTheDocument()
    expect(within(dialog).getByText(`Reason: ${rejected.decisionNote}`)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /refund$/ })).toBeNull()
    expect(within(dialog).queryByRole('textbox')).toBeNull()

    const approved = original.find((r) => r.status === 'approved')!
    await expect(service.approveRefund(approved.id, { amount: 1, decidedBy: 'Dev Admin' })).rejects.toMatchObject({ kind: 'conflict' })
    await expect(service.rejectRefund(rejected.id, { reason: 'A long enough reason', decidedBy: 'Dev Admin' })).rejects.toMatchObject({ kind: 'conflict' })
    await expect(service.approveRefund('refund-missing', { amount: 1, decidedBy: 'Dev Admin' })).rejects.toMatchObject({ kind: 'not-found' })
    expect(getRefunds().find((r) => r.id === approved.id)).toEqual(approved)
  })

  it('checks the amount and the reason on the service too', async () => {
    const request = pendingOnes[0]
    await expect(service.approveRefund(request.id, { amount: 0, decidedBy: 'x' })).rejects.toMatchObject({ kind: 'validation', field: 'amount' })
    await expect(service.approveRefund(request.id, { amount: request.orderTotal + 0.01, decidedBy: 'x' })).rejects.toMatchObject({ kind: 'validation', field: 'amount' })
    await expect(service.approveRefund(request.id, { amount: 1.234, decidedBy: 'x' })).rejects.toMatchObject({ kind: 'validation', field: 'amount' })
    await expect(service.rejectRefund(request.id, { reason: 'short', decidedBy: 'x' })).rejects.toMatchObject({ kind: 'validation', field: 'reason' })
    await expect(service.rejectRefund(request.id, { reason: 'a'.repeat(301), decidedBy: 'x' })).rejects.toMatchObject({ kind: 'validation', field: 'reason' })
    expect(getRefunds().find((r) => r.id === request.id)?.status).toBe('pending')
  })

  it('shows a section error with Retry when the list fails, and still shows the cards', async () => {
    vi.mocked(service.listRefunds).mockRejectedValueOnce(network())
    renderAdmin(<RefundsPage />, PATH)
    expect(await screen.findByText("We couldn't load the refund requests.")).toBeInTheDocument()
    expect(await within(cards()).findByText('Total refunded')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await within(table()).findByText(recent[0].requestNo)).toBeInTheDocument()
  })

  it('keeps the list working when the figures fail', async () => {
    vi.mocked(service.getRefundSummary).mockRejectedValueOnce(network())
    renderAdmin(<RefundsPage />, PATH)
    expect(await screen.findByText("We couldn't load the refund figures.")).toBeInTheDocument()
    expect(await within(table()).findByText(recent[0].requestNo)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await within(cards()).findByText('Total refunded')).toBeInTheDocument()
  })

  it('keeps the form and re-enables the buttons when the decision fails', async () => {
    vi.mocked(service.approveRefund).mockRejectedValueOnce(network())
    const { request, dialog } = await openPending()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve refund' }))
    await userEvent.type(within(dialog).getByLabelText(/^Note/), 'Keep me')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review approval' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: /^Approve .* refund for / })).getByRole('button', { name: 'Approve refund' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't approve the refund.")
    expect(alert).toHaveTextContent(`refund ${request.requestNo} is still pending`)
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByRole('button', { name: 'Approve refund' })).toBeEnabled()
    // Focus stays on the button that was pressed instead of dropping to the page.
    expect(within(sheet).getByRole('button', { name: 'Approve refund' })).toHaveFocus()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    expect(within(screen.getByRole('dialog')).getByLabelText(/^Note/)).toHaveValue('Keep me')
    expect(getRefunds().find((r) => r.id === request.id)?.status).toBe('pending')
  })

  it('closes the sheet and says so when someone else already decided the request', async () => {
    const { request, dialog } = await openPending()
    vi.mocked(service.rejectRefund).mockImplementationOnce(async () => {
      setRefunds(original.map((r) => (r.id === request.id ? { ...r, status: 'approved', decidedBy: 'Alyssa Ferrer', decidedAt: new Date().toISOString(), approvedAmount: r.amount } : r)))
      throw Object.assign(new Error('conflict'), { kind: 'conflict' })
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject refund' }))
    await userEvent.type(within(dialog).getByLabelText('Reason for rejecting'), 'Item was worn already')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review rejection' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: `Reject refund ${request.requestNo}?` })).getByRole('button', { name: 'Reject refund' }))

    expect(await screen.findByText(new RegExp(`Refund ${request.requestNo} was already decided`))).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows an empty state, and says nothing is waiting on the Pending tab', async () => {
    setRefunds([])
    renderAdmin(<RefundsPage />, PATH)
    expect(await screen.findByText('No refund requests yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Pending' }))
    expect(await screen.findByText('No pending requests')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show all requests' }))
    expect(await screen.findByText('No refund requests yet')).toBeInTheDocument()
  })

  it('approves several pending requests at once after one confirmation', async () => {
    await renderPage()
    await showPending()
    const [a, b] = pendingOnes
    expect(screen.queryByText(/ selected$/)).toBeNull()
    await userEvent.click(within(table()).getByRole('checkbox', { name: `Select ${a.requestNo}` }))
    await userEvent.click(within(table()).getByRole('checkbox', { name: `Select ${b.requestNo}` }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))
    const total = a.amount + b.amount
    const dialog = await screen.findByRole('dialog', { name: `Approve 2 refunds totalling ${formatPeso(total)}?` })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve refunds' }))

    expect(await screen.findByText(`2 refunds approved: ${formatPeso(total)}`)).toBeInTheDocument()
    expect(service.approveRefund).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(figure('Pending')).toHaveTextContent(String(count('pending') - 2)))
    expect(figure('Total refunded')).toHaveTextContent(formatPeso(refunded() + total))
    expect(screen.queryByText(/ selected$/)).toBeNull()
  })

  it('selects every pending request on the page from the header, and starts again on another tab', async () => {
    await renderPage()
    await userEvent.click(within(header('Select all pending requests on this page').parentElement!).getByRole('checkbox', { name: 'Select all pending requests on this page' }))
    const onPage = recent.slice(0, 10).filter((r) => r.status === 'pending').length
    expect(screen.getByText(`${onPage} selected`)).toBeInTheDocument()
    // Decided requests have nothing to tick.
    const decided = recent.slice(0, 10).find((r) => r.status !== 'pending')
    if (decided) expect(within(rowOf(decided)).queryByRole('checkbox')).toBeNull()

    await userEvent.click(screen.getByRole('tab', { name: 'Approved' }))
    await within(table()).findByText(original.find((r) => r.status === 'approved')!.requestNo)
    expect(screen.queryByText(/ selected$/)).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: 'All' }))
    await within(table()).findByText(recent[0].requestNo)
    expect(screen.queryByText(/ selected$/)).toBeNull()
  })

  it('says how many of the selected were approved when some fail, and retries the rest', async () => {
    await renderPage()
    await showPending()
    const [a, b] = pendingOnes
    vi.mocked(service.approveRefund).mockRejectedValueOnce(network())
    await userEvent.click(within(table()).getByRole('checkbox', { name: `Select ${a.requestNo}` }))
    await userEvent.click(within(table()).getByRole('checkbox', { name: `Select ${b.requestNo}` }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve refunds' }))

    expect(await screen.findByText(/^1 of 2 approved, 1 failed/)).toBeInTheDocument()
    expect(await screen.findByText('1 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    const dialog = await screen.findByRole('dialog', { name: `Approve 1 refund totalling ${formatPeso(a.amount)}?` })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve refunds' }))
    expect(await screen.findByText(`1 refund approved: ${formatPeso(a.amount)}`)).toBeInTheDocument()
    await waitFor(() => expect(figure('Pending')).toHaveTextContent(String(count('pending') - 2)))
  })

  it('shows who requested each request and who decided it on the cards, not only in the wide table', async () => {
    await renderPage()
    const list = within(screen.getByRole('list', { name: 'Refund requests' }))
    const pending = recent.slice(0, 10).find((r) => r.status === 'pending')!
    const decided = recent.slice(0, 10).find((r) => r.status !== 'pending')
    const card = (r: RefundRequest) => list.getAllByRole('listitem').find((li) => within(li).queryByText(r.requestNo))!
    expect(card(pending)).toHaveTextContent(`Requested by ${pending.requestedBy}`)
    expect(card(pending)).toHaveTextContent('Awaiting decision')
    if (decided) {
      expect(card(decided)).toHaveTextContent(`Decided ${formatOrderTime(decided.decidedAt!)} · ${decided.decidedBy}`)
    }
  })

  it('puts each request a fixed 1 to 4 hours after its order, and decides it after it was asked', () => {
    for (const r of original) {
      expect(Date.parse(r.requestedAt)).toBeGreaterThan(Date.parse(r.orderPlacedAt))
      expect(Date.parse(r.requestedAt)).toBeLessThanOrEqual(Date.now())
      if (r.decidedAt) expect(Date.parse(r.decidedAt) - Date.parse(r.requestedAt)).toBeGreaterThanOrEqual(30 * 60_000)
    }
    // A pending request is the order's own time plus a fixed offset, so it does not follow the clock.
    for (const r of original.filter((x) => x.status === 'pending')) {
      const hours = (Date.parse(r.requestedAt) - Date.parse(r.orderPlacedAt)) / 3_600_000
      expect(hours).toBeGreaterThanOrEqual(1)
      expect(hours).toBeLessThanOrEqual(4)
    }
  })

  it('shows the placeholder rows, not "No refund requests yet", while the list loads again after Clear filters', async () => {
    await renderPage()
    await userEvent.type(searchBox(), 'zzzz')
    expect(await screen.findByText('No refund requests match')).toBeInTheDocument()
    vi.mocked(service.listRefunds).mockImplementationOnce(() => new Promise(() => {}))
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(table()).toHaveAttribute('aria-busy', 'true'))
    await waitFor(() => expect(screen.queryByText('No refund requests match')).toBeNull())
    expect(screen.queryByText('No refund requests yet')).toBeNull()
    expect(bodyRows()).toHaveLength(10)
  })

  it('says a bulk approval failed because someone else decided, not because of the connection, and leaves nothing ticked', async () => {
    await renderPage()
    await showPending()
    const [a, b] = pendingOnes
    vi.mocked(service.approveRefund).mockRejectedValueOnce(Object.assign(new Error('conflict'), { kind: 'conflict' }))
    await userEvent.click(within(table()).getByRole('checkbox', { name: `Select ${a.requestNo}` }))
    await userEvent.click(within(table()).getByRole('checkbox', { name: `Select ${b.requestNo}` }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve refunds' }))

    expect(await screen.findByText('1 of 2 approved, 1 already decided by someone else, the list is refreshed.')).toBeInTheDocument()
    expect(screen.queryByText(/Check your connection/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByText(/ selected$/)).toBeNull()
  })

  it('returns focus to the row button when a sheet opened by clicking the row is closed with Escape', async () => {
    await renderPage()
    const request = recent[0]
    const row = rowOf(request)
    await userEvent.click(within(row).getByText(request.customerName))
    await screen.findByRole('dialog', { name: request.requestNo })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(row).getByRole('button', { name: request.requestNo })).toHaveFocus()
  })
})
