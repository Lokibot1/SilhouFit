import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/toast/ToastProvider'
import { ProductListError } from '../../src/service/fetchProductList'
import {
  createSizeMeasurement,
  fetchSizeMeasurement,
  fetchSizeMeasurements,
  setSizeMeasurementActive,
  updateSizeMeasurement,
  type SizeMeasurement,
} from '../../src/service/sizeMeasurements'
import { StaffMeasurementsPage } from '../../src/views/staff/StaffMeasurementsPage'

vi.mock('../../src/service/sizeMeasurements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/sizeMeasurements')>()),
  fetchSizeMeasurements: vi.fn(),
  createSizeMeasurement: vi.fn(),
  fetchSizeMeasurement: vi.fn(),
  updateSizeMeasurement: vi.fn(),
  setSizeMeasurementActive: vi.fn(),
}))

const list = vi.mocked(fetchSizeMeasurements)
const create = vi.mocked(createSizeMeasurement)
const fetchRow = vi.mocked(fetchSizeMeasurement)
const update = vi.mocked(updateSizeMeasurement)
const setActive = vi.mocked(setSizeMeasurementActive)

const NONE = { chestWidthCm: null, waistWidthCm: null, hipWidthCm: null, totalLengthCm: null, inseamCm: null, shoulderWidthCm: null, sleeveLengthCm: null, neckCm: null, thighCm: null }
const hoodie = (size: string, overrides: Partial<SizeMeasurement> = {}): SizeMeasurement => ({
  id: `id-${size}`,
  category: 'Hoodie',
  size,
  ...NONE,
  chestWidthCm: 55,
  totalLengthCm: 70,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

beforeEach(() => {
  vi.resetAllMocks()
  list.mockResolvedValue([hoodie('M'), hoodie('S'), hoodie('XL')])
  fetchRow.mockImplementation(async (id) => hoodie(id.replace('id-', '')))
})

function Where() {
  const { search } = useLocation()
  return <p data-testid="where">{search}</p>
}

function renderPage(search = '') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/staff/measurements${search}`]}>
        <Where />
        <Routes>
          <Route path="staff/measurements" element={<StaffMeasurementsPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

// jsdom has no CSS, so the table and the cards are both in the DOM; the tests read the table.
const table = () => screen.getByRole('table', { hidden: true })
const sizesInTable = () => within(table()).getAllByRole('rowheader', { hidden: true }).map((cell) => cell.textContent)
const lastQuery = () => list.mock.calls.at(-1)![0]

describe('StaffMeasurementsPage list', () => {
  it('asks for the Hoodie sizes that are active, sorted smallest first, with the Hoodie columns', async () => {
    renderPage()
    await waitFor(() => expect(sizesInTable()).toEqual(['S', 'M', 'XL']))
    expect(lastQuery()).toEqual({ category: 'Hoodie', status: 'active' })
    const headers = within(table()).getAllByRole('columnheader', { hidden: true }).map((h) => h.textContent)
    expect(headers).toEqual(['Size', 'Chest width', 'Total length', 'Shoulder width', 'Sleeve length', 'Neck', 'Actions'])
    expect(screen.getByRole('heading', { level: 1, name: 'Base measurements' })).toBeInTheDocument()
    expect(document.title).toBe('Base measurements — SilhouFit')
  })

  it('marks only the custom sizings as sample data: the base sizes come from the API', async () => {
    renderPage()
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
    expect(screen.getAllByText('Sample data')).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: 'Custom sizings' })).getByText('Sample data')).toBeInTheDocument()
  })

  it('offers exactly the four categories and an Active / Archived toggle as tabs', async () => {
    renderPage()
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
    const categories = within(screen.getByRole('tablist', { name: 'Category' })).getAllByRole('tab')
    expect(categories.map((t) => t.textContent)).toEqual(['Hoodie', 'Pants', 'Headwear', 'Shorts'])
    expect(categories[0]).toHaveAttribute('aria-selected', 'true')
    const status = within(screen.getByRole('tablist', { name: 'Size status' })).getAllByRole('tab')
    expect(status.map((t) => t.textContent)).toEqual(['Active', 'Archived'])
  })

  it('shows a skeleton while loading', () => {
    list.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading sizes' })).toBeInTheDocument()
  })

  it("draws as many skeleton rows as the list had last time, and the category's usual size count the first time", async () => {
    const user = userEvent.setup()
    const skeletonRows = () => document.querySelectorAll('[role="status"][aria-label="Loading sizes"] tbody tr').length
    list.mockResolvedValue([hoodie('S'), hoodie('M')])
    renderPage('?category=Pants')
    await waitFor(() => expect(sizesInTable()).toHaveLength(2))
    list.mockReturnValue(new Promise(() => {}))
    await user.click(screen.getByRole('tab', { name: 'Shorts' }))
    expect(skeletonRows()).toBe(5)
    await user.click(screen.getByRole('tab', { name: 'Headwear' }))
    expect(skeletonRows()).toBe(1)
    await user.click(screen.getByRole('tab', { name: 'Pants' }))
    expect(skeletonRows()).toBe(2)
    expect(document.querySelectorAll('[role="status"][aria-label="Loading sizes"] li')).toHaveLength(2)
  })

  it('switches category and status through the URL and asks again', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
    list.mockResolvedValue([])
    await user.click(screen.getByRole('tab', { name: 'Pants' }))
    await waitFor(() => expect(lastQuery()).toEqual({ category: 'Pants', status: 'active' }))
    await user.click(screen.getByRole('tab', { name: 'Archived' }))
    await waitFor(() => expect(lastQuery()).toEqual({ category: 'Pants', status: 'archived' }))
    expect(screen.getByTestId('where')).toHaveTextContent('category=Pants&status=archived')
    expect(await screen.findByText('No archived Pants sizes')).toBeInTheDocument()
  })

  it('shows the empty state with a call to action that opens the add sheet', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No Hoodie sizes yet')).toBeInTheDocument()
    const cta = screen.getAllByRole('button', { name: 'Add size' })
    await user.click(cta[cta.length - 1])
    expect(await screen.findByRole('dialog', { name: 'Add size' })).toBeInTheDocument()
  })

  it('shows an error with a Retry that loads again', async () => {
    const user = userEvent.setup()
    list.mockRejectedValueOnce(new ProductListError('network'))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the Hoodie sizes.")
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
  })

  it('says the service is not available yet on a 404, with a Retry', async () => {
    const user = userEvent.setup()
    list.mockRejectedValueOnce(new ProductListError('not-found'))
    renderPage()
    expect(await screen.findByText("Base measurements aren't available yet")).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
  })

  it('explains a 403 as missing access', async () => {
    list.mockRejectedValueOnce(new ProductListError('forbidden'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('not allowed')
  })
})

async function openAdd(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(sizesInTable()).toHaveLength(3))
  await user.click(screen.getAllByRole('button', { name: 'Add size' })[0])
  return screen.findByRole('dialog', { name: 'Add size' })
}

describe('add a size', () => {
  it('validates inline, then creates the row, closes, refreshes and toasts', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openAdd(user)
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Add size' }))
    expect(within(dialog).getByText(/Enter a size/)).toBeInTheDocument()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter at least one measurement.')
    expect(create).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Chest width'), '300')
    await user.tab()
    expect(within(dialog).getByText('Enter chest width from 5 to 250 cm.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Size'), 'XXL')
    await user.clear(within(dialog).getByLabelText('Chest width'))
    await user.type(within(dialog).getByLabelText('Chest width'), '60')
    create.mockResolvedValue(hoodie('XXL', { chestWidthCm: 60 }))
    list.mockResolvedValue([hoodie('XXL')])
    await user.click(within(dialog).getByRole('button', { name: 'Add size' }))

    await waitFor(() => expect(create).toHaveBeenCalledWith({ category: 'Hoodie', size: 'XXL', chestWidthCm: 60 }, expect.anything()))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add size' })).not.toBeInTheDocument())
    expect(await screen.findByText('Hoodie XXL added')).toBeInTheDocument()
    await waitFor(() => expect(sizesInTable()).toEqual(['XXL']))
  })

  it('names the category and size on a 409 and keeps the sheet open', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openAdd(user)
    await user.type(within(dialog).getByLabelText('Size'), 'M')
    await user.type(within(dialog).getByLabelText('Chest width'), '55')
    create.mockRejectedValue(new ProductListError('conflict'))
    await user.click(within(dialog).getByRole('button', { name: 'Add size' }))
    await waitFor(() => expect(within(dialog).getAllByText(/An active Hoodie M already exists/).length).toBeGreaterThan(0))
    expect(within(dialog).getByLabelText('Size')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByLabelText('Size')).toHaveFocus()
  })

  it('uses add-appropriate copy when creating hits a 404', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openAdd(user)
    await user.type(within(dialog).getByLabelText('Size'), 'M')
    await user.type(within(dialog).getByLabelText('Chest width'), '55')
    create.mockRejectedValue(new ProductListError('not-found'))
    await user.click(within(dialog).getByRole('button', { name: 'Add size' }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent("The measurements service isn't available yet, so this size can't be added.")
    expect(alert).not.toHaveTextContent('no longer exists')
  })

  it('shows what the server said on a 400', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openAdd(user)
    await user.type(within(dialog).getByLabelText('Size'), 'M')
    await user.type(within(dialog).getByLabelText('Chest width'), '55')
    create.mockRejectedValue(new ProductListError('validation', 'size is too long'))
    await user.click(within(dialog).getByRole('button', { name: 'Add size' }))
    expect(await within(dialog).findByText(/size is too long/)).toBeInTheDocument()
  })

  it('asks before discarding typed values, and closes at once when nothing was typed', async () => {
    const user = userEvent.setup()
    renderPage()
    let dialog = await openAdd(user)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    dialog = await openAdd(user)
    await user.type(within(dialog).getByLabelText('Size'), 'M')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    const confirm = await screen.findByRole('dialog', { name: 'Are you sure?' })
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(confirm).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('disables the submit button while the request is pending', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openAdd(user)
    await user.type(within(dialog).getByLabelText('Size'), 'M')
    await user.type(within(dialog).getByLabelText('Chest width'), '55')
    create.mockReturnValue(new Promise(() => {}))
    await user.click(within(dialog).getByRole('button', { name: 'Add size' }))
    expect(await within(dialog).findByRole('button', { name: 'Adding…' })).toBeDisabled()
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('edit a size', () => {
  it('pre-fills the row, can only save a change, and patches only what changed', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
    await user.click(within(table()).getByRole('button', { name: 'Edit Hoodie M', hidden: true }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit size' })
    expect(within(dialog).getByLabelText('Size')).toHaveValue('M')
    expect(within(dialog).getByLabelText('Chest width')).toHaveValue('55')
    expect(within(dialog).queryByRole('combobox', { name: 'Category' })).not.toBeInTheDocument()
    expect(within(dialog).getByText('Hoodie')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save size' })).toBeDisabled()

    await user.clear(within(dialog).getByLabelText('Total length'))
    await user.type(within(dialog).getByLabelText('Neck'), '38')
    update.mockResolvedValue(hoodie('M', { totalLengthCm: null, neckCm: 38 }))
    await user.click(within(dialog).getByRole('button', { name: 'Save size' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith('id-M', { totalLengthCm: null, neckCm: 38 }, expect.anything()))
    expect(await screen.findByText('Hoodie M updated')).toBeInTheDocument()
    await waitFor(() => expect(within(table()).getByRole('button', { name: 'Edit Hoodie M', hidden: true })).toHaveFocus())
  })
})

describe('opening a size to edit', () => {
  it('reads the row again and edits that fresh copy, not the one the list showed', async () => {
    fetchRow.mockResolvedValue(hoodie('M', { chestWidthCm: 58 }))
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
    await user.click(within(table()).getByRole('button', { name: 'Edit Hoodie M', hidden: true }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit size' })
    expect(await within(dialog).findByLabelText('Chest width')).toHaveValue('58')
    expect(fetchRow).toHaveBeenCalledWith('id-M', expect.anything())
  })

  it('shows a skeleton while the row loads', async () => {
    fetchRow.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
    await user.click(within(table()).getByRole('button', { name: 'Edit Hoodie M', hidden: true }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit size' })
    expect(within(dialog).getByRole('status', { name: 'Loading the size' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Size')).not.toBeVisible()
  })

  it('says what went wrong and retries when the row cannot be read', async () => {
    fetchRow.mockRejectedValueOnce(new ProductListError('network'))
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
    await user.click(within(table()).getByRole('button', { name: 'Edit Hoodie M', hidden: true }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit size' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Couldn't open the size.")
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(await within(dialog).findByLabelText('Size')).toHaveValue('M')
  })

  it('offers no retry when the row is gone', async () => {
    fetchRow.mockRejectedValue(new ProductListError('not-found'))
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
    await user.click(within(table()).getByRole('button', { name: 'Edit Hoodie M', hidden: true }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit size' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('That size no longer exists')
    expect(within(dialog).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit size' })).not.toBeInTheDocument())
  })
})

describe('archive and restore', () => {
  it('confirms with "Are you sure?" and an action-named secondary button, then archives and offers Undo', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
    await user.click(within(table()).getByRole('button', { name: 'Archive Hoodie M', hidden: true }))
    const dialog = await screen.findByRole('dialog', { name: 'Are you sure?' })
    expect(dialog).toHaveTextContent('Hoodie M will be hidden')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(setActive).not.toHaveBeenCalled()

    setActive.mockResolvedValue(hoodie('M', { isActive: false }))
    list.mockResolvedValue([hoodie('S'), hoodie('XL')])
    await user.click(within(dialog).getByRole('button', { name: 'Archive size' }))
    await waitFor(() => expect(setActive).toHaveBeenCalledWith('id-M', false))
    expect(await screen.findByText('Hoodie M archived')).toBeInTheDocument()
    await waitFor(() => expect(sizesInTable()).toEqual(['S', 'XL']))

    // The archived row left the tab: focus lands on the next row's Edit button.
    await waitFor(() => expect(within(table()).getByRole('button', { name: 'Edit Hoodie XL', hidden: true })).toHaveFocus())

    setActive.mockResolvedValue(hoodie('M'))
    list.mockResolvedValue([hoodie('M'), hoodie('S'), hoodie('XL')])
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(setActive).toHaveBeenLastCalledWith('id-M', true))
    await waitFor(() => expect(within(table()).getByRole('button', { name: 'Edit Hoodie M', hidden: true })).toHaveFocus())
  })

  it('Cancel keeps the row and calls nothing', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
    await user.click(within(table()).getByRole('button', { name: 'Archive Hoodie S', hidden: true }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Are you sure?' })).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(setActive).not.toHaveBeenCalled()
  })

  it('keeps the prompt open and says why when archiving fails', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
    await user.click(within(table()).getByRole('button', { name: 'Archive Hoodie M', hidden: true }))
    const dialog = await screen.findByRole('dialog', { name: 'Are you sure?' })
    setActive.mockRejectedValue(new ProductListError('forbidden'))
    await user.click(within(dialog).getByRole('button', { name: 'Archive size' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Couldn't archive Hoodie M.")
  })

  it('restores an archived row at once, without a prompt', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue([hoodie('M', { isActive: false })])
    renderPage('?category=Hoodie&status=archived')
    await waitFor(() => expect(sizesInTable()).toEqual(['M']))
    expect(within(table()).queryByRole('button', { name: /^Edit/, hidden: true })).not.toBeInTheDocument()
    setActive.mockResolvedValue(hoodie('M'))
    list.mockResolvedValue([])
    await user.click(within(table()).getByRole('button', { name: 'Restore Hoodie M', hidden: true }))
    await waitFor(() => expect(setActive).toHaveBeenCalledWith('id-M', true))
    expect(await screen.findByText('Hoodie M restored')).toBeInTheDocument()
  })

  it('names the conflict when a restore finds an active row, and offers to view it instead of a Retry that cannot work', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue([hoodie('M', { isActive: false })])
    renderPage('?status=archived')
    await waitFor(() => expect(sizesInTable()).toEqual(['M']))
    setActive.mockRejectedValue(new ProductListError('conflict'))
    await user.click(within(table()).getByRole('button', { name: 'Restore Hoodie M', hidden: true }))
    expect(await screen.findByText(/Couldn't restore Hoodie M\. An active Hoodie M already exists. Edit that one, or use a different size\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()

    list.mockResolvedValue([hoodie('S'), hoodie('M')])
    await user.click(screen.getByRole('button', { name: 'View active Hoodie M' }))
    await waitFor(() => expect(lastQuery()).toEqual({ category: 'Hoodie', status: 'active' }))
    expect(screen.getByTestId('where')).not.toHaveTextContent('status=archived')
    await waitFor(() => expect(within(table()).getByRole('button', { name: 'Edit Hoodie M', hidden: true })).toHaveFocus())
  })

  it('keeps Retry for other restore errors', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue([hoodie('M', { isActive: false })])
    renderPage('?status=archived')
    await waitFor(() => expect(sizesInTable()).toEqual(['M']))
    setActive.mockRejectedValue(new ProductListError('network'))
    await user.click(within(table()).getByRole('button', { name: 'Restore Hoodie M', hidden: true }))
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /View active/ })).not.toBeInTheDocument()
  })

  it('never leaves focus on the page between confirming an archive and landing on the next row', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(sizesInTable()).toHaveLength(3))
    await user.click(within(table()).getByRole('button', { name: 'Archive Hoodie M', hidden: true }))
    const dialog = await screen.findByRole('dialog', { name: 'Are you sure?' })
    let finish: (rows: SizeMeasurement[]) => void = () => {}
    list.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    setActive.mockResolvedValue(hoodie('M', { isActive: false }))
    const onBody: string[] = []
    const watch = () => queueMicrotask(() => document.activeElement === document.body && onBody.push('body'))
    document.addEventListener('focusout', watch)
    await user.click(within(dialog).getByRole('button', { name: 'Archive size' }))
    await screen.findByText('Hoodie M archived')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // The list is still loading: focus waits on its heading.
    expect(screen.getByRole('status', { name: 'Loading sizes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hoodie sizes' })).toHaveFocus()
    finish([hoodie('S'), hoodie('XL')])
    await waitFor(() => expect(within(table()).getByRole('button', { name: 'Edit Hoodie XL', hidden: true })).toHaveFocus())
    document.removeEventListener('focusout', watch)
    expect(onBody).toEqual([])
  })
})
