import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { fetchProductDetail, fetchProductList, ProductListError, type PaginatedProducts } from '../../src/service/fetchProductList'
import { addProduct, saveProduct, uploadImage } from '../../src/service/inventoryActions'
import { StaffInventoryPage } from '../../src/views/staff/StaffInventoryPage'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  fetchProductList: vi.fn(),
  fetchProductDetail: vi.fn(),
}))
vi.mock('../../src/service/inventoryActions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/inventoryActions')>()),
  addProduct: vi.fn(),
  saveProduct: vi.fn(),
  uploadImage: vi.fn(),
}))

const POLO = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Heritage Polo',
  category: 'Hoodie',
  brand: 'Ayala Atelier',
  minPrice: 1890,
  maxPrice: 1890,
  totalStock: 20,
  primaryImage: null,
  createdAt: '2026-01-05T00:00:00.000Z',
}
const page = (data: (typeof POLO)[]): PaginatedProducts => ({
  data,
  meta: { total: data.length, page: 1, limit: 25, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
})
function Where() {
  const { search } = useLocation()
  return <p data-testid="where">{search}</p>
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/staff/inventory']}>
        <Where />
        <Routes>
          <Route path="staff/inventory" element={<StaffInventoryPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchProductList).mockResolvedValue(page([POLO]))
  vi.mocked(uploadImage).mockResolvedValue('https://images.silhoufit.test/front.jpg')
  vi.mocked(fetchProductDetail).mockResolvedValue({
    variants: [{ id: 'v1', sku: 'P01-S-WHITE', size: 'S', color: 'White', colorHex: '#ffffff', price: 1890, stock: 20, name: null, imageUrl: null, measurements: null }],
    product: {
      description: 'A polo.',
      gender: null,
      brand: 'Ayala Atelier',
      category: 'Hoodie',
      images: [1, 2, 3].map((n) => ({ url: `https://images.silhoufit.test/${n}.jpg`, altText: null, displayOrder: n, isPrimary: n === 1 })),
    },
  })
})

const file = (name: string, type: string, size = 10) => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

async function openSheet(user: ReturnType<typeof userEvent.setup>, render = true) {
  if (render) renderPage()
  await screen.findAllByRole('table')
  await user.click(screen.getByRole('button', { name: 'Add product' }))
  return screen.findByRole('dialog', { name: 'Add product' })
}

const choose = (files: File[]) => fireEvent.change(screen.getByLabelText('Choose image files'), { target: { files } })

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Linen Shirt')
  await user.type(screen.getByRole('textbox', { name: /Base price/ }), '1250')
  choose([file('front.jpg', 'image/jpeg')])
  await user.type(screen.getByRole('textbox', { name: 'Colour 1 name' }), 'Sand')
}

describe('Add product sheet', () => {
  it('shows an error summary and inline errors on an empty submit, and moves focus to the summary', async () => {
    const user = userEvent.setup()
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Create product' }))
    const summary = await within(dialog).findByText(/Fix \d+ problems? before creating/)
    const alert = summary.closest('[role="alert"]') as HTMLElement
    await waitFor(() => expect(alert).toHaveFocus())
    expect(within(alert).getByRole('link', { name: /Name: Enter a product name/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter an amount above 0 and up to 1,000,000, with at most 2 decimals.')).toBeInTheDocument()
    await user.click(within(alert).getByRole('link', { name: /Name:/ }))
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveFocus()
  })

  it('counts characters, strips emoji and validates on blur', async () => {
    const user = userEvent.setup()
    await openSheet(user)
    const name = screen.getByRole('textbox', { name: /^Name/ })
    await user.type(name, 'A\u{1F600}')
    expect(name).toHaveValue('A')
    expect(screen.getByText('1/100')).toBeInTheDocument()
    await user.tab()
    expect(await screen.findByText('Enter a product name of 2 to 100 characters.')).toBeInTheDocument()
  })

  it('rejects files that are not JPG, PNG or WebP, or are over 5 MB, and says why', async () => {
    const user = userEvent.setup()
    await openSheet(user)
    choose([file('anim.gif', 'image/gif'), file('huge.jpg', 'image/jpeg', 6 * 1024 * 1024), file('ok.png', 'image/png')])
    expect(await screen.findByText(/anim\.gif wasn't added\. Only JPG, PNG or WebP/)).toBeInTheDocument()
    expect(screen.getByText(/huge\.jpg wasn't added\..*limit is 5 MB/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove ok.png' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove anim.gif' })).not.toBeInTheDocument()
  })

  it('asks before discarding a dirty form, and keeps it when the staff member cancels', async () => {
    const user = userEvent.setup()
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const again = await openSheet(user, false)
    await user.type(within(again).getByRole('textbox', { name: /^Name/ }), 'Draft tee')
    await user.keyboard('{Escape}')
    const sure = await screen.findByRole('dialog', { name: 'Are you sure?' })
    await user.click(within(sure).getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('textbox', { name: /^Name/ })).toHaveValue('Draft tee')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('creates the product once on a double click and offers View', async () => {
    const user = userEvent.setup()
    vi.mocked(addProduct).mockResolvedValue({ id: 'new-1', name: 'Linen Shirt' })
    const dialog = await openSheet(user)
    await fillValid(user)
    const create = within(dialog).getByRole('button', { name: 'Create product' })
    await user.dblClick(create)

    expect(await screen.findByText('Linen Shirt added')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(addProduct).toHaveBeenCalledTimes(1)
    expect(addProduct).toHaveBeenCalledWith(expect.objectContaining({ name: 'Linen Shirt', basePrice: 1250 }), expect.anything())
    expect(screen.getByRole('button', { name: 'Add product' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.getByTestId('where').textContent).toContain('q=Linen+Shirt')
  })

  it('has no Brand field, an optional Gender and an AR Fitting box that can be ticked (nothing is sent for it)', async () => {
    const user = userEvent.setup()
    const dialog = await openSheet(user)
    expect(within(dialog).queryByRole('textbox', { name: /Brand/ })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'Gender' })).toBeInTheDocument()
    const ar = within(dialog).getByRole('checkbox', { name: 'AR Fitting ready' })
    expect(ar).not.toBeChecked()
    await user.click(ar)
    expect(ar).toBeChecked()
  })

  it('flags a SKU the server says is already in use on its row', async () => {
    const user = userEvent.setup()
    const dialog = await openSheet(user)
    await fillValid(user)
    const sku = within(dialog).getByRole('textbox', { name: 'SKU for Sand S' })
    await user.clear(sku)
    await user.type(sku, 'P01-S-White')
    vi.mocked(addProduct).mockRejectedValue(new ProductListError('conflict', 'SKU "P01-S-WHITE" is already in use'))
    await user.click(within(dialog).getByRole('button', { name: 'Create product' }))
    expect((await within(dialog).findAllByText(/P01-S-WHITE is already used/)).length).toBeGreaterThan(0)
    expect(sku).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('Edit details sheet', () => {
  async function openEdit(user: ReturnType<typeof userEvent.setup>) {
    renderPage()
    await user.click(await waitFor(() => within(screen.getAllByRole('table')[0]).getByRole('button', { name: /^Heritage Polo/ })))
    const drawer = await screen.findByRole('dialog', { name: 'Heritage Polo' })
    await waitFor(() => expect(within(drawer).getByRole('button', { name: 'Edit details' })).toBeEnabled())
    await user.click(within(drawer).getByRole('button', { name: 'Edit details' }))
    return screen.findByRole('dialog', { name: 'Edit details' })
  }

  it('is prefilled with the product, has no base price, variants or AR box, and keeps Save off until something changes', async () => {
    const user = userEvent.setup()
    const dialog = await openEdit(user)
    expect(screen.queryByRole('dialog', { name: 'Heritage Polo' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveValue('Heritage Polo')
    expect(within(dialog).getByRole('textbox', { name: /^Brand/ })).toHaveValue('Ayala Atelier')
    expect(within(dialog).getByText("Changing the name also changes the product's web address.")).toBeInTheDocument()
    expect(within(dialog).queryByRole('textbox', { name: /Base price/ })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: 'AR Fitting ready' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/^Colours/)).not.toBeInTheDocument()
    expect(within(dialog).getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual(['Preview of image 1', 'Preview of image 2', 'Preview of image 3'])
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), ' II')
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  it('saves a new name into the list, and asks before discarding an edit', async () => {
    const user = userEvent.setup()
    const dialog = await openEdit(user)
    await user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), ' II')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    const discard = await screen.findByRole('dialog', { name: 'Are you sure?' })
    await user.click(within(discard).getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('dialog', { name: 'Edit details' })).toBeInTheDocument()

    vi.mocked(saveProduct).mockResolvedValue(undefined)
    vi.mocked(fetchProductList).mockResolvedValue(page([{ ...POLO, name: 'Heritage Polo II' }]))
    await user.click(within(screen.getByRole('dialog', { name: 'Edit details' })).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Heritage Polo II updated')).toBeInTheDocument()
    expect(saveProduct).toHaveBeenCalledWith(POLO.id, expect.objectContaining({ name: 'Heritage Polo II' }), expect.anything())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await within(screen.getAllByRole('table')[0]).findByRole('button', { name: /^Heritage Polo II/ })).toBeInTheDocument()
  })
})
