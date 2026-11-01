import { expect, test, type Page, type Route } from '@playwright/test'
import { DEMO } from '../shared/session'
import { product, setupInventory, variant, type MockProduct } from '../shared/products'

// Staff Inventory filters (GET /products): the "More filters" panel (brand, size, colour, price), the removable chips and Clear all.
// GET /products is answered by the in-memory mockProducts, whose request URLs are recorded here and checked against the API's DTO.

const PAGE_ORIGIN = 'http://localhost:5173'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
/** The only query keys GET /products accepts. */
const DTO_KEYS = ['brand', 'sizes', 'colors', 'minPrice', 'maxPrice', 'gender', 'stockLevel', 'isArReady', 'sortBy', 'sortOrder', 'page', 'limit', 'search', 'category']

const isList = (url: URL) => url.origin !== PAGE_ORIGIN && url.pathname === '/products'

/** Every GET /products the page sends, in order. Register before navigating. */
function recordList(page: Page) {
  const urls: URL[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (request.method() === 'GET' && isList(url)) urls.push(url)
  })
  return urls
}

const emptyPage = { data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }

interface StartOptions {
  query?: string
  products?: MockProduct[]
  /** Runs after the mocks are in place and before the page loads, to add or override routes. */
  before?: (page: Page) => Promise<unknown>
}

async function start(page: Page, { query = '', products, before }: StartOptions = {}) {
  await setupInventory(
    page,
    products ?? [
      product({ name: 'Linen Shirt', variants: [variant({ size: 'M', color: 'Navy', price: 1500 })] }),
      product({ name: 'Wool Coat', brand: 'Northline', category: 'Hoodie', variants: [variant({ size: 'L', color: 'Grey', price: 4200 })] }),
    ],
  )
  const requests = recordList(page)
  await before?.(page)
  await page.goto(`/login?next=${encodeURIComponent(`/staff/inventory${query}`)}`)
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/staff\/inventory/)
  await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible()
  return requests
}

const summary = (page: Page) => page.getByText(/^\d+ (matching )?products?$/)
const chipList = (page: Page) => page.getByRole('list', { name: 'Active filters' })
const panel = (page: Page) => page.getByRole('dialog', { name: 'More filters', exact: true })
const moreButton = (page: Page) => page.getByRole('button', { name: /^More filters/ })
const query = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams)
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** Below the card's @4xl the filters sit under a "Filters (n)" summary; open it when it is there and closed. */
async function revealFilters(page: Page) {
  const toggle = page.getByText(/^Filters \(\d+\)$/)
  if ((await toggle.isVisible()) && (await toggle.evaluate((el) => !el.closest('details')!.open))) await toggle.click()
  await expect(moreButton(page)).toBeVisible()
}

async function openPanel(page: Page) {
  await revealFilters(page)
  await moreButton(page).click()
  await expect(panel(page)).toBeVisible()
  const dialog = panel(page)
  // The sheet slides in: wait for it to settle before reading its box.
  await expect.poll(async () => (await dialog.boundingBox())?.x).toBeGreaterThanOrEqual(0)
  return dialog
}

const apply = (page: Page) => panel(page).getByRole('button', { name: 'Apply filters', exact: true }).click()

const ALL = '?brand=Ayala%20Atelier&size=M&color=Black&gender=female&minPrice=100&maxPrice=900'
const CHIPS = [
  { name: 'Remove brand Ayala Atelier', key: 'brand' },
  { name: 'Remove size M', key: 'size' },
  { name: 'Remove color Black', key: 'color' },
  { name: 'Remove gender Women', key: 'gender' },
  { name: 'Remove price ₱100.00 to ₱900.00', key: 'minPrice' },
]

  test.describe('More filters panel', () => {
    test('opens a dialog named More filters with brand, size, colour and price, and nothing in the URL changes until Apply', async ({ page }) => {
      await start(page)
      const dialog = await openPanel(page)
      await expect(dialog.getByLabel('Brand (optional)')).toBeVisible()
      await expect(dialog.getByLabel('Another size')).toBeVisible()
      // The chips become the sizes the products have (here M and L) once the filters arrive.
      await expect(dialog.getByRole('button', { name: 'XXL', exact: true })).toHaveCount(0)
      for (const size of ['M', 'L']) await expect(dialog.getByRole('button', { name: size, exact: true })).toBeVisible()
      await expect(dialog.getByLabel('Colour (optional)')).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: 'Minimum' })).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: 'Maximum' })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Reset', exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Apply filters', exact: true })).toBeVisible()

      await dialog.getByLabel('Brand (optional)').fill('Nike')
      await dialog.getByRole('button', { name: 'M', exact: true }).click()
      await expect(dialog.getByText('4/50')).toBeVisible() // the brand counter
      expect(query(page)).toEqual({})

      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      expect(query(page)).toEqual({})
      await expect(chipList(page)).toHaveCount(0)

      // Reopening starts from what is applied, not from the abandoned draft.
      await openPanel(page)
      await expect(panel(page).getByLabel('Brand (optional)')).toHaveValue('')
      await expect(panel(page).getByLabel('Another size')).toHaveValue('')
    })

    test('Apply writes brand, size, colour and price to the URL, shows one chip each and a count on the button', async ({ page }) => {
      await start(page)
      const dialog = await openPanel(page)
      await dialog.getByLabel('Brand (optional)').fill('  Binondo Basics ')
      await dialog.getByRole('button', { name: 'M', exact: true }).click()
      await dialog.getByLabel('Colour (optional)').fill('Black')
      await dialog.getByRole('textbox', { name: 'Minimum' }).fill('100')
      await dialog.getByRole('textbox', { name: 'Maximum' }).fill('900.50')
      await apply(page)

      await expect(dialog).toBeHidden()
      expect(query(page)).toEqual({ brand: 'Binondo Basics', size: 'M', color: 'Black', minPrice: '100', maxPrice: '900.5' })
      const chips = chipList(page)
      await expect(chips.getByText('Binondo Basics')).toBeVisible()
      await expect(chips.getByText('M', { exact: true })).toBeVisible()
      await expect(chips.getByText('Black')).toBeVisible()
      await expect(chips.getByText('₱100.00 to ₱900.50')).toBeVisible()
      await expect(chips.getByRole('listitem')).toHaveCount(4)
      // Price counts once, however many bounds are set.
      await revealFilters(page)
      await expect(moreButton(page)).toHaveAccessibleName('More filters 4')
    })

    test('size chips toggle, stay in step with the typed size, and the price boxes take digits and two decimals only', async ({ page }) => {
      await start(page, { products: [product({ name: 'Linen Shirt', variants: [variant({ size: 'M' }), variant({ size: 'XL' })] })] })
      const dialog = await openPanel(page)
      const m = dialog.getByRole('button', { name: 'M', exact: true })
      await expect(m).toHaveAttribute('aria-pressed', 'false')
      await m.click()
      await expect(m).toHaveAttribute('aria-pressed', 'true')
      await expect(dialog.getByLabel('Another size')).toHaveValue('M')
      await dialog.getByLabel('Another size').fill('xl')
      await expect(m).toHaveAttribute('aria-pressed', 'false')
      await expect(dialog.getByRole('button', { name: 'XL', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await dialog.getByRole('button', { name: 'XL', exact: true }).click()
      await expect(dialog.getByLabel('Another size')).toHaveValue('')

      await dialog.getByRole('textbox', { name: 'Minimum' }).fill('ab1,2.345x')
      await expect(dialog.getByRole('textbox', { name: 'Minimum' })).toHaveValue('12.34')
    })

    test('a minimum above the maximum is named inside the panel and Apply stays disabled until it is fixed', async ({ page }) => {
      await start(page)
      const dialog = await openPanel(page)
      await dialog.getByRole('textbox', { name: 'Minimum' }).fill('900')
      await dialog.getByRole('textbox', { name: 'Maximum' }).fill('100')
      await expect(dialog.getByRole('alert')).toHaveText('The minimum is higher than the maximum. Lower the minimum or raise the maximum.')
      await expect(dialog.getByRole('textbox', { name: 'Minimum' })).toHaveAttribute('aria-invalid', 'true')
      await expect(dialog.getByRole('button', { name: 'Apply filters', exact: true })).toBeDisabled()
      await dialog.getByRole('textbox', { name: 'Maximum' }).fill('1000')
      await expect(dialog.getByRole('alert')).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: 'Apply filters', exact: true })).toBeEnabled()
    })

    test('Reset empties the draft only; Apply afterwards removes the filters from the URL', async ({ page }) => {
      await start(page, { query: '?brand=Nike&size=M&minPrice=100' })
      const dialog = await openPanel(page)
      await expect(dialog.getByLabel('Brand (optional)')).toHaveValue('Nike')
      await expect(dialog.getByRole('textbox', { name: 'Minimum' })).toHaveValue('100')
      await dialog.getByRole('button', { name: 'Reset', exact: true }).click()
      await expect(dialog.getByLabel('Brand (optional)')).toHaveValue('')
      await expect(dialog.getByRole('textbox', { name: 'Minimum' })).toHaveValue('')
      expect(query(page)).toEqual({ brand: 'Nike', size: 'M', minPrice: '100' })
      await apply(page)
      expect(query(page)).toEqual({})
      await expect(chipList(page)).toHaveCount(0)
    })

    test('a new filter drops page, and Back and Forward walk the filter history', async ({ page }) => {
      await start(page, { query: '?page=2&per=10' })
      const dialog = await openPanel(page)
      await dialog.getByLabel('Brand (optional)').fill('Nike')
      await apply(page)
      expect(query(page)).toEqual({ per: '10', brand: 'Nike' })

      await page.goBack()
      await expect(page).not.toHaveURL(/brand=/)
      await expect(chipList(page)).toHaveCount(0)
      await page.goForward()
      await expect(page).toHaveURL(/brand=Nike/)
      await expect(chipList(page).getByText('Nike')).toBeVisible()
    })

    test('a reload keeps every filter, the chips and the panel values', async ({ page }) => {
      await start(page, { query: ALL })
      await expect(chipList(page).getByRole('listitem')).toHaveCount(5)
      await page.reload()
      await expect(chipList(page).getByRole('listitem')).toHaveCount(5)
      expect(query(page)).toEqual({ brand: 'Ayala Atelier', size: 'M', color: 'Black', gender: 'female', minPrice: '100', maxPrice: '900' })
      const dialog = await openPanel(page)
      await expect(dialog.getByLabel('Brand (optional)')).toHaveValue('Ayala Atelier')
      await expect(dialog.getByLabel('Another size')).toHaveValue('M')
      await expect(dialog.getByLabel('Colour (optional)')).toHaveValue('Black')
      await expect(dialog.getByRole('textbox', { name: 'Minimum' })).toHaveValue('100')
      await expect(dialog.getByRole('textbox', { name: 'Maximum' })).toHaveValue('900')
    })
  })

  test.describe('active filter chips', () => {
    for (const chip of CHIPS) {
      test(`${chip.name} removes only that filter`, async ({ page }) => {
        await start(page, { query: ALL })
        const keys = chip.key === 'minPrice' ? ['minPrice', 'maxPrice'] : [chip.key]
        const before = query(page)
        await chipList(page).getByRole('button', { name: chip.name, exact: true }).click()
        await expect(chipList(page).getByRole('button', { name: chip.name, exact: true })).toHaveCount(0)
        const after = query(page)
        for (const key of keys) expect(after).not.toHaveProperty(key)
        for (const key of Object.keys(before).filter((k) => !keys.includes(k))) expect(after[key]).toBe(before[key])
        await expect(chipList(page).getByRole('listitem')).toHaveCount(4)
      })
    }

    test('a chip is removable with the keyboard alone', async ({ page }) => {
      await start(page, { query: '?brand=Nike&size=M' })
      const remove = chipList(page).getByRole('button', { name: 'Remove brand Nike' })
      await remove.focus()
      await page.keyboard.press('Enter')
      await expect(page).not.toHaveURL(/brand=/)
      await expect(page).toHaveURL(/size=M/)
    })

    test('Clear all removes the search and every filter but keeps the sort and page size', async ({ page }) => {
      await start(page, { query: `${ALL}&q=shirt&category=Hoodie&stock=in&sort=name&dir=desc&per=10` })
      await expect(chipList(page).getByRole('listitem')).toHaveCount(7)
      await page.getByRole('button', { name: 'Clear all', exact: true }).first().click()
      await expect(chipList(page)).toHaveCount(0)
      expect(query(page)).toEqual({ sort: 'name', dir: 'desc', per: '10' })
      await expect(page.getByRole('textbox', { name: /^Search products/ })).toHaveValue('')
    })

    test('the empty state names the search and every filter, and its Clear all brings the list back', async ({ page }) => {
      await start(page, {
        query: '?q=zzz&brand=Nope&size=XXL&color=Teal&minPrice=100&maxPrice=900',
        before: (p) =>
          p.route(
            (url) => isList(url),
            (route) => (route.request().method() === 'GET' ? route.fulfill({ json: emptyPage, headers: CORS }) : route.fallback()),
          ),
      })
      await expect(page.getByText('No products match', { exact: true })).toBeVisible()
      await expect(page.getByText('search "zzz", brand Nope, size XXL, color Teal, price ₱100.00 to ₱900.00.', { exact: false })).toBeVisible()
      // Two Clear all buttons: the chips row and the empty state.
      await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toHaveCount(2)
      await page.getByRole('button', { name: 'Clear all', exact: true }).last().click()
      expect(query(page)).toEqual({})
    })
  })

test.describe('the GET /products request', () => {
  /** Fails on any key the API would reject, a blank or NaN value, or a sort it does not have. */
  function expectValid(urls: URL[]) {
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      const text = url.search
      for (const [key, value] of url.searchParams) {
        expect(DTO_KEYS, `unknown key ${key} in ${text}`).toContain(key)
        expect(value.trim(), `blank ${key} in ${text}`).not.toBe('')
        expect(value, `${key} in ${text}`).not.toMatch(/^(NaN|undefined|null|Infinity)$/)
      }
      expect(text).not.toContain('basePrice')
      expect(['createdAt', 'name', 'price']).toContain(url.searchParams.get('sortBy'))
      expect(['asc', 'desc']).toContain(url.searchParams.get('sortOrder'))
      for (const key of ['page', 'limit']) expect(Number(url.searchParams.get(key))).toBeGreaterThan(0)
      for (const key of ['minPrice', 'maxPrice']) if (url.searchParams.has(key)) expect(Number(url.searchParams.get(key))).toBeGreaterThanOrEqual(0)
    }
  }
  const sorted = (url: URL) => [...url.searchParams.keys()].sort()

  test('the default load sends only sortBy, sortOrder, page and limit', async ({ page }) => {
    const urls = await start(page)
    await expect(summary(page)).toHaveText('2 products')
    expect(urls).toHaveLength(1)
    expect(sorted(urls[0])).toEqual(['limit', 'page', 'sortBy', 'sortOrder'])
    expect(Object.fromEntries(urls[0].searchParams)).toEqual({ sortBy: 'createdAt', sortOrder: 'desc', page: '1', limit: '25' })
    expectValid(urls)
  })

  test('every URL filter reaches the API under its DTO key', async ({ page }) => {
    const urls = await start(page, {
      query: '?q=shirt&category=Hoodie&gender=female&brand=Nike&size=M&color=Black&minPrice=100&maxPrice=900.5&stock=in&ar=yes&sort=name&dir=desc&page=2&per=10',
    })
    await expect.poll(() => urls.length).toBeGreaterThan(0)
    const last = urls.at(-1)!
    expect(sorted(last)).toEqual([...DTO_KEYS].sort())
    expect(Object.fromEntries(last.searchParams)).toEqual({
      search: 'shirt',
      category: 'Hoodie',
      gender: 'female',
      brand: 'Nike',
      sizes: 'M',
      colors: 'Black',
      minPrice: '100',
      maxPrice: '900.5',
      stockLevel: 'in',
      isArReady: 'true',
      sortBy: 'name',
      sortOrder: 'desc',
      page: '2',
      limit: '10',
    })
    expectValid(urls)
  })

  test('applying the panel, then removing a chip, sends a request that gains and then loses the key', async ({ page }) => {
    const urls = await start(page)
    await expect(summary(page)).toBeVisible()
    const dialog = await openPanel(page)
    await dialog.getByLabel('Brand (optional)').fill('Nike')
    await dialog.getByRole('button', { name: 'L', exact: true }).click()
    await dialog.getByLabel('Colour (optional)').fill('Black')
    await dialog.getByRole('textbox', { name: 'Minimum' }).fill('100')
    await dialog.getByRole('textbox', { name: 'Maximum' }).fill('900')
    await apply(page)
    await expect.poll(() => urls.at(-1)?.searchParams.get('brand')).toBe('Nike')
    expect(Object.fromEntries(urls.at(-1)!.searchParams)).toMatchObject({ brand: 'Nike', sizes: 'L', colors: 'Black', minPrice: '100', maxPrice: '900' })

    await chipList(page).getByRole('button', { name: 'Remove color Black' }).click()
    await expect.poll(() => urls.at(-1)?.searchParams.has('colors')).toBe(false)
    expect(Object.fromEntries(urls.at(-1)!.searchParams)).toMatchObject({ brand: 'Nike', sizes: 'L' })

    await chipList(page).getByRole('button', { name: 'Remove price ₱100.00 to ₱900.00' }).click()
    await expect.poll(() => urls.at(-1)?.searchParams.has('minPrice') || urls.at(-1)?.searchParams.has('maxPrice')).toBe(false)

    await page.getByRole('button', { name: 'Clear all', exact: true }).first().click()
    await expect.poll(() => sorted(urls.at(-1)!)).toEqual(['limit', 'page', 'sortBy', 'sortOrder'])
    expectValid(urls)
  })

  test('Gender and AR Fitting are sent; sold-out sizes stays selectable but sends nothing; In and Out send stockLevel', async ({ page }) => {
    const urls = await start(page, { query: '?stock=sizes&ar=yes&gender=male' })
    await expect(summary(page)).toBeVisible()
    // Sizes has no backend filter: it shows as a chip and in the URL, and never reaches GET /products.
    await expect(chipList(page).getByRole('button', { name: 'Remove gender Men' })).toBeVisible()
    await expect(chipList(page).getByRole('button', { name: 'Remove stock Has out-of-stock sizes' })).toBeVisible()
    expect(urls.every((url) => !url.searchParams.has('stockLevel'))).toBe(true)
    await expect(chipList(page).getByRole('button', { name: 'Remove AR Fitting AR Fitting ready' })).toBeVisible()
    expect(urls.every((url) => url.searchParams.get('gender') === 'male')).toBe(true)
    expect(urls.every((url) => url.searchParams.get('isArReady') === 'true')).toBe(true)
    expect(urls.every((url) => !url.searchParams.has('inStockOnly') && !url.searchParams.has('ar') && !url.searchParams.has('arReady'))).toBe(true)
    await revealFilters(page)
    await page.getByRole('combobox', { name: 'Stock' }).click()
    await expect(page.getByRole('option')).toHaveText(['All stock levels', 'In stock', 'Out of stock', 'Has out-of-stock sizes'])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('combobox', { name: 'AR Fitting' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Gender' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Stock' }).click()
    await page.getByRole('option', { name: 'In stock' }).click()
    await expect.poll(() => urls.at(-1)?.searchParams.get('stockLevel')).toBe('in')
    await page.getByRole('combobox', { name: 'Stock' }).click()
    await page.getByRole('option', { name: 'Out of stock' }).click()
    await expect.poll(() => urls.at(-1)?.searchParams.get('stockLevel')).toBe('out')
    expect(urls.every((url) => !url.searchParams.has('inStockOnly'))).toBe(true)
    expectValid(urls)
  })

  test('AR Fitting sends isArReady only when chosen, and the list narrows to match', async ({ page }) => {
    const urls = await start(page, {
      products: [
        product({ name: 'Linen Shirt', isArReady: true, variants: [variant({ size: 'M', color: 'Navy', price: 1500 })] }),
        product({ name: 'Wool Coat', brand: 'Northline', variants: [variant({ size: 'L', color: 'Grey', price: 4200 })] }),
      ],
    })
    const row = (name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) })
    await expect(row('Linen Shirt')).toBeVisible()
    await expect(row('Wool Coat')).toBeVisible()
    expect(urls.every((url) => !url.searchParams.has('isArReady'))).toBe(true)

    await revealFilters(page)
    await page.getByRole('combobox', { name: 'AR Fitting' }).click()
    await page.getByRole('option', { name: 'AR Fitting ready' }).click()
    await expect.poll(() => urls.at(-1)?.searchParams.get('isArReady')).toBe('true')
    await expect(row('Wool Coat')).toHaveCount(0)
    await expect(row('Linen Shirt')).toBeVisible()

    await page.getByRole('combobox', { name: 'AR Fitting' }).click()
    await page.getByRole('option', { name: 'Not AR ready' }).click()
    await expect.poll(() => urls.at(-1)?.searchParams.get('isArReady')).toBe('false')
    await expect(row('Linen Shirt')).toHaveCount(0)
    await expect(row('Wool Coat')).toBeVisible()

    await page.getByRole('combobox', { name: 'AR Fitting' }).click()
    await page.getByRole('option', { name: 'All products' }).click()
    await expect.poll(() => urls.at(-1)?.searchParams.has('isArReady')).toBe(false)
    await expect(row('Linen Shirt')).toBeVisible()
    await expect(row('Wool Coat')).toBeVisible()
    expectValid(urls)
  })

  test('the sort menu price options send sortBy=price with the chosen direction', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const urls = await start(page)
    await page.getByRole('combobox', { name: 'Sort by' }).click()
    await expect(page.getByRole('option')).toHaveText(['Newest first', 'Oldest first', 'Name: A to Z', 'Name: Z to A', 'Price: low to high', 'Price: high to low'])
    await page.getByRole('option', { name: 'Price: high to low' }).click()
    await expect(page).toHaveURL(/sort=price/)
    await expect.poll(() => urls.length).toBeGreaterThan(1)
    expect(Object.fromEntries(urls.at(-1)!.searchParams)).toMatchObject({ sortBy: 'price', sortOrder: 'desc' })
    await page.getByRole('combobox', { name: 'Sort by' }).click()
    await page.getByRole('option', { name: 'Price: low to high' }).click()
    await expect.poll(() => urls.at(-1)?.searchParams.get('sortOrder')).toBe('asc')
    expect(urls.at(-1)!.searchParams.get('sortBy')).toBe('price')
    expectValid(urls)
  })

  test('the Price column header stays a sort button, and sorting by it sends sortBy=price, never basePrice', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    const urls = await start(page)
    const header = (name: string) => page.getByRole('columnheader', { name })
    await expect(header('AR Fitting')).toBeVisible()
    await header('Price').getByRole('button').click()
    await expect(page).toHaveURL(/sort=price/)
    await expect.poll(() => urls.length).toBeGreaterThan(1)
    expect(urls.at(-1)!.searchParams.get('sortBy')).toBe('price')
    expect(urls.at(-1)!.searchParams.get('sortOrder')).toBe('asc')
    await header('Product').getByRole('button').click()
    await expect.poll(() => urls.at(-1)?.searchParams.get('sortBy')).toBe('name')
    await expect.poll(() => urls.at(-1)?.searchParams.get('sortOrder')).toBe('asc')
    expectValid(urls)
  })

  for (const [price, order] of [['?sort=price', 'asc'], ['?sort=price&dir=asc', 'asc'], ['?sort=price&dir=desc', 'desc']]) {
    test(`a ${price} URL sends sortBy=price, ${order}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      const urls = await start(page, { query: price })
      await expect(summary(page)).toBeVisible()
      expect(urls.length).toBeGreaterThan(0)
      for (const url of urls) {
        expect(url.search).not.toContain('basePrice')
        expect(url.searchParams.get('sortBy')).toBe('price')
        expect(url.searchParams.get('sortOrder')).toBe(order)
      }
      await expect(page.getByRole('combobox', { name: 'Sort by' })).toContainText('Price')
    })
  }

  test('a minimum above the maximum sends no request, shows the alert, and Clear price range asks the API again', async ({ page }) => {
    const urls = await start(page, { query: '?minPrice=900&maxPrice=100&brand=Nike' })
    const alert = page.getByRole('alert').filter({ hasText: 'The minimum price (₱900.00) is higher than the maximum (₱100.00)' })
    await expect(alert).toBeVisible()
    await expect(page.getByText('No products match', { exact: true })).toHaveCount(0)
    expect(urls).toHaveLength(0)

    await alert.getByRole('button', { name: 'Clear price range' }).click()
    await expect(alert).toHaveCount(0)
    await expect.poll(() => urls.length).toBe(1)
    expect(Object.fromEntries(urls[0].searchParams)).toMatchObject({ brand: 'Nike' })
    expect(urls[0].searchParams.has('minPrice')).toBe(false)
    expect(urls[0].searchParams.has('maxPrice')).toBe(false)
  })

  test('a failed load keeps the filters in the URL, says what happened, and Retry asks again with the same filters', async ({ page }) => {
    let failures = 1
    const urls = await start(page, {
      query: '?brand=Nike&size=M',
      before: (p) =>
        p.route(
          (url) => isList(url),
          (route: Route) => {
            if (route.request().method() === 'GET' && failures-- > 0) return route.fulfill({ status: 500, json: { message: 'boom' }, headers: CORS })
            return route.fallback()
          },
        ),
    })
    await expect(page.getByRole('alert')).toContainText("We couldn't load the products.")
    expect(query(page)).toEqual({ brand: 'Nike', size: 'M' })
    await expect(chipList(page).getByRole('listitem')).toHaveCount(2)
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(summary(page)).toBeVisible()
    expect(urls).toHaveLength(2)
    expect(urls[1].search).toBe(urls[0].search)
  })
})

test.describe('layout and input modes', () => {
  test('the panel is a right-hand panel on wide screens and a bottom sheet on phones, and always inside the viewport', async ({ page }) => {
    await start(page)
    const viewport = page.viewportSize()!
    const dialog = await openPanel(page)
    // The panel slides in, so each edge is polled until it lands.
    const edges = async () => {
      const box = (await dialog.boundingBox())!
      return { left: Math.round(box.x), right: Math.round(box.x + box.width), top: Math.round(box.y), bottom: Math.round(box.y + box.height) }
    }
    if (viewport.width >= 640) {
      await expect.poll(edges).toMatchObject({ right: viewport.width, top: 0, bottom: viewport.height })
      expect((await edges()).left).toBeGreaterThan(0)
    } else {
      await expect.poll(edges).toMatchObject({ left: 0, right: viewport.width, bottom: viewport.height })
      expect((await edges()).top).toBeGreaterThan(0)
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })

  test('at 320px the sheet is usable: nothing scrolls sideways, every control is 44px, and Apply works from the footer', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await start(page, { query: ALL })
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    const dialog = await openPanel(page)
    await expect(dialog.getByRole('button', { name: 'Apply filters', exact: true })).toBeInViewport()
    await expect(dialog.getByRole('button', { name: 'Reset', exact: true })).toBeInViewport()
    // "Apply filters" stays on one line.
    expect((await dialog.getByRole('button', { name: 'Apply filters', exact: true }).boundingBox())!.height).toBeLessThan(52)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    expect(await dialog.getByRole('region').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)

    const controls = [
      ...(await dialog.getByRole('button').all()),
      ...(await dialog.getByRole('textbox').all()),
    ]
    for (const control of controls) {
      await control.scrollIntoViewIfNeeded()
      const box = (await control.boundingBox())!
      const label = (await control.getAttribute('aria-label')) ?? (await control.textContent()) ?? (await control.getAttribute('id'))
      expect(box.height, `${label} height`).toBeGreaterThanOrEqual(43.5)
      expect(box.width, `${label} width`).toBeGreaterThanOrEqual(43.5)
      expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `${label} right edge`).toBeLessThanOrEqual(320.5)
    }

    await dialog.getByLabel('Brand (optional)').fill('Binondo Basics')
    await dialog.getByRole('button', { name: 'Apply filters', exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(query(page).brand).toBe('Binondo Basics')
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })

  test('with many chips at 320px the chips row wraps and nothing overflows', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await start(page, { query: '?brand=A%20very%20long%20brand%20name%20indeed&size=XXXXXXXXXXXXXXXXXXXXXXXXX&color=Dark%20greenish%20blue&minPrice=100&maxPrice=900&gender=female' })
    await expect(chipList(page).getByRole('listitem')).toHaveCount(5)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    const right = await chipList(page).getByRole('listitem').evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().right)))
    expect(right).toBeLessThanOrEqual(320)
  })

  test('on a touch screen chip remove buttons, chips and Clear all are at least 44px', async ({ page }) => {
    await start(page, { query: ALL })
    test.skip(!(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)), 'only touch screens use the 44px targets')
    await expect(chipList(page).getByRole('listitem')).toHaveCount(5)
    const targets = [...(await chipList(page).getByRole('button').all()), ...(await chipList(page).getByRole('listitem').all()), page.getByRole('button', { name: 'Clear all', exact: true }).first()]
    for (const target of targets) {
      const box = (await target.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(43.5)
    }
    for (const button of await chipList(page).getByRole('button').all()) expect((await button.boundingBox())!.width).toBeGreaterThanOrEqual(43.5)
  })

  test('on a touch screen the Active and Archived tabs are 44px tall', async ({ page }) => {
    await start(page)
    test.skip(!(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)), 'only touch screens use the 44px targets')
    await revealFilters(page)
    for (const tab of await page.getByRole('tab').all()) expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
  })

  test('removing a chip hands focus to a neighbouring chip, then to More filters', async ({ page }) => {
    await start(page, { query: '?brand=Ayala%20Atelier&size=M' })
    await revealFilters(page)
    await chipList(page).getByRole('button', { name: 'Remove brand Ayala Atelier' }).click()
    await expect(chipList(page).getByRole('button', { name: 'Remove size M' })).toBeFocused()
    await expect(chipList(page).getByRole('listitem')).toHaveCount(1)
    await chipList(page).getByRole('button', { name: 'Remove size M' }).click()
    await expect(moreButton(page)).toBeFocused()
  })

  test('Tab stays inside the panel, Escape closes it and focus returns to More filters', async ({ page }) => {
    await start(page)
    await revealFilters(page)
    await moreButton(page).focus()
    await page.keyboard.press('Enter')
    const dialog = panel(page)
    await expect(dialog).toBeVisible()
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1}`).toBe(true)
    }
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Shift+Tab')
      expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `Shift+Tab ${i + 1}`).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(moreButton(page)).toBeFocused()
  })

  test('the panel can be filled and applied with the keyboard alone, and focus returns to More filters', async ({ page }) => {
    await start(page)
    await revealFilters(page)
    await moreButton(page).focus()
    await page.keyboard.press('Enter')
    const dialog = panel(page)
    await dialog.getByLabel('Brand (optional)').focus()
    await page.keyboard.type('Lumban Loom')
    await dialog.getByRole('button', { name: 'L', exact: true }).focus()
    await page.keyboard.press('Space')
    await dialog.getByRole('button', { name: 'Apply filters', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    expect(query(page)).toEqual({ brand: 'Lumban Loom', size: 'L' })
    await expect(moreButton(page)).toBeFocused()
  })

  test('Close, the backdrop and Escape all leave the URL alone', async ({ page }) => {
    await start(page)
    let dialog = await openPanel(page)
    await dialog.getByLabel('Brand (optional)').fill('Nike')
    await dialog.getByRole('button', { name: 'Close More filters' }).click()
    await expect(dialog).toBeHidden()
    expect(query(page)).toEqual({})
    dialog = await openPanel(page)
    await page.mouse.click(3, 3)
    await expect(dialog).toBeHidden()
    expect(query(page)).toEqual({})
  })
})

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
    await page.emulateMedia({ colorScheme: 'dark' })
  })

  test('chips, the empty state and the panel are readable on a dark surface', async ({ page }, testInfo) => {
    await start(page, { query: ALL })
    await expect(page.locator('html')).toHaveClass(/dark/)
    const colors = (locator: ReturnType<Page['locator']>) =>
      locator.evaluate((el) => {
        let bg = 'rgba(0, 0, 0, 0)'
        for (let node: Element | null = el; node; node = node.parentElement) {
          bg = getComputedStyle(node).backgroundColor
          if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') break
        }
        return { text: getComputedStyle(el).color, bg }
      })
    const luminance = (rgb: string) => {
      const [r, g, b] = (rgb.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number)
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    }

    const chip = await colors(chipList(page).getByText('Ayala Atelier'))
    expect(chip.text).not.toBe(chip.bg)
    expect(luminance(chip.bg), 'chip surface is dark').toBeLessThan(0.4)
    expect(luminance(chip.text), 'chip text is light').toBeGreaterThan(0.6)
    const heading = await colors(page.getByText('No products match', { exact: true }))
    expect(luminance(heading.text)).toBeGreaterThan(0.6)
    await testInfo.attach('inventory-filters-dark-chips', { body: await page.screenshot(), contentType: 'image/png' })

    const dialog = await openPanel(page)
    const label = await colors(dialog.getByText('Variant price (PHP)'))
    expect(luminance(label.bg), 'panel surface is dark').toBeLessThan(0.4)
    expect(luminance(label.text), 'panel label is light').toBeGreaterThan(0.6)
    const input = await colors(dialog.getByLabel('Brand (optional)'))
    expect(input.text).not.toBe(input.bg)
    expect(luminance(input.bg), 'input is dark').toBeLessThan(0.4)
    await testInfo.attach('inventory-filters-dark-panel', { body: await page.screenshot(), contentType: 'image/png' })
  })
})
