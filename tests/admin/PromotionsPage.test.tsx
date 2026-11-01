import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidateShopColours } from '../../src/hooks/useShopColours'
import { fetchProductFilters } from '../../src/service/fetchProductFilters'
import { fetchShopProducts, type ShopApiPage } from '../../src/service/fetchShopProducts'
import * as service from '../../src/service/promotions'
import { getPromotions, setPromotions } from '../../src/service/promotions'
import { PromotionsPage } from '../../src/views/admin/PromotionsPage'
import { renderAdmin, setUpAdminDom } from '../shared/adminSession'

vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))
vi.mock('../../src/service/fetchProductFilters', () => ({ fetchProductFilters: vi.fn() }))
vi.mock('../../src/service/fetchShopProducts', () => ({ fetchShopProducts: vi.fn() }))
vi.mock('../../src/service/promotions', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/service/promotions')>()
  return {
    ...real,
    getPromoSummary: vi.fn(real.getPromoSummary),
    listPromotions: vi.fn(real.listPromotions),
    createPromotion: vi.fn(real.createPromotion),
    updatePromotion: vi.fn(real.updatePromotion),
    endPromotion: vi.fn(real.endPromotion),
    deletePromotion: vi.fn(real.deletePromotion),
  }
})

const PATH = '/admin/promotions'
const original = getPromotions()
const network = () => Object.assign(new Error('network'), { kind: 'network' })

// The catalog the sheet reads: its categories are not the sample products' ones, and "Tee 01" to "Tee 22" are there to fill the 20-product cap.
const CATALOG = [{ id: 'cat-linen', name: 'Linen Shirt', category: 'Knitwear' }, ...Array.from({ length: 22 }, (_, n) => ({ id: `cat-tee-${n + 1}`, name: `Tee ${String(n + 1).padStart(2, '0')}`, category: 'Denim' }))]
const shopPage = (search?: string): ShopApiPage => {
  const found = CATALOG.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
  return { products: found.map((p) => ({ ...p, image: '' })), total: found.length, page: 1, pageCount: 1 } as unknown as ShopApiPage
}
const filters = (categories: string[]) => ({ categories, brands: [], sizes: [], colors: [], minPrice: 0, maxPrice: 0 })

beforeAll(setUpAdminDom)
beforeEach(() => {
  invalidateShopColours()
  vi.mocked(fetchProductFilters).mockResolvedValue(filters(['Denim', 'Knitwear']))
  vi.mocked(fetchShopProducts).mockImplementation((params) => Promise.resolve(shopPage(params.search)))
})
afterEach(() => {
  vi.clearAllMocks()
  setPromotions(original)
})

// jsdom loads no CSS, so the table and the card list are both on screen: these look in the table.
const table = () => screen.getByRole('table')
const bodyRows = () => within(table()).getAllByRole('row').slice(1)
const rowOf = (name: string) => bodyRows().find((r) => within(r).queryByText(name))!
const action = (label: string) => within(table()).getByRole('button', { name: label })
const cards = () => screen.getByRole('region', { name: 'Promotions at a glance' })
const figure = (label: string) => within(cards()).getByText(label).nextSibling
const searchBox = () => screen.getByRole('textbox', { name: 'Search promotions by name or code' })

async function search(text: string) {
  await userEvent.type(searchBox(), text)
}

async function renderPage() {
  renderAdmin(<PromotionsPage />, PATH)
  await within(table()).findByText('Accessories Fair')
}

async function openCreate() {
  await userEvent.click(screen.getAllByRole('button', { name: 'Create promotion' })[0])
  return screen.findByRole('dialog', { name: 'Create promotion' })
}

/** The Create sheet filled in with a valid promotion. */
async function fillValid(dialog: HTMLElement) {
  await userEvent.type(within(dialog).getByLabelText('Name'), 'Test Promo')
  await userEvent.type(within(dialog).getByLabelText('Code'), 'testpromo1')
  await userEvent.type(within(dialog).getByLabelText('Percent off'), '25')
}

describe('Pricing & Promotions page', () => {
  it('shows the title, the four cards and the first page of promotions', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Pricing & Promotions' })).toBeInTheDocument()
    expect(document.title).toBe('Pricing & Promotions — SilhouFit')
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content
    expect(meta.length).toBeGreaterThanOrEqual(150)
    expect(meta.length).toBeLessThanOrEqual(160)

    await within(cards()).findByText('Redemptions')
    expect(figure('Active')).toHaveTextContent('11')
    expect(figure('Scheduled')).toHaveTextContent('8')
    expect(figure('Ended')).toHaveTextContent('11')
    expect(bodyRows()).toHaveLength(10)
    expect(screen.getByText('Displaying 1–10 of 30')).toBeInTheDocument()
    expect(within(rowOf('Denim Days')).getByText('Active')).toBeInTheDocument()
    expect(within(rowOf('Denim Days')).getByText('20%')).toBeInTheDocument()
    expect(within(rowOf('Accessory Add-on')).getByText('₱50.00 off')).toBeInTheDocument()
    expect(within(rowOf('Accessory Add-on')).getByText('96 / 100')).toBeInTheDocument()
  })

  it('filters by status with the tabs', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('tab', { name: 'Scheduled' }))
    expect(await screen.findByText('Displaying 1–8 of 8')).toBeInTheDocument()
    for (const r of bodyRows()) expect(within(r).getByText('Scheduled')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Ended' }))
    expect(await screen.findByText('Displaying 1–10 of 11')).toBeInTheDocument()
  })

  it('searches name and code after a pause, and offers Clear filters when nothing matches', async () => {
    await renderPage()
    await search('denim')
    expect(await screen.findByText('Displaying 1–2 of 2')).toBeInTheDocument()
    expect(bodyRows().map((r) => r.textContent)).toEqual([expect.stringContaining('Denim Days'), expect.stringContaining('Weekend Denim')])

    await userEvent.clear(searchBox())
    await search('wknd')
    expect(await screen.findByText('Displaying 1–1 of 1')).toBeInTheDocument()

    await userEvent.clear(searchBox())
    await search('zzzz')
    expect(await screen.findByText('No promotions match')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Displaying 1–10 of 30')).toBeInTheDocument()
    expect(searchBox()).toHaveValue('')
  })

  it('sorts by a column and flips the direction on a second click', async () => {
    await renderPage()
    const header = (name: string | RegExp) => within(table()).getByRole('columnheader', { name })
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending')

    await userEvent.click(within(header('Name')).getByRole('button'))
    await waitFor(() => expect(header('Name')).toHaveAttribute('aria-sort', 'descending'))
    expect(await within(table()).findByText('Welcome Offer')).toBeInTheDocument()

    await userEvent.click(within(header('Value')).getByRole('button'))
    await waitFor(() => expect(header('Value')).toHaveAttribute('aria-sort', 'ascending'))
    expect(header('Name')).not.toHaveAttribute('aria-sort')

    await userEvent.click(screen.getByRole('button', { name: 'Sort by end date' }))
    await waitFor(() => expect(header(/Sale period/)).toHaveAttribute('aria-sort', 'ascending'))
    expect(screen.getByRole('button', { name: 'Sort by end date, ascending' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sort by start date' })).toBeInTheDocument()
  })

  it('pages through more than 25 promotions', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Displaying 11–20 of 30')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Displaying 21–30 of 30')).toBeInTheDocument()
  })

  it('shows what is wrong in each field, uppercases the code and refuses a taken code', async () => {
    await renderPage()
    const dialog = await openCreate()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create promotion' }))
    expect(await within(dialog).findByText('Enter a name so you can tell this promotion apart.')).toBeInTheDocument()
    expect(within(dialog).getByText('Enter the code shoppers will type at checkout.')).toBeInTheDocument()
    expect(within(dialog).getByText('Enter how many percent off.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Name')).toHaveFocus()
    expect(service.createPromotion).not.toHaveBeenCalled()

    await userEvent.type(within(dialog).getByLabelText('Code'), 'sale 5!')
    expect(within(dialog).getByLabelText('Code')).toHaveValue('SALE5')
    await userEvent.clear(within(dialog).getByLabelText('Code'))
    await userEvent.type(within(dialog).getByLabelText('Code'), 'denim20')
    expect(await within(dialog).findByText('Another promotion already uses this code. Choose a different one.')).toBeInTheDocument()

    await userEvent.type(within(dialog).getByLabelText('Percent off'), '95')
    expect(within(dialog).getByText('Percent off must be from 1 to 90.')).toBeInTheDocument()

    // One field holds both dates; choosing only a first day leaves the end open, and saving says so
    expect(within(dialog).queryByLabelText('Start date')).toBeNull()
    await userEvent.click(within(dialog).getByRole('button', { name: /^Sale dates/ }))
    // the calendar floats in its own layer outside the drawer, so it is found on the screen
    await userEvent.click(screen.getAllByRole('button', { name: /^[A-Za-z]+ \d{1,2}, \d{4}$/ })[0])
    expect(within(dialog).getByRole('button', { name: /Select end date/ })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create promotion' }))
    expect(await within(dialog).findByText('Choose the last day of the sale.')).toBeInTheDocument()
  })

  it('creates a promotion, closes the sheet, shows the toast, the row and the new count', async () => {
    await renderPage()
    await within(cards()).findByText('Redemptions')
    const dialog = await openCreate()
    await fillValid(dialog)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create promotion' }))

    expect(await screen.findByText('Promotion "Test Promo" created')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(service.createPromotion).toHaveBeenCalledWith(expect.objectContaining({ name: 'Test Promo', code: 'TESTPROMO1', type: 'percent', value: 25, appliesTo: { scope: 'all' }, usageLimit: null, minSpend: null }))
    await waitFor(() => expect(figure('Active')).toHaveTextContent('12'))
    await search('testpromo1')
    expect(await within(table()).findByText('Test Promo')).toBeInTheDocument()
  })

  it('keeps the sheet open with an alert and re-enables Create when saving fails', async () => {
    vi.mocked(service.createPromotion).mockRejectedValueOnce(network())
    await renderPage()
    const dialog = await openCreate()
    await fillValid(dialog)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create promotion' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent("We couldn't create the promotion.")
    expect(within(dialog).getByRole('button', { name: 'Create promotion' })).toBeEnabled()
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Test Promo')
    expect(getPromotions()).toHaveLength(30)
  })

  it('disables Create while the request is pending', async () => {
    let finish: (value: service.Promotion) => void = () => {}
    vi.mocked(service.createPromotion).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    await renderPage()
    const dialog = await openCreate()
    await fillValid(dialog)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create promotion' }))

    const busy = await within(dialog).findByRole('button', { name: 'Creating…' })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    finish(getPromotions()[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(service.createPromotion).toHaveBeenCalledTimes(1)
  })

  it('fills the sheet from the promotion, refuses a usage limit below the redemptions and saves a change', async () => {
    await renderPage()
    const used = original.find((p) => p.code === 'DENIM20')!.redemptions
    expect(used).toBeGreaterThan(1)
    await userEvent.click(action('Edit Denim Days'))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Denim Days' })
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Denim Days')
    expect(within(dialog).getByLabelText('Code')).toHaveValue('DENIM20')
    expect(within(dialog).getByLabelText('Percent off')).toHaveValue('20')
    expect(within(dialog).getByLabelText(/^Usage limit/)).toHaveValue('200')

    await userEvent.clear(within(dialog).getByLabelText(/^Usage limit/))
    await userEvent.type(within(dialog).getByLabelText(/^Usage limit/), '1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await within(dialog).findByText(`Usage limit can't be below the ${used} redemptions already used`)).toBeInTheDocument()

    await userEvent.clear(within(dialog).getByLabelText(/^Usage limit/))
    await userEvent.type(within(dialog).getByLabelText(/^Usage limit/), '500')
    await userEvent.type(within(dialog).getByLabelText('Name'), ' Plus')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Promotion "Denim Days Plus" saved')).toBeInTheDocument()
    expect(await within(table()).findByText('Denim Days Plus')).toBeInTheDocument()
  })

  it('ends a promotion early only after the confirmation, and moves it to Ended', async () => {
    await renderPage()
    await within(cards()).findByText('Redemptions')
    await search('payday')
    await within(table()).findByText('Payday Sale')
    expect(within(rowOf('Payday Sale')).getByText('Active')).toBeInTheDocument()

    await userEvent.click(action('End Payday Sale early'))
    const dialog = await screen.findByRole('dialog', { name: 'End "Payday Sale" now?' })
    expect(within(dialog).getByText(/Shoppers can no longer use code PAYDAY15/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(service.endPromotion).not.toHaveBeenCalled()
    expect(within(rowOf('Payday Sale')).getByText('Active')).toBeInTheDocument()

    await userEvent.click(action('End Payday Sale early'))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'End promotion' }))
    expect(await screen.findByText('"Payday Sale" ended')).toBeInTheDocument()
    await waitFor(() => expect(within(rowOf('Payday Sale')).getByText('Ended')).toBeInTheDocument())
    expect(within(rowOf('Payday Sale')).queryByRole('button', { name: /^End / })).toBeNull()
    await waitFor(() => expect(figure('Active')).toHaveTextContent('10'))
    expect(figure('Ended')).toHaveTextContent('12')
  })

  it('does not offer Edit or End on a promotion that was ended early', async () => {
    await renderPage()
    await search('midnight')
    await within(table()).findByText('Midnight Madness')
    expect(within(rowOf('Midnight Madness')).queryByRole('button', { name: /^Edit / })).toBeNull()
    expect(within(rowOf('Midnight Madness')).queryByRole('button', { name: /^End / })).toBeNull()
    expect(within(rowOf('Midnight Madness')).getByRole('button', { name: 'Delete Midnight Madness' })).toBeInTheDocument()
  })

  it('deletes a promotion after the confirmation', async () => {
    await renderPage()
    await search('flash')
    await within(table()).findByText('Flash Friday')
    await userEvent.click(action('Delete Flash Friday'))
    const dialog = await screen.findByRole('dialog', { name: 'Delete "Flash Friday"?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete promotion' }))

    expect(await screen.findByText('"Flash Friday" deleted')).toBeInTheDocument()
    expect(await screen.findByText('No promotions match')).toBeInTheDocument()
    expect(getPromotions()).toHaveLength(29)
  })

  it('tells you to create the first promotion when there are none', async () => {
    setPromotions([])
    renderAdmin(<PromotionsPage />, PATH)
    expect(await screen.findByText('No promotions yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Create promotion' })).toHaveLength(2)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows the list error on its own with a Retry, and keeps the cards', async () => {
    vi.mocked(service.listPromotions).mockRejectedValueOnce(network())
    renderAdmin(<PromotionsPage />, PATH)
    const list = await screen.findByRole('region', { name: 'Promotions' })
    expect(await within(list).findByText("We couldn't load the promotions.")).toBeInTheDocument()
    expect(await within(cards()).findByText('Redemptions')).toBeInTheDocument()

    await userEvent.click(within(list).getByRole('button', { name: 'Retry' }))
    expect(await within(table()).findByText('Accessories Fair')).toBeInTheDocument()
  })

  it('shows the cards error on its own with a Retry, and keeps the list', async () => {
    vi.mocked(service.getPromoSummary).mockRejectedValueOnce(network())
    renderAdmin(<PromotionsPage />, PATH)
    expect(await within(await screen.findByRole('region', { name: 'Promotions at a glance' })).findByText("We couldn't load the promotion figures.")).toBeInTheDocument()
    expect(await within(table()).findByText('Accessories Fair')).toBeInTheDocument()

    await userEvent.click(within(cards()).getByRole('button', { name: 'Retry' }))
    expect(await within(cards()).findByText('Redemptions')).toBeInTheDocument()
  })

  it('copies a code, and says so when the browser refuses', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await renderPage()
    await search('payday')
    await within(table()).findByText('Payday Sale')
    await userEvent.click(action('Copy code PAYDAY15'))
    expect(writeText).toHaveBeenCalledWith('PAYDAY15')
    expect(await screen.findByText('Copied PAYDAY15')).toBeInTheDocument()

    writeText.mockRejectedValueOnce(new Error('denied'))
    await userEvent.click(action('Copy code PAYDAY15'))
    expect(await screen.findByText(/^Couldn't copy PAYDAY15\./)).toBeInTheDocument()
  })

  describe('Applies to', () => {
    const product = (dialog: HTMLElement, name: string) => within(dialog).getByRole('checkbox', { name: new RegExp(`^${name},`) })

    async function pick(dialog: HTMLElement, select: string, option: string) {
      await userEvent.click(within(dialog).getByRole('combobox', { name: select }))
      await userEvent.click(await screen.findByRole('option', { name: option }))
    }

    async function openProducts() {
      await renderPage()
      const dialog = await openCreate()
      await pick(dialog, 'Applies to', 'Specific products')
      await within(dialog).findByRole('checkbox', { name: /^Linen Shirt,/ })
      return dialog
    }

    it('offers the real categories from the catalog and saves the one chosen', async () => {
      await renderPage()
      const dialog = await openCreate()
      await pick(dialog, 'Applies to', 'A category')
      await userEvent.click(await within(dialog).findByRole('combobox', { name: 'Category' }))
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a category', 'Denim', 'Knitwear'])
      expect(screen.queryByRole('option', { name: 'Jackets' })).toBeNull()
      await userEvent.click(screen.getByRole('option', { name: 'Knitwear' }))

      await fillValid(dialog)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Create promotion' }))
      expect(await screen.findByText('Promotion "Test Promo" created')).toBeInTheDocument()
      expect(service.createPromotion).toHaveBeenCalledWith(expect.objectContaining({ appliesTo: { scope: 'category', category: 'Knitwear' } }))
    })

    it('asks for a category before saving', async () => {
      await renderPage()
      const dialog = await openCreate()
      await pick(dialog, 'Applies to', 'A category')
      await within(dialog).findByRole('combobox', { name: 'Category' })
      await fillValid(dialog)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Create promotion' }))
      expect(await within(dialog).findByText('Choose the category this promotion applies to.')).toBeInTheDocument()
      expect(service.createPromotion).not.toHaveBeenCalled()
    })

    it('shows an error with a Retry when the categories fail, and still allows All products', async () => {
      vi.mocked(fetchProductFilters).mockRejectedValueOnce(network())
      await renderPage()
      const dialog = await openCreate()
      await pick(dialog, 'Applies to', 'A category')
      expect(await within(dialog).findByText("We couldn't load the categories.")).toBeInTheDocument()
      expect(within(dialog).getByText(/You can still choose All products/)).toBeInTheDocument()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Retry' }))
      expect(await within(dialog).findByRole('combobox', { name: 'Category' })).toBeInTheDocument()
      expect(fetchProductFilters).toHaveBeenCalledTimes(2)
    })

    it('says there are no categories yet when the catalog has none', async () => {
      vi.mocked(fetchProductFilters).mockResolvedValue(filters([]))
      await renderPage()
      const dialog = await openCreate()
      await pick(dialog, 'Applies to', 'A category')
      expect(await within(dialog).findByText(/^No categories yet/)).toBeInTheDocument()
    })

    it('searches products, adds them as chips, removes them and saves "2 products"', async () => {
      const dialog = await openProducts()
      expect(within(dialog).getByText('0 of 20')).toBeInTheDocument()

      await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Search products' }), 'tee 0')
      await waitFor(() => expect(fetchShopProducts).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'tee 0' }), expect.anything()))
      await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Tee 01, Denim' }))
      await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Tee 02, Denim' }))
      const chips = within(dialog).getByRole('list', { name: 'Selected products' })
      expect(within(chips).getAllByRole('listitem')).toHaveLength(2)
      expect(within(dialog).getByText('2 of 20')).toBeInTheDocument()
      expect(within(dialog).getByRole('checkbox', { name: 'Tee 01, Denim' })).toBeChecked()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Tee 02' }))
      expect(within(chips).getAllByRole('listitem')).toHaveLength(1)
      expect(within(dialog).getByRole('checkbox', { name: 'Tee 02, Denim' })).not.toBeChecked()
      await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Tee 03, Denim' }))

      await fillValid(dialog)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Create promotion' }))
      expect(await screen.findByText('Promotion "Test Promo" created')).toBeInTheDocument()
      expect(service.createPromotion).toHaveBeenCalledWith(
        expect.objectContaining({ appliesTo: { scope: 'products', products: [{ id: 'cat-tee-1', name: 'Tee 01' }, { id: 'cat-tee-3', name: 'Tee 03' }] } }),
      )
      await search('testpromo1')
      await within(table()).findByText('Test Promo')
      expect(within(rowOf('Test Promo')).getByText('2 products')).toBeInTheDocument()
    })

    it('says when no product matches the search and clears it on request', async () => {
      const dialog = await openProducts()
      await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Search products' }), 'zzz')
      expect(await within(dialog).findByText('No products match "zzz"')).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Clear search' }))
      expect(await within(dialog).findByRole('checkbox', { name: /^Linen Shirt,/ })).toBeInTheDocument()
    })

    it('shows an error with a Retry when the product search fails', async () => {
      vi.mocked(fetchShopProducts).mockRejectedValueOnce(network())
      await renderPage()
      const dialog = await openCreate()
      await pick(dialog, 'Applies to', 'Specific products')
      expect(await within(dialog).findByText("We couldn't load the products.")).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Retry' }))
      expect(await within(dialog).findByRole('checkbox', { name: /^Linen Shirt,/ })).toBeInTheDocument()
    })

    it('needs at least one product', async () => {
      const dialog = await openProducts()
      await fillValid(dialog)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Create promotion' }))
      expect(await within(dialog).findByText('Add at least 1 product to put on sale.')).toBeInTheDocument()
      expect(service.createPromotion).not.toHaveBeenCalled()
    })

    it('stops at 20 products', async () => {
      const dialog = await openProducts()
      await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Search products' }), 'tee')
      await within(dialog).findByRole('checkbox', { name: 'Tee 22, Denim' })
      for (let n = 1; n <= 20; n++) await userEvent.click(product(dialog, `Tee ${String(n).padStart(2, '0')}`))
      expect(within(dialog).getByText('20 of 20')).toBeInTheDocument()
      expect(product(dialog, 'Tee 21')).toBeDisabled()
      expect(product(dialog, 'Tee 20')).toBeEnabled()
      expect(within(dialog).getByText(/You can choose up to 20 products/)).toBeInTheDocument()
    })

    it('shows the target under each name, with the product count', async () => {
      await renderPage()
      expect(within(rowOf('Denim Days')).getByText('Bottoms')).toBeInTheDocument()
      expect(within(rowOf('Anniversary')).getByText('7 products')).toBeInTheDocument()
      expect(within(rowOf('Bucket Hat Drop')).getByText('1 product')).toBeInTheDocument()
      expect(within(rowOf('Accessories Fair')).getByText('Accessories')).toBeInTheDocument()
    })

    it('fills the sheet from each kind of target, keeping a category that left the catalog', async () => {
      await renderPage()
      await userEvent.click(action('Edit Anniversary'))
      let dialog = await screen.findByRole('dialog', { name: 'Edit Anniversary' })
      expect(within(dialog).getByRole('combobox', { name: 'Applies to' })).toHaveTextContent('Specific products')
      expect(within(dialog).getByText('7 of 20')).toBeInTheDocument()
      expect(within(within(dialog).getByRole('list', { name: 'Selected products' })).getAllByRole('listitem')).toHaveLength(7)
      expect(within(dialog).getByRole('button', { name: 'Remove Fence-Line Blazer' })).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

      await userEvent.click(action('Edit Denim Days'))
      dialog = await screen.findByRole('dialog', { name: 'Edit Denim Days' })
      expect(within(dialog).getByRole('combobox', { name: 'Applies to' })).toHaveTextContent('A category')
      // "Bottoms" is not in the mocked catalog, yet it stays selected.
      expect(await within(dialog).findByRole('combobox', { name: 'Category' })).toHaveTextContent('Bottoms')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

      await search('payday')
      await within(table()).findByText('Payday Sale')
      await userEvent.click(action('Edit Payday Sale'))
      dialog = await screen.findByRole('dialog', { name: 'Edit Payday Sale' })
      expect(within(dialog).getByRole('combobox', { name: 'Applies to' })).toHaveTextContent('All products')
      expect(within(dialog).queryByRole('searchbox')).toBeNull()
    })
  })
})
