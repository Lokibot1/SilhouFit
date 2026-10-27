import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SizeGuideModal } from '../../src/components/shop/SizeGuideModal'
import { MEASUREMENT_KEYS, ProductListError, type Measurements, type ProductVariant } from '../../src/service/fetchProductList'
import { fetchCategoryMeasurements, type SizeMeasurement } from '../../src/service/sizeMeasurements'

vi.mock('../../src/service/sizeMeasurements', () => ({ fetchCategoryMeasurements: vi.fn() }))
const fetchMock = vi.mocked(fetchCategoryMeasurements)

const none = Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, null])) as Measurements
const variant = (size: string, measurements: Measurements | null = null): ProductVariant => ({
  id: size, sku: size, name: null, size, color: 'Black', colorHex: null, price: 1, stock: 1, imageUrl: null, measurements,
})
const base = (size: string, chest: number): SizeMeasurement => ({
  id: size, category: 'Hoodie', size, ...none, chestWidthCm: chest, totalLengthCm: 70, isActive: true, createdAt: '', updatedAt: '',
})

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => fetchMock.mockResolvedValue([base('S', 52), base('M', 55)]))
afterEach(() => vi.resetAllMocks())

function Harness({ variants, selected = '' }: { variants: ProductVariant[]; selected?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Size guide</button>
      <SizeGuideModal open={open} onClose={() => setOpen(false)} category="Hoodie" variants={variants} selected={selected} />
    </>
  )
}

async function open(variants: ProductVariant[], selected?: string) {
  const user = userEvent.setup()
  render(<Harness variants={variants} selected={selected} />)
  await user.click(screen.getByRole('button', { name: 'Size guide' }))
  return user
}

// The table (md up) and the cards (below md) are both in the DOM; jsdom applies no media queries, so scope to the table.
const table = () => screen.getByRole('table')

describe('SizeGuideModal', () => {
  it('does not fetch until it is opened', () => {
    render(<Harness variants={[variant('S')]} />)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a skeleton while the base measurements load', async () => {
    let resolve!: (rows: SizeMeasurement[]) => void
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    await open([variant('S'), variant('M')])
    expect(screen.getByRole('status', { name: 'Loading size guide' })).toBeInTheDocument()
    await act(async () => resolve([base('S', 52)]))
    expect(screen.queryByRole('status', { name: 'Loading size guide' })).toBeNull()
    expect(table()).toBeInTheDocument()
  })

  it('shows the standard values per size, labelled as standard', async () => {
    await open([variant('M'), variant('S')])
    const rows = within(await screen.findByRole('table')).getAllByRole('row')
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('S')
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('Standard for Hoodie')
    expect(within(rows[2]).getByText('55')).toBeInTheDocument()
    expect(screen.getByText(/Garment measurements in cm/)).toBeInTheDocument()
  })

  it('uses the product measurements for a size that has them, labelled This piece', async () => {
    await open([variant('S'), variant('M', { ...none, chestWidthCm: 58 })])
    const rows = within(await screen.findByRole('table')).getAllByRole('row')
    expect(within(rows[2]).getByRole('rowheader')).toHaveTextContent('This piece')
    expect(within(rows[2]).getByText('58')).toBeInTheDocument()
    expect(within(rows[2]).queryByText('55')).toBeNull()
  })

  it('says Not available for a size with neither source', async () => {
    await open([variant('S'), variant('L')])
    const rows = within(await screen.findByRole('table')).getAllByRole('row')
    expect(within(rows[2]).getByText('Not available')).toBeInTheDocument()
  })

  it('falls back quietly when the base fetch fails and the product has no measurements', async () => {
    fetchMock.mockRejectedValue(new ProductListError('not-found'))
    await open([variant('S')])
    expect(await screen.findByText(/Size guide isn't available for this piece yet/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows a distinct error with a Retry that refetches when the base fetch fails with a server or network error', async () => {
    fetchMock.mockRejectedValueOnce(new ProductListError('server'))
    const user = await open([variant('S')])
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the standard Hoodie measurements.")
    expect(screen.queryByText(/Size guide isn't available/)).toBeNull()
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(within(await screen.findByRole('table')).getByText('52')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sizes the skeleton to the real number of sizes', async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    await open([variant('S'), variant('s '), variant('M'), variant('L')])
    expect(within(screen.getByRole('status', { name: 'Loading size guide' })).getAllByRole('row', { hidden: true })).toHaveLength(1 + 3)
  })

  it('notes This piece rows only when there are some, and reads missing cells as Not measured', async () => {
    await open([variant('S'), variant('M')])
    await screen.findByRole('table')
    expect(screen.queryByText(/use this product's own measurements/)).toBeNull()
  })

  it('explains This piece rows and hides the dash from assistive tech', async () => {
    await open([variant('S'), variant('M', { ...none, chestWidthCm: 58 })])
    const rows = within(await screen.findByRole('table')).getAllByRole('row')
    expect(screen.getByText(/Rows marked .This piece. use this product's own measurements/)).toBeInTheDocument()
    expect(within(rows[2]).getAllByText('Not measured').length).toBeGreaterThan(0)
  })

  it('lists sizes differing only by case once, with one Selected row', async () => {
    await open([variant('m'), variant('M')], 'M')
    const rows = within(await screen.findByRole('table')).getAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveTextContent('Selected')
  })

  it('shows the product measurements when the base fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('network'))
    await open([variant('S', { ...none, chestWidthCm: 50 }), variant('M')])
    const rows = within(await screen.findByRole('table')).getAllByRole('row')
    expect(within(rows[1]).getByText('50')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Not available')).toBeInTheDocument()
  })

  it('shows base values when the product has no measurements of its own', async () => {
    await open([variant('S')])
    expect(within(await screen.findByRole('table')).getByText('52')).toBeInTheDocument()
  })

  it('highlights the selected size row', async () => {
    await open([variant('S'), variant('M')], 'M')
    const rows = within(await screen.findByRole('table')).getAllByRole('row')
    expect(rows[1]).not.toHaveAttribute('aria-current')
    expect(rows[2]).toHaveAttribute('aria-current', 'true')
    expect(rows[2]).toHaveTextContent('Selected')
  })

  it('is a labelled dialog that Escape closes, returning focus to the opener', async () => {
    const user = await open([variant('S')])
    expect(screen.getByRole('dialog', { name: 'Size guide' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Size guide' })).toHaveFocus()
  })

  it('keeps Tab inside the dialog', async () => {
    const user = await open([variant('S')])
    await user.tab()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })
})
