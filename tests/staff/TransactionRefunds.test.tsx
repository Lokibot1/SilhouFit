import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminOrderDrawer } from '../../src/components/staff/orders/AdminOrderDrawer'
import { TransactionDrawer } from '../../src/components/staff/transactions/TransactionDrawer'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import type { AdminOrderRow } from '../../src/service/adminOrdersApi'
import type { AdminTransactionRow } from '../../src/service/adminTransactionsApi'
import { ProductListError, request } from '../../src/service/fetchProductList'
import { clearSession } from '../../src/service/session'
import { formatPlacedAt } from '../../src/utils/format'
import { apiOrder, ORDER_ID } from '../fixtures/orders'

// A real (not simulated) account: every read and write goes through the mocked `request`.
vi.mock('../../src/service/ordersApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/ordersApi')>()),
  usesSampleOrders: () => false,
}))
vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const PAYMENT_ID = '00000000-0000-4000-9000-000000000001'
const row: AdminTransactionRow = {
  id: PAYMENT_ID,
  orderId: ORDER_ID,
  orderNumber: 'SF-10001',
  orderStatus: 'CANCELLED',
  customerName: 'Maria Santos',
  customerEmail: 'maria@example.com',
  provider: 'paymongo',
  reference: 'pay_SF-10001',
  method: 'GCASH',
  status: 'PAID',
  amount: 4580,
  fee: null,
  net: null,
  at: '2026-10-22T07:45:00.000Z',
}
const customer = { id: 'u1', email: 'maria@example.com', firstName: 'Maria', lastName: 'Santos', fullName: 'Maria Santos', avatarUrl: null }
const refundEntry = (n: number, over: Record<string, unknown> = {}) => ({
  id: `r${n}`,
  paymentTransactionId: PAYMENT_ID,
  provider: 'paymongo',
  externalRefundId: `ref_${n}`,
  amount: 1000,
  currency: 'PHP',
  status: 'SUCCEEDED',
  reason: 'LATE_PAYMENT_ON_CANCELLED_ORDER',
  resolutionType: 'PROVIDER_API',
  manualReference: null,
  failureCode: null,
  succeededAt: '2026-10-23T03:00:00.000Z',
  createdAt: '2026-10-23T02:30:00.000Z',
  ...over,
})
const apiTransaction = (over: Record<string, unknown> = {}) => ({
  id: PAYMENT_ID,
  orderId: ORDER_ID,
  provider: 'paymongo',
  externalPaymentId: 'pay_SF-10001',
  amount: 4580,
  fee: null,
  netAmount: null,
  paymentMethod: 'GCASH',
  status: 'PAID',
  createdAt: row.at,
  updatedAt: row.at,
  rawPayload: {},
  order: { id: ORDER_ID, orderNumber: 'SF-10001', status: 'CANCELLED', paymentStatus: 'PAID', currency: 'PHP', totalAmount: 4580, createdAt: row.at },
  customer,
  refundedAmount: 1000,
  refunds: [refundEntry(1), refundEntry(2, { amount: 500, status: 'CANCELLED', succeededAt: null })],
  ...over,
})

const api = { transaction: apiTransaction() as unknown, order: null as unknown }

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  api.transaction = apiTransaction()
  api.order = null
  send.mockImplementation(async (_method, path) => {
    const answer = path.startsWith('/admin/orders/') ? api.order : api.transaction
    if (answer instanceof Error) throw answer
    return answer
  })
})
afterEach(() => {
  vi.resetAllMocks()
  act(() => clearSession())
})

function renderDrawer(over: Partial<AdminTransactionRow> = {}) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <TransactionDrawer transaction={{ ...row, ...over }} open session={1} onClose={() => {}} />
      </MemoryRouter>
    </ToastProvider>,
  )
}
const drawer = () => screen.findByRole('dialog', { name: 'SF-10001' })

describe('the refunds in the transaction drawer', () => {
  it('shows what was refunded, and each refund with its status in words, its amount and a 12-hour time', async () => {
    renderDrawer()
    const dialog = await drawer()
    expect(await within(dialog).findByText('Refunded ₱1,000.00')).toBeInTheDocument()
    const list = within(dialog).getByRole('list', { name: 'Refunds' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Refunded')).toBeInTheDocument()
    expect(within(items[0]).getByText('₱1,000.00')).toBeInTheDocument()
    expect(within(items[0]).getByText(new RegExp(formatPlacedAt('2026-10-23T02:30:00.000Z')))).toBeInTheDocument()
    expect(within(items[1]).getByText('Cancelled')).toBeInTheDocument()
    expect(within(items[1]).getByText('₱500.00')).toBeInTheDocument()
  })

  it('says there are none, also when an older API sends no refund fields', async () => {
    api.transaction = apiTransaction({ refundedAmount: undefined, refunds: undefined })
    renderDrawer()
    expect(await within(await drawer()).findByText('No refunds yet.')).toBeInTheDocument()
  })

  it('shows a loading state, then an error with Retry', async () => {
    api.transaction = new ProductListError('network')
    renderDrawer()
    const dialog = await drawer()
    expect(await within(dialog).findByText("We couldn't load the payment details.")).toBeInTheDocument()
    api.transaction = apiTransaction()
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Retry' })[0])
    expect(await within(dialog).findByText('Refunded ₱1,000.00')).toBeInTheDocument()
  })
})

describe('the refunds in the order drawer', () => {
  const order: AdminOrderRow = {
    id: ORDER_ID,
    orderNumber: 'SHF-20261026-ABC123',
    customerName: 'Anne Santos',
    customerEmail: 'anne@example.com',
    status: 'CANCELLED',
    paymentStatus: 'PARTIALLY_REFUNDED',
    total: 3879,
    itemCount: 1,
    shipmentStatus: null,
    placedAt: '2026-10-26T02:30:00.000Z',
  }
  const apiDetail = (over: Record<string, unknown> = {}) => ({ ...apiOrder({ status: 'CANCELLED', paymentStatus: 'PARTIALLY_REFUNDED' }), customer, internalNotes: null, shipmentEvents: [], paymentTransactions: [], ...over })
  const renderOrder = () =>
    render(
      <ToastProvider>
        <MemoryRouter>
          <AdminOrderDrawer order={order} open session={1} onClose={() => {}} onChanged={() => {}} />
        </MemoryRouter>
      </ToastProvider>,
    )

  it('lists them with the total refunded, and reads a cancelled order with a refunded payment as one fact', async () => {
    api.order = apiDetail({ refundedAmount: 1000, refunds: [refundEntry(1), refundEntry(2, { status: 'FAILED', amount: 700, failureCode: 'x', succeededAt: null })] })
    renderOrder()
    const dialog = await screen.findByRole('dialog', { name: order.orderNumber })
    expect(await within(dialog).findByText('Refunded ₱1,000.00')).toBeInTheDocument()
    const items = within(within(dialog).getByRole('list', { name: 'Refunds' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[1]).getByText('Failed')).toBeInTheDocument()
    expect(within(dialog).getByText('Cancelled, payment partly refunded')).toBeInTheDocument()
  })

  it('says there are none', async () => {
    api.order = apiDetail()
    renderOrder()
    expect(await within(await screen.findByRole('dialog', { name: order.orderNumber })).findByText('No refunds yet.')).toBeInTheDocument()
  })
})
