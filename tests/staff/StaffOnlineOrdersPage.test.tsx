import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import type { AdminOrderDetail, AdminOrderMetrics, AdminOrderRow, AdminOrdersPage } from '../../src/service/adminOrdersApi'
import { ProductListError } from '../../src/service/fetchProductList'
import { customerOrder, orderItem } from '../fixtures/orders'

vi.mock('../../src/service/adminOrdersApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/adminOrdersApi')>()),
  fetchAdminOrders: vi.fn(),
  fetchAdminOrder: vi.fn(),
  fetchAdminOrderMetrics: vi.fn(),
  updateAdminOrder: vi.fn(),
  dispatchOrder: vi.fn(),
  cancelDelivery: vi.fn(),
}))

const api = await import('../../src/service/adminOrdersApi')
const { StaffOnlineOrdersPage } = await import('../../src/views/staff/StaffOnlineOrdersPage')

const list = vi.mocked(api.fetchAdminOrders)
const metrics = vi.mocked(api.fetchAdminOrderMetrics)
const detail = vi.mocked(api.fetchAdminOrder)
const update = vi.mocked(api.updateAdminOrder)
const dispatch = vi.mocked(api.dispatchOrder)

const COUNTS: AdminOrderMetrics = { pendingPaymentCount: 4, processingCount: 3, dispatchedCount: 2, deliveredTodayCount: 1, totalRevenue: 12500 }

const row = (n: number, over: Partial<AdminOrderRow> = {}): AdminOrderRow => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  orderNumber: `SHF-20261026-00000${n}`,
  customerName: `Customer ${n}`,
  customerEmail: `customer${n}@example.com`,
  status: 'PAID',
  paymentStatus: 'PAID',
  total: 3879,
  itemCount: 2,
  shipmentStatus: null,
  // 10:30 AM in Manila.
  placedAt: '2026-10-26T02:30:00.000Z',
  ...over,
})

const answer = (data: AdminOrderRow[], total = data.length, page = 1): AdminOrdersPage => ({ data, meta: { total, page, limit: 25, totalPages: Math.max(1, Math.ceil(total / 25)), hasNextPage: false } })

const detailOf = (r: AdminOrderRow, over: Partial<AdminOrderDetail> = {}): AdminOrderDetail => ({
  ...customerOrder({ id: r.id, orderNumber: r.orderNumber, status: r.status, paymentStatus: r.paymentStatus, total: r.total, createdAt: r.placedAt }),
  customer: { name: r.customerName, email: r.customerEmail ?? '' },
  adminNotes: null,
  items: [{ ...orderItem(), stock: 7 }, { ...orderItem({ id: 'i2', name: 'Camp Shirt', variantId: null }), stock: null }],
  shipment: { courier: 'Lalamove', serviceType: 'Motorcycle', status: 'PENDING_DISPATCH', trackingUrl: null, driverName: null, driverPhone: null, driverPlate: null, deliveryFee: 99, pickupTime: null, deliveredAt: null, externalOrderId: null },
  payments: [{ id: 'p1', provider: 'paymongo', method: 'GCASH', amount: 3879, fee: 100, net: 3779, status: 'PAID', at: '2026-10-26T02:40:00.000Z' }],
  events: [],
  ...over,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

beforeEach(() => {
  vi.resetAllMocks()
  const orders = [row(1), row(2, { status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID' })]
  list.mockResolvedValue(answer(orders))
  metrics.mockResolvedValue(COUNTS)
  detail.mockImplementation(async (id) => detailOf(orders.find((r) => r.id === id)!))
})

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

function renderPage(path = '/staff/online-orders') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Where />
        <Routes>
          <Route path="/staff/online-orders" element={<StaffOnlineOrdersPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

const lastQuery = () => list.mock.lastCall?.[0]
const openOrder = async (n: number) => {
  await userEvent.click((await screen.findAllByRole('button', { name: `SHF-20261026-00000${n}` }))[0])
  return screen.findByRole('dialog', { name: `SHF-20261026-00000${n}` })
}

describe('Online orders page', () => {
  it('shows a skeleton for the counts and the list while they load, then the real figures', async () => {
    const counts = deferred<AdminOrderMetrics>()
    const orders = deferred<AdminOrdersPage>()
    metrics.mockReturnValue(counts.promise)
    list.mockReturnValue(orders.promise)
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading order counts' })).toBeInTheDocument()
    expect(screen.getByText('Loading orders')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /SHF-/ })).not.toBeInTheDocument()
    counts.resolve(COUNTS)
    orders.resolve(answer([row(1)]))
    expect(await screen.findAllByText('SHF-20261026-000001')).not.toHaveLength(0)
    const strip = screen.getByLabelText('Order counts across all orders')
    expect(strip).toHaveTextContent('Awaiting payment')
    expect(strip).toHaveTextContent('Preparing')
    expect(strip).toHaveTextContent('On the way')
    expect(strip).toHaveTextContent('Delivered today')
    expect(strip).toHaveTextContent('₱12,500')
    expect(strip).toHaveTextContent('All orders')
  })

  it('lists the orders newest first with both chips, the customer, the 12-hour time and the total', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: /Orders, newest first/ })
    const first = within(table).getAllByRole('row')[1]
    expect(first).toHaveTextContent('SHF-20261026-000001')
    expect(first).toHaveTextContent('Customer 1')
    expect(first).toHaveTextContent('customer1@example.com')
    expect(first).toHaveTextContent('Paid')
    // Order status and payment status read the same, so one chip says it.
    expect(within(first).getAllByText('Paid')).toHaveLength(1)
    expect(within(within(table).getAllByRole('row')[2]).getAllByText('Awaiting payment')).toHaveLength(1)
    expect(first).toHaveTextContent('Oct 26, 2026, 10:30 AM')
    expect(first).toHaveTextContent('₱3,879.00')
    expect(within(table).getAllByRole('row')[2]).toHaveTextContent('Awaiting payment')
    expect(within(table).queryByRole('button', { name: /sort/i })).not.toBeInTheDocument()
    expect(lastQuery()).toEqual({ page: 1, limit: 25, status: undefined, paymentStatus: undefined, from: undefined, to: undefined, search: undefined })
  })

  it('asks the API for the filters in the URL and ignores values it does not know', async () => {
    renderPage('/staff/online-orders?status=PROCESSING&payment=PAID&range=today&per=50&page=2&q=anne')
    await screen.findAllByText('SHF-20261026-000001')
    expect(lastQuery()).toMatchObject({ page: 2, limit: 50, status: 'PROCESSING', paymentStatus: 'PAID', search: 'anne' })
    expect(lastQuery()?.from).toBe(lastQuery()?.to)
    list.mockClear()
    renderPage('/staff/online-orders?status=TELEPORTED&payment=nope&sort=total')
    await waitFor(() => expect(list).toHaveBeenCalled())
    expect(lastQuery()).toMatchObject({ status: undefined, paymentStatus: undefined })
  })

  it('searches once typing pauses', async () => {
    renderPage()
    await screen.findAllByText('SHF-20261026-000001')
    await userEvent.type(screen.getByRole('textbox', { name: /Search orders/ }), 'anne')
    expect(list).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(lastQuery()).toMatchObject({ search: 'anne', page: 1 }), { timeout: 2000 })
    expect(screen.getByTestId('where')).toHaveTextContent('q=anne')
  })

  it('says there are no orders yet, with no filters to clear', async () => {
    list.mockResolvedValue(answer([]))
    renderPage()
    expect(await screen.findByText('No orders yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('says no orders match, hints at the spelling and clears the filters', async () => {
    list.mockResolvedValue(answer([]))
    renderPage('/staff/online-orders?q=zzz&status=PAID')
    expect(await screen.findByText('No orders match')).toBeInTheDocument()
    expect(screen.getByText(/Check the spelling/)).toBeInTheDocument()
    list.mockResolvedValue(answer([row(1)]))
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' }).at(-1)!)
    expect(await screen.findAllByText('SHF-20261026-000001')).not.toHaveLength(0)
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/staff\/online-orders$/)
  })

  it('offers the first page when the page asked for is past the end', async () => {
    list.mockResolvedValueOnce(answer([], 5, 9))
    renderPage('/staff/online-orders?page=9')
    expect(await screen.findByText('There are no orders on page 9.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Go to the first page' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/staff\/online-orders$/)
    expect((await screen.findAllByText('SHF-20261026-000001')).length).toBeGreaterThan(0)
  })

  it('fails the list on its own with a Retry while the counts still load', async () => {
    const counts = deferred<AdminOrderMetrics>()
    metrics.mockReturnValue(counts.promise)
    list.mockRejectedValueOnce(new ProductListError('network'))
    renderPage()
    expect(await screen.findByText("We couldn't load the orders.")).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading order counts' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect((await screen.findAllByText('SHF-20261026-000001')).length).toBeGreaterThan(0)
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('fails the counts on their own with a Retry while the list shows', async () => {
    metrics.mockRejectedValueOnce(new ProductListError('server'))
    renderPage()
    expect(await screen.findByText("We couldn't load the order counts.")).toBeInTheDocument()
    expect((await screen.findAllByText('SHF-20261026-000001')).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('₱12,500')).toBeInTheDocument()
  })

  it('opens an order with its customer, items and stock, payments and delivery', async () => {
    renderPage()
    const drawer = await openOrder(1)
    expect(detail).toHaveBeenCalledWith(row(1).id, expect.anything())
    expect(await within(drawer).findByText('In stock now: 7')).toBeInTheDocument()
    expect(within(drawer).getByText('Variant deleted')).toBeInTheDocument()
    expect(within(drawer).getByText('customer1@example.com')).toBeInTheDocument()
    expect(within(drawer).getByText('Paymongo · GCash')).toBeInTheDocument()
    expect(within(drawer).getByText('No courier updates yet.')).toBeInTheDocument()
    expect(within(drawer).getByText('Ready to book')).toBeInTheDocument()
  })

  it('moves a paid order on with an action verb and refreshes the list and the counts', async () => {
    renderPage()
    const drawer = await openOrder(1)
    update.mockResolvedValue(detailOf(row(1, { status: 'PROCESSING' })))
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Mark as preparing' }))
    expect(update).toHaveBeenCalledWith(row(1).id, { status: 'PROCESSING' })
    expect(await screen.findByText('Order marked as preparing')).toBeInTheDocument()
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    expect(metrics).toHaveBeenCalledTimes(2)
    expect(detail).toHaveBeenCalledTimes(2)
  })

  it('offers no way forward for an unpaid order and says why a rider cannot be booked', async () => {
    renderPage()
    const drawer = await openOrder(2)
    expect(await within(drawer).findByText('Book a rider once the payment is confirmed.')).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Book rider' })).toBeDisabled()
    expect(within(drawer).queryByRole('button', { name: /^Mark/ })).not.toBeInTheDocument()
  })

  it('says a closed order is closed', async () => {
    list.mockResolvedValue(answer([row(1, { status: 'DELIVERED' })]))
    detail.mockResolvedValue(detailOf(row(1, { status: 'DELIVERED' })))
    renderPage()
    const drawer = await openOrder(1)
    expect(await within(drawer).findByText('This order is closed.')).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('asks "Are you sure?" before cancelling a paid order, warns about the payment, and cancels with the reason', async () => {
    renderPage()
    const drawer = await openOrder(1)
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Cancel order' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cancel order SHF-20261026-000001?' })
    expect(within(dialog).getByText('Are you sure?')).toBeInTheDocument()
    expect(within(dialog).getByText('Stock goes back to inventory and any open payment link expires.')).toBeInTheDocument()
    expect(within(dialog).getByText('The payment is not refunded automatically.')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Reason/ }), '  Customer asked  ')
    expect(within(dialog).getByText('18/255')).toBeInTheDocument()
    update.mockResolvedValue(detailOf(row(1, { status: 'CANCELLED' })))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }))
    expect(update).toHaveBeenCalledWith(row(1).id, { status: 'CANCELLED', cancellationReason: 'Customer asked' })
    expect(await screen.findByText('Order cancelled')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Cancel order SHF/ })).not.toBeInTheDocument())
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  })

  it('does not warn about a refund when the order was not paid, and keeps the dialog open with the reason on failure', async () => {
    renderPage()
    const drawer = await openOrder(2)
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Cancel order' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cancel order SHF-20261026-000002?' })
    expect(within(dialog).queryByText('The payment is not refunded automatically.')).not.toBeInTheDocument()
    update.mockRejectedValue(new ProductListError('validation', 'Order SHF-20261026-000002 is in terminal status "CANCELLED".', 400))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The order was not cancelled. Order SHF-20261026-000002 is in terminal status "CANCELLED".')
    expect(dialog).toBeInTheDocument()
  })

  it('books a rider, and when Lalamove does not answer shows the fixed copy with a Retry', async () => {
    renderPage()
    const drawer = await openOrder(1)
    dispatch.mockRejectedValueOnce(new ProductListError('server', 'upstream: LLM_ERR_503', 502))
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Book rider' }))
    const toast = await screen.findByRole('alert')
    expect(toast).toHaveTextContent("Lalamove didn't answer, so no rider was booked. Try again in a few minutes.")
    expect(toast).not.toHaveTextContent(/LLM_ERR/)
    // The order is read again either way.
    await waitFor(() => expect(detail).toHaveBeenCalledTimes(2))
    dispatch.mockResolvedValueOnce(undefined)
    await userEvent.click(within(toast).getByRole('button', { name: 'Retry' }))
    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('Rider booked')).toBeInTheDocument()
  })

  it('explains the Lalamove window when Cancel delivery is refused, and saves notes', async () => {
    const booked = detailOf(row(1, { status: 'DISPATCHED' }), { shipment: { ...detailOf(row(1)).shipment!, status: 'ASSIGNING_DRIVER', externalOrderId: 'LLM-1' } })
    list.mockResolvedValue(answer([row(1, { status: 'DISPATCHED' })]))
    detail.mockResolvedValue(booked)
    renderPage()
    const drawer = await openOrder(1)
    expect(await within(drawer).findByText('Cancel the delivery first.')).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Cancel order' })).toBeDisabled()
    vi.mocked(api.cancelDelivery).mockRejectedValue(new ProductListError('conflict', undefined, 409))
    await userEvent.click(within(drawer).getByRole('button', { name: 'Cancel delivery' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cancel the delivery for SHF-20261026-000001?' })
    expect(within(dialog).getByText('The order goes back to Preparing so you can book again.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel delivery' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Lalamove only lets you cancel while it is finding a driver or within 5 minutes of a match. Contact Lalamove support to cancel this delivery.')
  })

  it('saves staff notes only once they changed', async () => {
    renderPage()
    const drawer = await openOrder(1)
    const save = await within(drawer).findByRole('button', { name: 'Save notes' })
    expect(save).toBeDisabled()
    await userEvent.type(within(drawer).getByRole('textbox', { name: 'Staff notes' }), '  Call first  ')
    expect(within(drawer).getByText('14/500')).toBeInTheDocument()
    update.mockResolvedValue(detailOf(row(1), { adminNotes: 'Call first' }))
    await userEvent.click(save)
    expect(update).toHaveBeenCalledWith(row(1).id, { adminNotes: 'Call first' })
    expect(await screen.findByText('Notes saved')).toBeInTheDocument()
  })
})
