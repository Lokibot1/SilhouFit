import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionDrawer } from '../../src/components/staff/transactions/TransactionDrawer'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { fetchAdminOrder } from '../../src/service/adminOrdersApi'
import { fetchAdminTransaction, type AdminTransactionDetail, type AdminTransactionRow } from '../../src/service/adminTransactionsApi'
import type { TransactionDetail } from '../../src/service/fetchTransactions'
import { invoiceNoFor, resetSampleInvoices, setSampleMerchant } from '../../src/service/sampleInvoices'
import { adminOrderDetail } from '../fixtures/orders'
import { sampleAdminTransaction, sampleTransactionDetail } from '../../src/service/sampleTransactions'
import { INVOICE_NOTICE, RETURN_NOTICE } from '../../src/utils/invoiceTax'

// A simulated account by default: the drawer reads the sample payment and the order's items, and offers the Invoice. `account.sample` flips it to a real one.
const account = vi.hoisted(() => ({ sample: true }))
vi.mock('../../src/service/ordersApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/ordersApi')>()),
  usesSampleOrders: () => account.sample,
}))
vi.mock('../../src/service/adminOrdersApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/adminOrdersApi')>()),
  fetchAdminOrder: vi.fn(),
}))
vi.mock('../../src/service/adminTransactionsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/adminTransactionsApi')>()),
  fetchAdminTransaction: vi.fn(),
}))
vi.mock('../../src/service/sampleTransactions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/sampleTransactions')>()),
  sampleAdminTransaction: vi.fn(),
  sampleTransactionDetail: vi.fn(),
}))
const pdf = vi.hoisted(() => ({ render: vi.fn(), chunkFails: false }))
// A getter, so that reading the export can fail the way a chunk that never loaded does.
vi.mock('../../src/utils/invoicePdf', () => ({
  get renderInvoicePdf() {
    if (pdf.chunkFails) throw new Error('Failed to fetch dynamically imported module')
    return pdf.render
  },
}))

const transaction: AdminTransactionRow = {
  id: '00000000-0000-4000-9000-000000000001',
  orderId: '00000000-0000-4000-8000-000000000001',
  orderNumber: 'SF-10001',
  orderStatus: 'PAID',
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
const payment: AdminTransactionDetail = { ...transaction, orderTotal: 4580, updatedAt: '2026-10-22T07:45:00.000Z', payload: { sample: true } }
const detail: TransactionDetail = {
  id: transaction.orderId,
  orderNo: 'SF-10001',
  customerName: 'Maria Santos',
  placedAt: '2026-10-22T07:45:00.000Z',
  itemCount: 3,
  total: 4580,
  subtotal: 4580,
  paymentMethod: 'gcash',
  lines: [
    { productId: 'p1', name: 'Heritage Polo', category: 'Hoodie', units: 2, unitPrice: 1290 },
    { productId: 'p2', name: 'Fence-Line Blazer', category: 'Hoodie', units: 1, unitPrice: 2000, vatClass: 'exempt' },
  ],
}

const render_ = pdf.render
const saved: { name: string; blob: Blob }[] = []

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  URL.createObjectURL = vi.fn((blob: Blob) => {
    saved.push({ name: '', blob })
    return 'blob:test'
  })
  URL.revokeObjectURL = vi.fn()
  // A saved file shows up as a click on a link with a `download` name.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved[saved.length - 1].name = this.download
  })
  window.print = vi.fn()
})

beforeEach(() => {
  account.sample = true
  saved.length = 0
  resetSampleInvoices()
  vi.mocked(sampleAdminTransaction).mockResolvedValue(payment)
  vi.mocked(sampleTransactionDetail).mockResolvedValue(detail)
  pdf.chunkFails = false
  render_.mockResolvedValue({ blob: new Blob(['%PDF'], { type: 'application/pdf' }), replaced: [] })
})
afterEach(() => vi.clearAllMocks())

function renderDrawer(row = transaction) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <TransactionDrawer transaction={row} open session={1} onClose={() => {}} />
      </MemoryRouter>
    </ToastProvider>,
  )
}

const WAIT = { timeout: 3000 }

async function openPreview(user: ReturnType<typeof userEvent.setup>) {
  renderDrawer()
  const button = screen.getByRole('button', { name: 'Invoice' })
  expect(button).toBeDisabled()
  await waitFor(() => expect(button).toBeEnabled(), WAIT)
  await user.click(button)
  return screen.findByRole('dialog', { name: 'Invoice SF-10001' })
}

describe('the invoice in the transaction drawer', () => {
  it('opens a preview of the sheet in place of the order, with the BIR notice and the sample tag', async () => {
    const user = userEvent.setup()
    const dialog = await openPreview(user)
    expect(await within(dialog).findByText('Invoice ready. Its number is assigned on first download or print.', {}, WAIT)).toBeInTheDocument()
    expect(within(dialog).getByRole('article', { name: 'Sales invoice, number not yet assigned' })).toBeInTheDocument()
    expect(within(dialog).getByText('Invoice No. assigned on first download or print')).toBeInTheDocument()
    expect(within(dialog).queryByText(/DUPLICATE|reprint|SI-0/)).not.toBeInTheDocument()
    expect(invoiceNoFor(detail.id)).toBeUndefined()
    expect(within(dialog).getByText(INVOICE_NOTICE)).toBeInTheDocument()
    expect(within(dialog).getByText('Sample merchant profile')).toBeInTheDocument()
    expect(within(dialog).getByText('Walk-in customer')).toBeInTheDocument()
    expect(within(dialog).getByText('Total Amount Due')).toBeInTheDocument()
    // One modal only: the order is not behind it.
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    await user.click(within(dialog).getByRole('button', { name: /Back to order/ }))
    expect(await screen.findByRole('dialog', { name: 'SF-10001' })).toBeInTheDocument()
  })

  it('says a returned order was returned and refunded in full, and that no credit note is made', async () => {
    const user = userEvent.setup()
    const returned = { returnedAt: '2026-10-24T02:05:00.000Z', returnReason: 'Wrong size' as const, refundAmount: 4580 }
    vi.mocked(sampleTransactionDetail).mockResolvedValue({ ...detail, ...returned })
    renderDrawer({ ...transaction, status: 'REFUNDED', orderStatus: 'REFUNDED' })
    const button = screen.getByRole('button', { name: 'Invoice' })
    await waitFor(() => expect(button).toBeEnabled(), WAIT)
    await user.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'Invoice SF-10001' })
    const sheet = await within(dialog).findByRole('article', {}, WAIT)
    expect(within(sheet).getByText(/^ORDER RETURNED — REFUNDED IN FULL on Oct 24, 2026, 10:05\sAM$/)).toBeInTheDocument()
    expect(within(sheet).getByText(RETURN_NOTICE)).toBeInTheDocument()
  })

  it('shows no returned banner on an active order', async () => {
    const dialog = await openPreview(userEvent.setup())
    await within(dialog).findByRole('article', {}, WAIT)
    expect(within(dialog).queryByText(/ORDER RETURNED/)).not.toBeInTheDocument()
  })

  it('offers PDF and JSON as a radio group and downloads the PDF by default', async () => {
    const user = userEvent.setup()
    const dialog = await openPreview(user)
    const group = within(dialog).getByRole('radiogroup', { name: 'File format' })
    expect(within(group).getByRole('radio', { name: 'PDF' })).toBeChecked()

    const download = await within(dialog).findByRole('button', { name: 'Download PDF' })
    await waitFor(() => expect(download).toBeEnabled(), WAIT)
    await user.click(download)
    await waitFor(() => expect(saved).toHaveLength(1), WAIT)
    expect(saved[0].name).toBe('SI-0000001.pdf')
    expect(render_).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Invoice SI-0000001 downloaded as SI-0000001.pdf.')).toBeInTheDocument()
  })

  it('downloads JSON when chosen, with the schema label', async () => {
    const user = userEvent.setup()
    const dialog = await openPreview(user)
    await user.click(within(dialog).getByRole('radio', { name: 'JSON' }))
    const download = within(dialog).getByRole('button', { name: 'Download JSON' })
    await waitFor(() => expect(download).toBeEnabled(), WAIT)
    await user.click(download)
    await waitFor(() => expect(saved).toHaveLength(1), WAIT)
    expect(saved[0].name).toBe('SI-0000001.json')
    expect(render_).not.toHaveBeenCalled()
    const json = JSON.parse(await saved[0].blob.text())
    expect(json.schema).toBe('silhoufit.einvoice/1')
    expect(json.invoiceNo).toBe('SI-0000001')
    expect(json.totals.totalAmountDue).toBe(4580)
  })

  it('stamps every later export as a duplicate copy with a reprint number', async () => {
    const user = userEvent.setup()
    const dialog = await openPreview(user)
    const download = within(dialog).getByRole('button', { name: 'Download PDF' })
    await waitFor(() => expect(download).toBeEnabled(), WAIT)
    expect(within(dialog).queryByText(/DUPLICATE COPY/)).not.toBeInTheDocument()

    await user.click(download)
    expect(await within(dialog).findByText('DUPLICATE COPY (reprint 1)', {}, WAIT)).toBeInTheDocument()
    expect(render_.mock.calls[0][0].reprintCount).toBe(0)

    await waitFor(() => expect(download).toBeEnabled(), WAIT)
    await user.click(download)
    await waitFor(() => expect(saved).toHaveLength(2), WAIT)
    expect(render_.mock.calls[1][0].reprintCount).toBe(1)
    expect(await within(dialog).findByText('DUPLICATE COPY (reprint 2)', {}, WAIT)).toBeInTheDocument()
  })

  it('disables the buttons while preparing a file', async () => {
    const user = userEvent.setup()
    let finish!: (result: { blob: Blob; replaced: string[] }) => void
    render_.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const dialog = await openPreview(user)
    const download = within(dialog).getByRole('button', { name: 'Download PDF' })
    await waitFor(() => expect(download).toBeEnabled(), WAIT)
    await user.click(download)
    const busy = await within(dialog).findByRole('button', { name: 'Preparing…' })
    expect(busy).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Print' })).toBeDisabled()
    finish({ blob: new Blob(['%PDF']), replaced: [] })
    await waitFor(() => expect(saved).toHaveLength(1), WAIT)
  })

  it('says what failed and retries without counting a copy', async () => {
    const user = userEvent.setup()
    render_.mockRejectedValueOnce(new Error('chunk failed'))
    const dialog = await openPreview(user)
    const download = within(dialog).getByRole('button', { name: 'Download PDF' })
    await waitFor(() => expect(download).toBeEnabled(), WAIT)
    await user.click(download)
    const alert = await screen.findByRole('alert', {}, WAIT)
    expect(alert).toHaveTextContent("Couldn't download the invoice for SF-10001")
    expect(saved).toHaveLength(0)
    // The failed attempt was not recorded as an export, so the retry is still the original.
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(saved).toHaveLength(1), WAIT)
    expect(render_.mock.calls[1][0].reprintCount).toBe(0)
  })

  it('assigns the number on the first download only, not on previewing', async () => {
    const user = userEvent.setup()
    const dialog = await openPreview(user)
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Download PDF' })).toBeEnabled(), WAIT)
    await user.click(within(dialog).getByRole('button', { name: /Back to order/ }))
    await user.click(await screen.findByRole('button', { name: 'Invoice' }))
    const again = await screen.findByRole('dialog', { name: 'Invoice SF-10001' })
    await within(again).findByText('Invoice No. assigned on first download or print', {}, WAIT)
    expect(invoiceNoFor(detail.id)).toBeUndefined()

    const download = within(again).getByRole('button', { name: 'Download PDF' })
    await waitFor(() => expect(download).toBeEnabled(), WAIT)
    await user.click(download)
    expect(await within(again).findByText('No. SI-0000001', {}, WAIT)).toBeInTheDocument()
    expect(invoiceNoFor(detail.id)).toBe('SI-0000001')
    expect(render_.mock.calls[0][0].invoiceNo).toBe('SI-0000001')
    expect(await within(again).findByText(/Previously issued as SI-0000001 · next copy will be stamped DUPLICATE \(reprint 1\)/, {}, WAIT)).toBeInTheDocument()
  })

  it('shows the number on the sheet when printing the first time, as an original', async () => {
    const user = userEvent.setup()
    const dialog = await openPreview(user)
    const print = within(dialog).getByRole('button', { name: 'Print' })
    await waitFor(() => expect(print).toBeEnabled(), WAIT)
    let printed = ''
    vi.mocked(window.print).mockImplementation(() => {
      printed = dialog.querySelector('.invoice-sheet')?.textContent ?? ''
    })
    await user.click(print)
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1), WAIT)
    expect(printed).toContain('No. SI-0000001')
    expect(printed).not.toContain('DUPLICATE')
  })

  it('offers Reload page once the PDF chunk has failed to load twice, and burns no number', async () => {
    const user = userEvent.setup()
    pdf.chunkFails = true
    const dialog = await openPreview(user)
    const download = within(dialog).getByRole('button', { name: 'Download PDF' })
    await waitFor(() => expect(download).toBeEnabled(), WAIT)
    await user.click(download)
    const first = await screen.findByRole('alert', {}, WAIT)
    expect(first).toHaveTextContent('The PDF tool failed to load')
    await user.click(within(first).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('failed to load twice'), WAIT)
    const second = screen.getByRole('alert')
    expect(within(second).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(within(second).getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
    expect(invoiceNoFor(detail.id)).toBeUndefined()
    expect(saved).toHaveLength(0)
  })

  it('warns after the download when the PDF could not draw some characters', async () => {
    const user = userEvent.setup()
    render_.mockResolvedValue({ blob: new Blob(['%PDF']), replaced: ['the buyer name'] })
    const dialog = await openPreview(user)
    const download = within(dialog).getByRole('button', { name: 'Download PDF' })
    await waitFor(() => expect(download).toBeEnabled(), WAIT)
    await user.click(download)
    expect(await screen.findByText(/Some characters in the buyer name can't be shown in the PDF and appear as \?\. JSON and print keep the full text\./, {}, WAIT)).toBeInTheDocument()
  })

  it('prints the sheet', async () => {
    const user = userEvent.setup()
    const dialog = await openPreview(user)
    const print = within(dialog).getByRole('button', { name: 'Print' })
    await waitFor(() => expect(print).toBeEnabled(), WAIT)
    await user.click(print)
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1), WAIT)
  })

  it('shows a draft with a watermark, locks Download and Print, and uses no invoice number', async () => {
    const user = userEvent.setup()
    setSampleMerchant({ permitNo: '' })
    const dialog = await openPreview(user)
    expect(await within(dialog).findByText(/NOT A VALID INVOICE/, {}, WAIT)).toBeInTheDocument()
    expect(within(dialog).getByRole('article', { name: 'Draft sales invoice' })).toBeInTheDocument()
    expect(within(dialog).getByText(/This invoice is a draft/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Download PDF' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Print' })).toBeDisabled()
    expect(within(dialog).getByText(INVOICE_NOTICE)).toBeInTheDocument()
    expect(invoiceNoFor(detail.id)).toBeUndefined()
  })
})

describe('the invoice of a real account', () => {
  beforeEach(() => {
    account.sample = false
    vi.mocked(fetchAdminTransaction).mockResolvedValue(payment)
    vi.mocked(fetchAdminOrder).mockResolvedValue(adminOrderDetail({ id: transaction.orderId, orderNumber: 'SF-10001' }))
  })

  it('shows the order and builds the invoice from it, with the real payment method and the placeholder seller', async () => {
    const user = userEvent.setup()
    const dialog = await openPreview(user)
    expect(fetchAdminOrder).toHaveBeenCalledWith(transaction.orderId, expect.anything())
    const sheet = await within(dialog).findByRole('article', {}, WAIT)
    expect(within(sheet).getByText('Heritage Polo')).toBeInTheDocument()
    expect(within(sheet).getByText('Delivery fee')).toBeInTheDocument()
    expect(within(sheet).getByText('GCash')).toBeInTheDocument()
    expect(within(sheet).getByText('Sample merchant profile')).toBeInTheDocument()
    expect(within(dialog).getByText(INVOICE_NOTICE)).toBeInTheDocument()
  })

  it('downloads JSON with the real method and the placeholder numbering', async () => {
    const user = userEvent.setup()
    const dialog = await openPreview(user)
    await user.click(within(dialog).getByRole('radio', { name: 'JSON' }))
    const download = within(dialog).getByRole('button', { name: 'Download JSON' })
    await waitFor(() => expect(download).toBeEnabled(), WAIT)
    await user.click(download)
    await waitFor(() => expect(saved).toHaveLength(1), WAIT)
    const json = JSON.parse(await saved[0].blob.text())
    expect(json).toMatchObject({ invoiceNo: 'SI-0000001', paymentMethod: 'GCash', notice: INVOICE_NOTICE, seller: { sample: true } })
    expect(json.totals.totalAmountDue).toBe(3879)
  })

  it('says the items could not load, with Retry, and keeps the Invoice off until they do', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchAdminOrder).mockRejectedValueOnce(new Error('down'))
    renderDrawer()
    const alert = await screen.findByRole('alert', {}, WAIT)
    expect(alert).toHaveTextContent("We couldn't load the items.")
    expect(screen.getByRole('button', { name: 'Invoice' })).toBeDisabled()
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Invoice' })).toBeEnabled(), WAIT)
  })
})
