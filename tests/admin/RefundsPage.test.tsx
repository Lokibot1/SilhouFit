import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError, request } from '../../src/service/fetchProductList'
import { clearSession, setSession } from '../../src/service/session'
import { formatOrderTime, formatPeso } from '../../src/utils/format'
import { RefundsPage } from '../../src/views/admin/RefundsPage'
import { renderAdmin, setUpAdminDom } from '../shared/adminSession'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const PATH = '/admin/refunds'
const person = { id: 'u1', email: 'anne@example.com', firstName: 'Anne', lastName: 'Santos', fullName: 'Anne Santos', avatarUrl: null }
const refundRow = (n: number, over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-${String(900000 + n).padStart(12, '0')}`,
  orderId: `o${n}`,
  paymentTransactionId: `p${n}`,
  provider: 'paymongo',
  externalPaymentId: `pay_${n}`,
  externalRefundId: `ref_${n}`,
  amount: 1000 + n,
  currency: 'PHP',
  status: 'FAILED',
  reason: 'LATE_PAYMENT_ON_CANCELLED_ORDER',
  reasonNotes: null,
  triggerSource: 'SYSTEM_AUTO',
  resolutionType: 'PROVIDER_API',
  manualReference: null,
  failureCode: 'balance_low',
  failureMessage: 'The gateway balance is too low.',
  attemptCount: 1,
  nextRetryAt: null,
  createdAt: new Date(Date.UTC(2026, 9, 1, 2, 30) + n * 3_600_000).toISOString(),
  updatedAt: '2026-10-26T02:41:00.000Z',
  order: { id: `o${n}`, orderNumber: `SHF-0000${n}`, status: 'CANCELLED', paymentStatus: 'PAID', currency: 'PHP', totalAmount: 1000 + n, createdAt: '2026-10-26T02:25:00.000Z' },
  customer: person,
  initiatedBy: null,
  resolvedBy: null,
  ...over,
})
const rows = Array.from({ length: 12 }, (_, i) => refundRow(i + 1))
const metrics = { totalRefunds: 12, requestedCount: 1, processingCount: 2, succeededCount: 3, failedCount: 4, requiresManualActionCount: 5, cancelledCount: 1, totalRefundedVolume: 5200.5, pendingRefundLiabilityVolume: 1800, currency: 'PHP' }
const page = (data: unknown[], total = data.length) => ({ data, meta: { total, page: 1, limit: 10, totalPages: Math.max(1, Math.ceil(total / 10)), hasNextPage: false, hasPreviousPage: false } })

/** What the fake API answers: reads by path, and the next answer to a POST. */
const api = { list: page(rows.slice(0, 10), 12) as unknown, metrics: metrics as unknown, detail: { ...rows[0], rawProviderResponse: { data: { id: 'ref_1', client_key: 'secret-value' } } } as unknown, post: null as unknown }
const listCalls = () => send.mock.calls.filter(([method, path]) => method === 'GET' && path.startsWith('/admin/refunds?')).map(([, path]) => new URL(`http://x${path}`).searchParams)
const posts = () => send.mock.calls.filter(([method]) => method === 'POST')

beforeAll(setUpAdminDom)
beforeEach(() => {
  api.list = page(rows.slice(0, 10), 12)
  api.metrics = metrics
  api.detail = { ...rows[0], rawProviderResponse: { data: { id: 'ref_1', client_key: 'secret-value' } } }
  api.post = null
  send.mockImplementation(async (method, path) => {
    const answer = method === 'POST' ? api.post : path.startsWith('/admin/refunds?') ? api.list : path === '/admin/refunds/metrics' ? api.metrics : api.detail
    if (answer instanceof Error) throw answer
    return answer
  })
})
afterEach(() => {
  vi.resetAllMocks()
  act(() => clearSession())
})

const asRole = (role: 'staff' | 'admin') => act(() => setSession({ name: 'Dev User', email: 'dev@silhoufit.dev', role }))
// jsdom loads no CSS, so the table and the card list are both on screen: these look in the table.
const table = () => screen.getByRole('table')
const bodyRows = () => within(table()).getAllByRole('row').slice(1)
const cards = () => screen.getByRole('region', { name: 'Refunds at a glance' })
const figure = (label: string) => within(cards()).getByText(label).nextSibling
const searchBox = () => screen.getByRole('textbox', { name: 'Search refunds by order, customer, email or reference' })

async function renderPage() {
  renderAdmin(<RefundsPage />, PATH)
  await within(table()).findByText('SHF-00001')
  await within(cards()).findByText('Refunded')
}

async function openSheet(orderNumber = 'SHF-00001') {
  await userEvent.click(within(table()).getByRole('button', { name: orderNumber }))
  return screen.findByRole('dialog', { name: orderNumber })
}

describe('Refunds page', () => {
  it('shows the title, the four cards from the metrics and the first page of refunds', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Refunds' })).toBeInTheDocument()
    expect(document.title).toBe('Refunds — SilhouFit')
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content
    expect(meta.length).toBeGreaterThanOrEqual(150)
    expect(meta.length).toBeLessThanOrEqual(160)
    expect(screen.queryByText('Sample data')).toBeNull()

    expect(figure('Needs action')).toHaveTextContent('9')
    expect(figure('In progress')).toHaveTextContent('3')
    expect(figure('Refunded')).toHaveTextContent(formatPeso(5200.5))
    expect(within(cards()).getByText('3 refunds sent')).toBeInTheDocument()
    expect(figure('Still owed')).toHaveTextContent(formatPeso(1800))

    expect(bodyRows()).toHaveLength(10)
    const first = bodyRows()[0]
    expect(within(first).getByText(formatPeso(1001))).toBeInTheDocument()
    expect(within(first).getByText('Late payment on cancelled order')).toBeInTheDocument()
    expect(within(first).getByText('Anne Santos')).toBeInTheDocument()
    expect(within(first).getByText('Failed')).toBeInTheDocument()
    expect(within(first).getByText(formatOrderTime(rows[0].createdAt))).toBeInTheDocument()
    expect(screen.getByText('Displaying 1–10 of 12')).toBeInTheDocument()
    expect(listCalls()[0].get('sortBy')).toBe('createdAt')
    expect(listCalls()[0].get('sortOrder')).toBe('desc')
  })

  it('reserves a full page of placeholder rows while it loads', async () => {
    renderAdmin(<RefundsPage />, PATH)
    expect(bodyRows()).toHaveLength(10)
    expect(within(screen.getByRole('list', { name: 'Refunds' })).getAllByRole('listitem')).toHaveLength(10)
    await within(table()).findByText('SHF-00001')
  })

  it('keeps each section on its own: the figures fail and retry while the list shows', async () => {
    api.metrics = new ProductListError('network')
    renderAdmin(<RefundsPage />, PATH)
    await within(table()).findByText('SHF-00001')
    const alert = await screen.findByText("We couldn't load the refund figures.")
    expect(alert).toBeInTheDocument()
    api.metrics = metrics
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await within(cards()).findByText('Still owed')).toBeInTheDocument()
  })

  it('shows an error with Retry when the list fails, and loads it on retry', async () => {
    api.list = new ProductListError('server')
    renderAdmin(<RefundsPage />, PATH)
    expect(await screen.findByText("We couldn't load the refunds.")).toBeInTheDocument()
    api.list = page(rows.slice(0, 10), 12)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await within(table()).findByText('SHF-00001')).toBeInTheDocument()
  })

  it('says where refunds come from when there are none, and offers Clear filters when a filter finds none', async () => {
    api.list = page([], 0)
    renderAdmin(<RefundsPage />, PATH)
    expect(await screen.findByText('No refunds yet')).toBeInTheDocument()
    expect(screen.getByText('Late payments on cancelled orders are refunded automatically and appear here.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Failed' }))
    expect(await screen.findByText('No refunds match')).toBeInTheDocument()
    api.list = page(rows.slice(0, 10), 12)
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await within(table()).findByText('SHF-00001')).toBeInTheDocument()
    expect(listCalls().at(-1)!.has('status')).toBe(false)
  })

  it('sends the status tab, the debounced search and the sort as query keys, only when set', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('tab', { name: 'Needs action' }))
    await waitFor(() => expect(listCalls().at(-1)!.get('status')).toBe('REQUIRES_MANUAL_ACTION'))
    const before = listCalls().length
    await userEvent.type(searchBox(), 'anne')
    expect(listCalls()).toHaveLength(before)
    await waitFor(() => expect(listCalls().at(-1)!.get('search')).toBe('anne'))
    expect(listCalls().length).toBe(before + 1)
    expect([...listCalls().at(-1)!.keys()]).toEqual(['page', 'limit', 'status', 'search', 'sortBy', 'sortOrder'])

    await userEvent.click(within(table()).getByRole('button', { name: 'Amount' }))
    await waitFor(() => expect(listCalls().at(-1)!.get('sortBy')).toBe('amount'))
    expect(listCalls().at(-1)!.get('sortOrder')).toBe('asc')
    await userEvent.click(within(table()).getByRole('button', { name: 'Amount' }))
    await waitFor(() => expect(listCalls().at(-1)!.get('sortOrder')).toBe('desc'))
    await userEvent.click(within(table()).getByRole('button', { name: 'Created' }))
    await waitFor(() => expect(listCalls().at(-1)!.get('sortBy')).toBe('createdAt'))
  })

  it('caps the search at 60 characters', async () => {
    await renderPage()
    expect(searchBox()).toHaveAttribute('maxlength', '60')
  })
})

describe('the refund sheet', () => {
  it('shows the facts, the failure and the gateway response with secrets hidden, and no actions for staff', async () => {
    asRole('staff')
    await renderPage()
    const dialog = await openSheet()
    expect(await within(dialog).findByText('Why it failed')).toBeInTheDocument()
    expect(within(dialog).getByText('The gateway balance is too low.')).toBeInTheDocument()
    expect(within(dialog).getByText('Automatic')).toBeInTheDocument()
    expect(within(dialog).getByText('System')).toBeInTheDocument()
    expect(within(dialog).getByText('pay_1')).toBeInTheDocument()
    expect(within(dialog).getByText(/"client_key": "\[hidden\]"/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/secret-value/)).toBeNull()
    for (const name of ['Retry refund', 'Check with gateway', 'Mark as refunded']) expect(within(dialog).queryByRole('button', { name })).toBeNull()
  })

  it('explains why the refund exists and where it stands, with the attempts out of 5 and the next automatic retry', async () => {
    asRole('staff')
    api.detail = { ...rows[0], attemptCount: 2, nextRetryAt: '2026-10-26T07:42:00.000Z', rawProviderResponse: null }
    await renderPage()
    const dialog = await openSheet()
    await within(dialog).findByText('Why it failed')
    expect(within(dialog).getByText('The gateway did not take it. It is retried automatically.')).toBeInTheDocument()
    expect(within(dialog).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Next automatic retry at 3:42 PM')).toBeInTheDocument()
    expect(within(dialog).getByText('Automatic')).toBeInTheDocument()
    expect(within(dialog).getByText('2 of 5')).toBeInTheDocument()
    expect(within(dialog).getByText('Late payment on cancelled order')).toBeInTheDocument()
  })

  it.each([
    ['REQUESTED', 'Waiting to be sent to the gateway.'],
    ['PROCESSING', 'Sent to the gateway and settling. Use Check with gateway to see where it stands.'],
    ['REQUIRES_MANUAL_ACTION', 'Needs an admin: the automatic attempts could not finish it.'],
    ['SUCCEEDED', 'The money was sent back to the customer.'],
    ['CANCELLED', 'This refund was cancelled, so no money was sent.'],
  ])('says in plain words what %s means', async (status, words) => {
    asRole('admin')
    api.detail = { ...rows[0], status, nextRetryAt: '2026-10-26T07:42:00.000Z', rawProviderResponse: null }
    await renderPage()
    const dialog = await openSheet()
    expect(await within(dialog).findByText(words)).toBeInTheDocument()
    expect(within(dialog).queryByText(/Next automatic retry/)).toBeNull()
  })

  it('says the automatic attempts are used up when they are, and promises no retry', async () => {
    asRole('staff')
    api.detail = { ...rows[0], attemptCount: 5, nextRetryAt: null, rawProviderResponse: null }
    await renderPage()
    const dialog = await openSheet()
    expect(await within(dialog).findByText('The gateway did not take it, and the automatic attempts are used up.')).toBeInTheDocument()
    expect(within(dialog).queryByText(/Next automatic retry/)).toBeNull()
  })

  it('has a loading state and an error state with Retry of its own', async () => {
    asRole('admin')
    await renderPage()
    api.detail = new ProductListError('network')
    const dialog = await openSheet()
    expect(await within(dialog).findByText("We couldn't load the refund details.")).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Retry refund' })).toBeNull()
    api.detail = { ...rows[0], rawProviderResponse: null }
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retry' }))
    expect(await within(dialog).findByText('Why it failed')).toBeInTheDocument()
    expect(within(dialog).getByText('Gateway response (JSON)')).toBeInTheDocument()
  })

  it('offers only the actions the status allows', async () => {
    asRole('admin')
    await renderPage()
    api.detail = { ...rows[0], status: 'SUCCEEDED', failureCode: null, failureMessage: null, rawProviderResponse: null }
    const dialog = await openSheet()
    await within(dialog).findByText('Refund ref')
    for (const name of ['Retry refund', 'Check with gateway', 'Mark as refunded']) expect(within(dialog).queryByRole('button', { name })).toBeNull()
  })

  it('asks "Are you sure?" before a retry, and a retry the gateway refused is shown inline, not as a success', async () => {
    asRole('admin')
    await renderPage()
    const dialog = await openSheet()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Retry refund' }))
    expect(within(dialog).getByText('Are you sure?')).toBeInTheDocument()
    expect(within(dialog).getByText(/asks the gateway to send/)).toBeInTheDocument()
    expect(posts()).toHaveLength(0)
    api.post = { ...rows[0], status: 'FAILED', failureMessage: 'Card issuer declined the refund.', rawProviderResponse: null }
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retry refund' }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent("The gateway didn't accept the retry.")
    expect(alert).toHaveTextContent('Card issuer declined the refund.')
    expect(alert).toHaveTextContent('You can retry the refund once the cause is fixed.')
    expect(screen.queryByText(/is complete/)).toBeNull()
    expect(posts()[0].slice(0, 3)).toEqual(['POST', '/admin/refunds/' + rows[0].id + '/retry', undefined])
  })

  it('shows an info toast for a retry the gateway is still working on', async () => {
    asRole('admin')
    await renderPage()
    const dialog = await openSheet()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Retry refund' }))
    api.post = { ...rows[0], status: 'PROCESSING', failureCode: null, failureMessage: null, rawProviderResponse: null }
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retry refund' }))
    expect(await screen.findByText('Sent to the gateway; it will update when it settles.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('alert')).toBeNull()
  })

  it('checks with the gateway without asking, and says when it is done', async () => {
    asRole('admin')
    await renderPage()
    const dialog = await openSheet()
    api.post = { ...rows[0], status: 'SUCCEEDED', failureCode: null, failureMessage: null, rawProviderResponse: null }
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Check with gateway' }))
    expect(await screen.findByText(/Refund for order SHF-00001 is complete/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Retry refund' })).toBeNull()
  })

  it("shows the server's own sentence for a 409 and a 400", async () => {
    asRole('admin')
    await renderPage()
    const dialog = await openSheet()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Retry refund' }))
    api.post = new ProductListError('conflict', 'This refund was already submitted to the gateway. Use sync instead.', 409)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retry refund' }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't retry the refund.")
    expect(alert).toHaveTextContent('This refund was already submitted to the gateway. Use sync instead.')
  })

  it('closes the sheet, says so and loads the list again when the refund is gone (404)', async () => {
    asRole('admin')
    await renderPage()
    const dialog = await openSheet()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Check with gateway' }))
    const before = listCalls().length
    api.post = new ProductListError('not-found', 'Refund not found', 404)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check with gateway' }))
    expect(await screen.findByText('That refund no longer exists, so the list was refreshed.')).toBeInTheDocument()
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(before))
  })

  it('uses the standard copy for a dropped connection', async () => {
    asRole('admin')
    await renderPage()
    const dialog = await openSheet()
    api.post = new ProductListError('network')
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Check with gateway' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The connection dropped before we got a response.')
  })
})

describe('Mark as refunded', () => {
  async function openForm() {
    asRole('admin')
    await renderPage()
    const dialog = await openSheet()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Mark as refunded' }))
    return dialog
  }

  it('needs a reference, counts characters, strips emoji, and asks "Are you sure?" with the warning before sending', async () => {
    const dialog = await openForm()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review' }))
    expect(await within(dialog).findByText(/^Enter the reference of the payment/)).toBeInTheDocument()
    expect(posts()).toHaveLength(0)

    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Reference/ }), 'BDO 👍 1234')
    expect(within(dialog).getByRole('textbox', { name: /^Reference/ })).toHaveValue('BDO 1234')
    expect(within(dialog).getByText('8/128')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Notes/ }), 'Paid at the counter')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review' }))
    expect(within(dialog).getByText('Are you sure?')).toBeInTheDocument()
    expect(within(dialog).getByText("Use this only after the money was returned outside SilhouFit. This can't be undone.")).toBeInTheDocument()
    expect(posts()).toHaveLength(0)

    api.post = { ...rows[0], status: 'SUCCEEDED', manualReference: 'BDO 1234', failureCode: null, failureMessage: null, rawProviderResponse: null }
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark as refunded' }))
    expect(await screen.findByText('Refund for order SHF-00001 marked as refunded.')).toBeInTheDocument()
    expect(posts()[0]).toEqual(['POST', `/admin/refunds/${rows[0].id}/resolve-manual`, { manualReference: 'BDO 1234', notes: 'Paid at the counter' }])
    expect(within(dialog).queryByRole('button', { name: 'Mark as refunded' })).toBeNull()
  })

  it("shows the server's sentence for a refund the gateway is still working on", async () => {
    const dialog = await openForm()
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Reference/ }), 'BDO-1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review' }))
    api.post = new ProductListError('conflict', 'Refund is PROCESSING. Sync with the provider first.', 409)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark as refunded' }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't mark the refund as refunded.")
    expect(alert).toHaveTextContent('Sync with the provider first.')
    expect(within(dialog).getByRole('textbox', { name: /^Reference/ })).toHaveValue('BDO-1')
  })
})
