import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { IMAGE_HOST, product, setupInventory, variant, type MockProduct, type ProductsMock } from '../shared/products'
import { DEMO } from '../shared/session'
import { mockSizeMeasurements, sizeRow, type MockSize } from '../shared/sizeMeasurements'

// Staff Inventory against GET /products, which is the in-memory mockProducts (tests/shared/products.ts). Auth and /users/me are mocked,
// and each test signs in through the real form.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const PAGE_ORIGIN = 'http://localhost:5173'

const LINEN_ID = '11111111-1111-4111-8111-111111111111'
const WOOL_ID = '22222222-2222-4222-8222-222222222222'
const CHEST_55 = {
  chestWidthCm: 55,
  waistWidthCm: null,
  hipWidthCm: null,
  totalLengthCm: null,
  inseamCm: null,
  shoulderWidthCm: null,
  sleeveLengthCm: null,
  neckCm: null,
  thighCm: null,
}

const linen = (overrides: Partial<MockProduct> = {}) =>
  product({
    id: LINEN_ID,
    name: 'Linen Shirt',
    variants: [
      variant({ id: 'linen-s', sku: 'LS-NAVY-S', size: 'S', color: 'Navy', colorHex: '#1b2a49', price: 1500, stock: 10 }),
      variant({ id: 'linen-m', sku: 'LS-NAVY-M', size: 'M', color: 'Navy', colorHex: '#1b2a49', price: 1700, stock: 5, measurements: CHEST_55 }),
    ],
    ...overrides,
  })
const wool = () =>
  product({
    id: WOOL_ID,
    name: 'Wool Coat',
    category: 'Hoodie',
    brand: 'Northline',
    createdAt: '2026-04-01T08:00:00.000Z',
    variants: [variant({ id: 'wool-m', sku: 'WC-GREY-M', size: 'M', color: 'Grey', colorHex: '#808080', price: 4200, stock: 3 })],
  })

const isApi = (url: URL, path: RegExp) => url.origin !== PAGE_ORIGIN && path.test(url.pathname)
const PRODUCT_PATH = /^\/products\/[^/]+$/
const VARIANTS_PATH = /^\/products\/[^/]+\/variants$/
const VARIANT_PATH = /^\/products\/[^/]+\/variants\/[^/]+$/

/** Answers the first `times` matching requests with `reply`; every other request, and the later ones, go on to mockProducts. */
async function interceptOnce(page: Page, method: string, path: RegExp, reply: (route: Route) => Promise<void>, times = 1) {
  let left = times
  await page.route(
    (url) => isApi(url, path),
    (route) => {
      if (left > 0 && route.request().method() === method) {
        left -= 1
        return reply(route)
      }
      return route.fallback()
    },
  )
}
const failWith = (status: number, json: object = {}) => (route: Route) => route.fulfill({ status, json, headers: CORS })

/** Holds every matching request until `release()`. */
async function hold(page: Page, method: string, path: RegExp) {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route(
    (url) => isApi(url, path),
    async (route) => {
      if (route.request().method() === method) await gate
      await route.fallback()
    },
  )
  return release
}

async function start(page: Page, products: MockProduct[] = [linen(), wool()], baseSizes: MockSize[] = []): Promise<ProductsMock> {
  const api = await setupInventory(page, products)
  await mockSizeMeasurements(page, baseSizes)
  await page.goto('/login?next=%2Fstaff%2Finventory')
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/staff\/inventory$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible()
  return api
}

const rowButton = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) })
const drawerOf = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true })
const prompt = (page: Page) => page.getByRole('dialog', { name: 'Are you sure?', exact: true })
const variantDialog = (page: Page, mode: 'Add' | 'Edit') => page.getByRole('dialog', { name: `${mode} variant`, exact: true })
const detailsDialog = (page: Page) => page.getByRole('dialog', { name: 'Edit details', exact: true })

/** Opens a product's drawer and waits for its variants. */
async function openDrawer(page: Page, name: string) {
  await rowButton(page, name).click()
  const drawer = drawerOf(page, name)
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('table')).toBeVisible()
  return drawer
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const toast = (page: Page, text: string) => page.getByText(text, { exact: true })

test.describe('products API', () => {
  test('lists the active products from GET /products and has no sample-data badge', async ({ page }) => {
    const api = await start(page)
    await expect(rowButton(page, 'Linen Shirt')).toBeVisible()
    await expect(rowButton(page, 'Wool Coat')).toBeVisible()
    await expect(page.getByText('Sample data', { exact: true })).toHaveCount(0)
    expect(api.of('GET', 'list').length).toBeGreaterThan(0)
  })
})

test.describe('delete product', () => {
  test('Cancel keeps the product; Delete Product removes it, refreshes the list, toasts and focuses Add product', async ({ page }) => {
    const api = await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Delete product', exact: true }).click()

    const confirm = prompt(page)
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText('Linen Shirt and its 2 variants, images and AR measurements will be permanently deleted')
    await expect(confirm).toContainText("This can't be undone")
    await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()

    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(drawerOf(page, 'Linen Shirt')).toBeVisible()
    expect(api.of('DELETE', 'product')).toHaveLength(0)
    // Cancel hands focus back to the button that asked.
    await expect(drawerOf(page, 'Linen Shirt').getByRole('button', { name: 'Delete product', exact: true })).toBeFocused()

    const listReads = api.of('GET', 'list').length
    await drawerOf(page, 'Linen Shirt').getByRole('button', { name: 'Delete product', exact: true }).click()
    await prompt(page).getByRole('button', { name: 'Delete Product', exact: true }).click()

    await expect(toast(page, 'Linen Shirt deleted')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(api.of('DELETE', 'product')).toHaveLength(1)
    expect(api.of('DELETE', 'product')[0].productId).toBe(LINEN_ID)
    await expect(rowButton(page, 'Linen Shirt')).toHaveCount(0)
    await expect(rowButton(page, 'Wool Coat')).toBeVisible()
    expect(api.of('GET', 'list').length).toBeGreaterThan(listReads)
    await expect(page.getByRole('button', { name: 'Add product', exact: true })).toBeFocused()
  })

  test('the confirm button is busy and everything else is ignored while the delete is pending', async ({ page }) => {
    const api = await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    const release = await hold(page, 'DELETE', PRODUCT_PATH)
    await drawer.getByRole('button', { name: 'Delete product', exact: true }).click()
    const confirm = prompt(page)
    await confirm.getByRole('button', { name: 'Delete Product', exact: true }).click()

    await expect(confirm.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
    await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(confirm).toBeVisible()
    release()
    await expect(toast(page, 'Linen Shirt deleted')).toBeVisible()
    expect(api.of('DELETE', 'product')).toHaveLength(1)
  })

  test('a failed delete stays in the modal with the reason, and Delete Product again works', async ({ page }) => {
    const api = await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await interceptOnce(page, 'DELETE', PRODUCT_PATH, failWith(500))
    await drawer.getByRole('button', { name: 'Delete product', exact: true }).click()
    const confirm = prompt(page)
    await confirm.getByRole('button', { name: 'Delete Product', exact: true }).click()

    await expect(confirm.getByRole('alert')).toContainText("Couldn't delete Linen Shirt. Something went wrong on our side. Try again in a moment.")
    await expect(confirm).toBeVisible()
    await expect(confirm.getByRole('button', { name: 'Delete Product', exact: true })).toBeEnabled()
    expect(api.rows.map((p) => p.name)).toContain('Linen Shirt')

    await confirm.getByRole('button', { name: 'Delete Product', exact: true }).click()
    await expect(toast(page, 'Linen Shirt deleted')).toBeVisible()
    await expect(rowButton(page, 'Linen Shirt')).toHaveCount(0)
    expect(api.rows.map((p) => p.name)).toEqual(['Wool Coat'])
  })

  test('a 404 means it is already gone, so it counts as deleted', async ({ page }) => {
    const api = await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await interceptOnce(page, 'DELETE', PRODUCT_PATH, async (route) => {
      api.rows = api.rows.filter((p) => p.id !== LINEN_ID) // someone else deleted it first
      await route.fulfill({ status: 404, json: { message: 'Product not found' }, headers: CORS })
    })
    await drawer.getByRole('button', { name: 'Delete product', exact: true }).click()
    await prompt(page).getByRole('button', { name: 'Delete Product', exact: true }).click()

    await expect(toast(page, 'Linen Shirt deleted')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(rowButton(page, 'Linen Shirt')).toHaveCount(0)
  })

  test('a 403 says the account is not allowed to delete products and keeps the product', async ({ page }) => {
    const api = await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await interceptOnce(page, 'DELETE', PRODUCT_PATH, failWith(403, { message: 'Forbidden resource' }))
    await drawer.getByRole('button', { name: 'Delete product', exact: true }).click()
    await prompt(page).getByRole('button', { name: 'Delete Product', exact: true }).click()
    await expect(prompt(page).getByRole('alert')).toContainText('Your account is not allowed to delete products. Sign in again, or ask an admin for access.')
    expect(api.rows).toHaveLength(2)
  })
})

test.describe('add variant', () => {
  async function openAdd(page: Page) {
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Add color variant', exact: true }).click()
    const dialog = variantDialog(page, 'Add')
    await expect(dialog).toBeVisible()
    await expect(drawerOf(page, 'Linen Shirt')).toHaveCount(0) // the drawer steps aside
    return dialog
  }
  const fillPrice = (dialog: Locator, price = '1650.50') => dialog.getByLabel('Price (PHP)', { exact: true }).fill(price)

  test('posts the exact body, toasts, and brings the drawer back with the new variant', async ({ page }) => {
    const api = await start(page)
    const dialog = await openAdd(page)
    await dialog.getByLabel('Size (optional)', { exact: true }).fill('xl')
    await dialog.getByLabel('Colour name (optional)', { exact: true }).fill('Olive')
    await dialog.getByLabel('Colour hex', { exact: true }).fill('556B2F')
    await dialog.getByLabel('SKU (optional)', { exact: true }).fill('ls-olive-xl')
    await fillPrice(dialog)
    await dialog.getByLabel('Stock', { exact: true }).fill('12')
    await dialog.getByLabel('Chest width', { exact: true }).fill('55.5')
    await dialog.getByLabel('Shoulder width', { exact: true }).fill('50')
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()

    await expect(toast(page, 'Variant added')).toBeVisible()
    expect(api.of('POST', 'variants').map((c) => c.body)).toEqual([
      {
        sku: 'LS-OLIVE-XL',
        size: 'XL',
        color: 'Olive',
        colorHex: '#556b2f',
        price: 1650.5,
        stock: 12,
        measurements: { chestWidthCm: 55.5, shoulderWidthCm: 50 },
      },
    ])
    expect(api.of('POST', 'variants')[0].productId).toBe(LINEN_ID)
    const drawer = drawerOf(page, 'Linen Shirt')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText('LS-OLIVE-XL')).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Edit Olive XL' })).toBeVisible()
  })

  test('inherit base measurements is on for a size with a base row and posts those values', async ({ page }) => {
    const api = await start(page, [linen(), wool()], [sizeRow({ category: 'Hoodie', size: 'XL', chestWidthCm: 61, totalLengthCm: 74, shoulderWidthCm: 50, sleeveLengthCm: 64, neckCm: 40 })])
    const dialog = await openAdd(page)
    await dialog.getByLabel('Size (optional)', { exact: true }).fill('xl')
    await fillPrice(dialog)
    const inherit = dialog.getByRole('checkbox', { name: 'Inherit base measurements' })
    await expect(inherit).toBeChecked()
    await expect(dialog.getByText('Copied from Hoodie XL in Base measurements.')).toBeVisible()
    await expect(dialog.getByLabel('Chest width', { exact: true })).toBeDisabled()
    await expect(dialog.getByLabel('Chest width', { exact: true })).toHaveValue('61')
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()
    await expect(toast(page, 'Variant added')).toBeVisible()
    expect(api.of('POST', 'variants')[0].body).toMatchObject({ size: 'XL', measurements: { chestWidthCm: 61, totalLengthCm: 74, shoulderWidthCm: 50, sleeveLengthCm: 64, neckCm: 40 } })

  })

  test('turning inherit off starts from the base values and posts what was typed', async ({ page }) => {
    const api = await start(page, [linen(), wool()], [sizeRow({ category: 'Hoodie', size: 'XL', chestWidthCm: 61, totalLengthCm: 74, shoulderWidthCm: 50, sleeveLengthCm: 64, neckCm: 40 })])
    const dialog = await openAdd(page)
    await dialog.getByLabel('Size (optional)', { exact: true }).fill('xl')
    await fillPrice(dialog)
    await dialog.getByText('Inherit base measurements', { exact: true }).click()
    await expect(dialog.getByLabel('Chest width', { exact: true })).toBeEnabled()
    await expect(dialog.getByLabel('Chest width', { exact: true })).toHaveValue('61')
    await dialog.getByLabel('Chest width', { exact: true }).fill('63')
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()
    await expect(toast(page, 'Variant added')).toBeVisible()
    expect(api.of('POST', 'variants')[0].body).toMatchObject({ measurements: { chestWidthCm: 63, totalLengthCm: 74 } })
  })

  test('a size without a base row disables the checkbox with a hint and keeps the manual boxes', async ({ page }) => {
    await start(page, [linen(), wool()], [sizeRow({ category: 'Hoodie', size: 'XL' })])
    const dialog = await openAdd(page)
    await dialog.getByLabel('Size (optional)', { exact: true }).fill('XXS')
    await expect(dialog.getByText('No base measurements for Hoodie XXS yet')).toBeVisible()
    await expect(dialog.getByRole('checkbox', { name: 'Inherit base measurements' })).toBeDisabled()
    await expect(dialog.getByLabel('Chest width', { exact: true })).toBeEnabled()
  })

  test('a blank SKU, no colour and no measurements are left out of the body', async ({ page }) => {
    const api = await start(page)
    const dialog = await openAdd(page)
    await dialog.getByLabel('Variant name (optional)', { exact: true }).fill('Gift set')
    await fillPrice(dialog, '99')
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()
    await expect(toast(page, 'Variant added')).toBeVisible()
    expect(api.of('POST', 'variants').map((c) => c.body)).toEqual([{ name: 'Gift set', price: 99, stock: 0 }])
  })

  test('a taken SKU (409) is shown on the SKU field, and a new SKU saves', async ({ page }) => {
    const api = await start(page)
    const dialog = await openAdd(page)
    await dialog.getByLabel('Size (optional)', { exact: true }).fill('L')
    await dialog.getByLabel('SKU (optional)', { exact: true }).fill('wc-grey-m')
    await fillPrice(dialog)
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()

    const sku = dialog.getByLabel('SKU (optional)', { exact: true })
    await expect(dialog.getByText('SKU WC-GREY-M is already used by another variant. Change the SKU.')).toBeVisible()
    await expect(sku).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByRole('alert')).toContainText("Couldn't add the variant.")
    await expect(dialog.getByRole('alert')).toContainText('That SKU is already used by another variant. Change the SKU, then try again.')
    // A 409 is not retried as-is: there is no Try again, the SKU has to change.
    await expect(dialog.getByRole('button', { name: 'Try again' })).toHaveCount(0)
    expect(api.of('POST', 'variants')).toHaveLength(1)

    await sku.fill('LS-NAVY-L')
    await expect(dialog.getByText('is already used by another variant', { exact: false }).filter({ hasText: 'SKU WC-GREY-M' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()
    await expect(toast(page, 'Variant added')).toBeVisible()
    expect(api.of('POST', 'variants')).toHaveLength(2)
  })

  test('a colour needs its hex: the error is inline, the hex is focused and nothing is sent', async ({ page }) => {
    const api = await start(page)
    const dialog = await openAdd(page)
    await dialog.getByLabel('Colour name (optional)', { exact: true }).fill('Olive')
    await fillPrice(dialog)
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()

    await expect(dialog.getByText('Enter a hex colour such as #1b1d21 or #fff.')).toBeVisible()
    await expect(dialog.getByLabel('Colour hex', { exact: true })).toBeFocused()
    expect(api.of('POST', 'variants')).toHaveLength(0)

    await dialog.getByLabel('Colour hex', { exact: true }).fill('abc')
    await expect(dialog.getByLabel('Colour hex', { exact: true })).toHaveValue('#abc')
    await expect(dialog.getByText('Enter a hex colour such as #1b1d21 or #fff.')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()
    await expect(toast(page, 'Variant added')).toBeVisible()
    expect(api.of('POST', 'variants')[0].body).toMatchObject({ color: 'Olive', colorHex: '#abc' })
  })

  test('needs at least one of size, colour or name, and a price', async ({ page }) => {
    const api = await start(page)
    const dialog = await openAdd(page)
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()

    await expect(dialog.getByText('Enter a size, a colour or a variant name so this variant can be told apart.')).toBeVisible()
    await expect(dialog.getByText('Enter an amount above 0 and up to 1,000,000, with at most 2 decimals.')).toBeVisible()
    await expect(dialog.getByLabel('Size (optional)', { exact: true })).toBeFocused()
    await expect(dialog.getByLabel('Size (optional)', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    expect(api.of('POST', 'variants')).toHaveLength(0)

    // Any one of the three is enough.
    await dialog.getByLabel('Variant name (optional)', { exact: true }).fill('Gift set')
    await expect(dialog.getByText('Enter a size, a colour or a variant name so this variant can be told apart.')).toHaveCount(0)
  })

  test('measurements outside their range are named inline, and valid ones then save', async ({ page }) => {
    const api = await start(page)
    const dialog = await openAdd(page)
    await dialog.getByLabel('Size (optional)', { exact: true }).fill('M')
    await fillPrice(dialog)
    await dialog.getByLabel('Chest width', { exact: true }).fill('4')
    await dialog.getByLabel('Total length', { exact: true }).fill('9')
    await dialog.getByLabel('Neck', { exact: true }).fill('101')
    await dialog.getByLabel('Shoulder width', { exact: true }).fill('151')
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()

    await expect(dialog.getByText('Enter chest width from 5 to 250 cm.')).toBeVisible()
    await expect(dialog.getByText('Enter total length from 10 to 300 cm.')).toBeVisible()
    await expect(dialog.getByText('Enter neck from 5 to 100 cm.')).toBeVisible()
    await expect(dialog.getByText('Enter shoulder width from 5 to 150 cm.')).toBeVisible()
    await expect(dialog.getByLabel('Chest width', { exact: true })).toBeFocused()
    expect(api.of('POST', 'variants')).toHaveLength(0)

    // The boxes take digits and one decimal only.
    await dialog.getByLabel('Chest width', { exact: true }).fill('abc12.55')
    await expect(dialog.getByLabel('Chest width', { exact: true })).toHaveValue('12.5')
    await dialog.getByLabel('Total length', { exact: true }).fill('10')
    await dialog.getByLabel('Neck', { exact: true }).fill('100')
    await dialog.getByLabel('Shoulder width', { exact: true }).fill('150')
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()
    await expect(toast(page, 'Variant added')).toBeVisible()
    expect(api.of('POST', 'variants')[0].body).toMatchObject({
      measurements: { chestWidthCm: 12.5, totalLengthCm: 10, neckCm: 100, shoulderWidthCm: 150 },
    })
  })

  test('a server error shows why with Try again, which sends the same variant again', async ({ page }) => {
    const api = await start(page)
    const dialog = await openAdd(page)
    await dialog.getByLabel('Size (optional)', { exact: true }).fill('L')
    await fillPrice(dialog)
    await interceptOnce(page, 'POST', VARIANTS_PATH, failWith(500))
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()

    await expect(dialog.getByRole('alert')).toContainText("Couldn't add the variant.")
    await expect(dialog.getByRole('alert')).toContainText('Something went wrong on our side. Try again in a moment.')
    await dialog.getByRole('button', { name: 'Try again' }).click()
    await expect(toast(page, 'Variant added')).toBeVisible()
    expect(api.of('POST', 'variants')).toHaveLength(1) // the 500 never reached the mock
  })

  test('a 403 says the account may not add variants, with no retry', async ({ page }) => {
    await start(page)
    const dialog = await openAdd(page)
    await dialog.getByLabel('Size (optional)', { exact: true }).fill('L')
    await fillPrice(dialog)
    await interceptOnce(page, 'POST', VARIANTS_PATH, failWith(403, { message: 'Forbidden resource' }))
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Your account is not allowed to add variants. Sign in again, or ask an admin for access.')
    await expect(dialog.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  })

  test('while saving the button cannot be pressed twice and Escape, Cancel and Close are ignored', async ({ page }) => {
    const api = await start(page)
    const dialog = await openAdd(page)
    await dialog.getByLabel('Size (optional)', { exact: true }).fill('L')
    await fillPrice(dialog)
    const release = await hold(page, 'POST', VARIANTS_PATH)
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()

    await expect(dialog.getByRole('button', { name: 'Adding…' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: 'Close Add variant' }).click()
    await expect(dialog).toBeVisible()
    release()
    await expect(toast(page, 'Variant added')).toBeVisible()
    expect(api.of('POST', 'variants')).toHaveLength(1)
  })
})

// Regression: after a 409 focus moves to the SKU field once the fieldset is enabled again.
test.describe('focus regressions', () => {
  test('a 409 on a new variant moves focus to the SKU field', async ({ page }) => {
    await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Add color variant', exact: true }).click()
    const dialog = variantDialog(page, 'Add')
    await dialog.getByLabel('Size (optional)', { exact: true }).fill('L')
    await dialog.getByLabel('SKU (optional)', { exact: true }).fill('wc-grey-m')
    await dialog.getByLabel('Price (PHP)', { exact: true }).fill('100')
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click()
    await expect(dialog.getByText('SKU WC-GREY-M is already used by another variant. Change the SKU.')).toBeVisible()
    await expect(dialog.getByLabel('SKU (optional)', { exact: true })).toBeFocused()
  })

  test('a 409 on an edited variant moves focus to the SKU field', async ({ page }) => {
    await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Edit Navy S', exact: true }).click()
    const dialog = variantDialog(page, 'Edit')
    await dialog.getByLabel('SKU', { exact: true }).fill('wc-grey-m')
    await dialog.getByRole('button', { name: 'Save variant', exact: true }).click()
    await expect(dialog.getByText('SKU WC-GREY-M is already used by another variant. Change the SKU.')).toBeVisible()
    await expect(dialog.getByLabel('SKU', { exact: true })).toBeFocused()
  })

  // ProductFormSheet keys the discard footer so the prompt's autoFocus runs on Escape.
  test('the details sheet discard prompt focuses Cancel', async ({ page }) => {
    await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Edit details', exact: true }).click()
    await detailsDialog(page).getByLabel('Name', { exact: true }).fill('Linen Shirt 2')
    await page.keyboard.press('Escape')
    await expect(prompt(page).getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  })
})

test.describe('edit variant', () => {
  async function openEdit(page: Page, label = 'Navy S') {
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: `Edit ${label}`, exact: true }).click()
    const dialog = variantDialog(page, 'Edit')
    await expect(dialog).toBeVisible()
    return dialog
  }

  test('opens pre-filled with Save variant disabled, enables on a change and disables when reverted', async ({ page }) => {
    await start(page)
    const dialog = await openEdit(page, 'Navy M')
    await expect(dialog.getByLabel('Size (optional)', { exact: true })).toHaveValue('M')
    await expect(dialog.getByLabel('Colour name (optional)', { exact: true })).toHaveValue('Navy')
    await expect(dialog.getByLabel('Colour hex', { exact: true })).toHaveValue('#1b2a49')
    await expect(dialog.getByLabel('SKU', { exact: true })).toHaveValue('LS-NAVY-M')
    await expect(dialog.getByLabel('Price (PHP)', { exact: true })).toHaveValue('1,700')
    await expect(dialog.getByLabel('Chest width', { exact: true })).toHaveValue('55')
    await expect(dialog.getByLabel('Stock', { exact: true })).toHaveCount(0) // stock is changed in the stock editor
    const save = dialog.getByRole('button', { name: 'Save variant', exact: true })
    await expect(save).toBeDisabled()

    await dialog.getByLabel('Price (PHP)', { exact: true }).fill('1800')
    await expect(save).toBeEnabled()
    await dialog.getByLabel('Price (PHP)', { exact: true }).fill('1700')
    await expect(save).toBeDisabled()
  })

  test('a price-only change sends only the price, then the drawer comes back with it', async ({ page }) => {
    const api = await start(page)
    const dialog = await openEdit(page)
    await dialog.getByLabel('Price (PHP)', { exact: true }).fill('1800.00')
    await dialog.getByRole('button', { name: 'Save variant', exact: true }).click()

    await expect(toast(page, 'Variant updated')).toBeVisible()
    expect(api.of('PATCH', 'variant').map((c) => c.body)).toEqual([{ price: 1800 }])
    expect(api.of('PATCH', 'variant')[0]).toMatchObject({ productId: LINEN_ID, variantId: 'linen-s' })
    await expect(drawerOf(page, 'Linen Shirt')).toBeVisible()
  })

  test('a colour change sends the colour with its hex, and a cleared measurement is sent as null', async ({ page }) => {
    const api = await start(page)
    const dialog = await openEdit(page, 'Navy M')
    await dialog.getByLabel('Colour name (optional)', { exact: true }).fill('Forest')
    await dialog.getByLabel('Colour hex', { exact: true }).fill('228b22')
    await dialog.getByLabel('Chest width', { exact: true }).fill('')
    await dialog.getByLabel('Shoulder width', { exact: true }).fill('60')
    await dialog.getByRole('button', { name: 'Save variant', exact: true }).click()

    await expect(toast(page, 'Variant updated')).toBeVisible()
    expect(api.of('PATCH', 'variant').map((c) => c.body)).toEqual([
      { color: 'Forest', colorHex: '#228b22', measurements: { chestWidthCm: null, shoulderWidthCm: 60 } },
    ])
  })

  test('clearing the colour sends color null alone', async ({ page }) => {
    const api = await start(page)
    const dialog = await openEdit(page)
    await dialog.getByLabel('Colour name (optional)', { exact: true }).fill('')
    await dialog.getByRole('button', { name: 'Save variant', exact: true }).click()
    await expect(toast(page, 'Variant updated')).toBeVisible()
    expect(api.of('PATCH', 'variant').map((c) => c.body)).toEqual([{ color: null }])
  })

  test('a SKU another product uses (409) is shown on the SKU field and no request repeats', async ({ page }) => {
    const api = await start(page)
    const dialog = await openEdit(page)
    await dialog.getByLabel('SKU', { exact: true }).fill('wc-grey-m')
    await dialog.getByRole('button', { name: 'Save variant', exact: true }).click()
    await expect(dialog.getByText('SKU WC-GREY-M is already used by another variant. Change the SKU.')).toBeVisible()
    await expect(dialog.getByRole('alert')).toContainText("Couldn't save the variant.")
    expect(api.of('PATCH', 'variant')).toHaveLength(1)
  })

  test('an emptied required price is named inline and nothing is sent', async ({ page }) => {
    const api = await start(page)
    const dialog = await openEdit(page)
    await dialog.getByLabel('Price (PHP)', { exact: true }).fill('')
    await dialog.getByRole('button', { name: 'Save variant', exact: true }).click()
    await expect(dialog.getByText('Enter an amount above 0 and up to 1,000,000, with at most 2 decimals.')).toBeVisible()
    await expect(dialog.getByLabel('Price (PHP)', { exact: true })).toBeFocused()
    expect(api.of('PATCH', 'variant')).toHaveLength(0)
  })

  test('Cancel closes the sheet and the drawer comes back without a request', async ({ page }) => {
    const api = await start(page)
    const dialog = await openEdit(page)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(drawerOf(page, 'Linen Shirt')).toBeVisible()
    expect(api.of('PATCH', 'variant')).toHaveLength(0)
  })
})

test.describe('delete variant', () => {
  test('asks first, Cancel keeps it and returns focus, Delete Variant removes it and the drawer stays', async ({ page }) => {
    const api = await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Delete Navy S', exact: true }).click()

    const confirm = prompt(page)
    await expect(confirm).toContainText("Navy S (SKU LS-NAVY-S) will be permanently deleted, and removed from shoppers' carts. This can't be undone.")
    await expect(confirm).not.toContainText('last variant')
    await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(drawerOf(page, 'Linen Shirt').getByRole('button', { name: 'Add color variant', exact: true })).toBeFocused()
    expect(api.of('DELETE', 'variant')).toHaveLength(0)

    await drawerOf(page, 'Linen Shirt').getByRole('button', { name: 'Delete Navy S', exact: true }).click()
    await prompt(page).getByRole('button', { name: 'Delete Variant', exact: true }).click()

    await expect(toast(page, 'Variant deleted')).toBeVisible()
    expect(api.of('DELETE', 'variant')).toHaveLength(1)
    expect(api.of('DELETE', 'variant')[0]).toMatchObject({ productId: LINEN_ID, variantId: 'linen-s' })
    const after = drawerOf(page, 'Linen Shirt')
    await expect(after).toBeVisible()
    await expect(after.getByText('LS-NAVY-S')).toHaveCount(0)
    await expect(after.getByText('LS-NAVY-M')).toBeVisible()
  })

  test('the last variant carries a warning, and the emptied product offers Add variant', async ({ page }) => {
    const only = linen({ variants: [variant({ id: 'only', sku: 'LS-ONLY', size: 'M', color: 'Navy', colorHex: '#1b2a49', price: 1500, stock: 2 })] })
    const api = await start(page, [only, wool()])
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Delete Navy M', exact: true }).click()
    const confirm = prompt(page)
    await expect(confirm).toContainText('It is the last variant, so Linen Shirt will have no price or stock.')
    await confirm.getByRole('button', { name: 'Delete Variant', exact: true }).click()

    await expect(toast(page, 'Variant deleted')).toBeVisible()
    const after = drawerOf(page, 'Linen Shirt')
    await expect(after.getByText('This product has no variants yet.')).toBeVisible()
    await expect(after.getByRole('button', { name: 'Add color variant', exact: true })).toBeVisible()
    await expect(after.getByRole('button', { name: 'Restock product', exact: true })).toBeDisabled()
    expect(api.rows[0].variants).toHaveLength(0)
  })

  test('a failed delete stays in the modal with the reason, and trying again works', async ({ page }) => {
    const api = await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await interceptOnce(page, 'DELETE', VARIANT_PATH, failWith(500))
    await drawer.getByRole('button', { name: 'Delete Navy S', exact: true }).click()
    const confirm = prompt(page)
    await confirm.getByRole('button', { name: 'Delete Variant', exact: true }).click()
    await expect(confirm.getByRole('alert')).toContainText("Couldn't delete Navy S. Something went wrong on our side. Try again in a moment.")
    await confirm.getByRole('button', { name: 'Delete Variant', exact: true }).click()
    await expect(toast(page, 'Variant deleted')).toBeVisible()
    expect(api.rows[0].variants.map((v) => v.id)).toEqual(['linen-m'])
  })

  test('a 404 means it is already gone, so it counts as deleted', async ({ page }) => {
    const api = await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await interceptOnce(page, 'DELETE', VARIANT_PATH, async (route) => {
      api.rows[0].variants = api.rows[0].variants.filter((v) => v.id !== 'linen-s')
      await route.fulfill({ status: 404, json: { message: 'Variant not found' }, headers: CORS })
    })
    await drawer.getByRole('button', { name: 'Delete Navy S', exact: true }).click()
    await prompt(page).getByRole('button', { name: 'Delete Variant', exact: true }).click()
    await expect(toast(page, 'Variant deleted')).toBeVisible()
    await expect(drawerOf(page, 'Linen Shirt').getByText('LS-NAVY-S')).toHaveCount(0)
  })
})

test.describe('edit details', () => {
  async function openDetails(page: Page) {
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Edit details', exact: true }).click()
    const dialog = detailsDialog(page)
    await expect(dialog).toBeVisible()
    await expect(drawerOf(page, 'Linen Shirt')).toHaveCount(0) // the drawer steps aside
    return dialog
  }

  test('opens pre-filled with Save changes disabled and the rename note shown', async ({ page }) => {
    await start(page)
    const dialog = await openDetails(page)
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Linen Shirt')
    await expect(dialog.getByLabel('Brand (optional)', { exact: true })).toHaveValue('Atelier Manila')
    await expect(dialog.getByLabel('Description (optional)', { exact: true })).toHaveValue('A breathable linen shirt.')
    await expect(dialog.getByText("Changing the name also changes the product's web address.")).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled()
    // Real-API mode edits the gender, not the sample catalogue's AR checkbox.
    await expect(dialog.getByRole('combobox', { name: 'Gender' }).or(dialog.getByRole('button', { name: /^Gender/ }))).toBeVisible()
    await expect(dialog.getByText('Base price')).toHaveCount(0)
  })

  test('a name-only change sends only the name, with no images key, and the list shows it', async ({ page }) => {
    const api = await start(page)
    const dialog = await openDetails(page)
    await dialog.getByLabel('Name', { exact: true }).fill('Linen Shirt Classic')
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()

    await expect(toast(page, 'Linen Shirt Classic updated')).toBeVisible()
    expect(api.of('PATCH', 'product').map((c) => c.body)).toEqual([{ name: 'Linen Shirt Classic' }])
    expect(api.of('PATCH', 'product')[0].body).not.toHaveProperty('images')
    await expect(rowButton(page, 'Linen Shirt Classic')).toBeVisible()
    await expect(detailsDialog(page)).toHaveCount(0)
  })

  test('changing the main photo sends the whole image list with displayOrder and isPrimary', async ({ page }) => {
    const api = await start(page)
    const dialog = await openDetails(page)
    await dialog.getByRole('button', { name: 'Make image 2 the main photo' }).click()
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()

    await expect(toast(page, 'Linen Shirt updated')).toBeVisible()
    expect(api.of('PATCH', 'product').map((c) => c.body)).toEqual([
      {
        images: [
          { url: `${IMAGE_HOST}/${LINEN_ID}-2.svg`, altText: 'Linen Shirt back', displayOrder: 0, isPrimary: true },
          { url: `${IMAGE_HOST}/${LINEN_ID}-1.svg`, altText: 'Linen Shirt front', displayOrder: 1, isPrimary: false },
        ],
      },
    ])
  })

  test('removing an image sends the remaining list renumbered', async ({ page }) => {
    const api = await start(page)
    const dialog = await openDetails(page)
    await dialog.getByRole('button', { name: 'Remove image 1' }).click()
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(toast(page, 'Linen Shirt updated')).toBeVisible()
    expect(api.of('PATCH', 'product').map((c) => c.body)).toEqual([
      { images: [{ url: `${IMAGE_HOST}/${LINEN_ID}-2.svg`, altText: 'Linen Shirt back', displayOrder: 0, isPrimary: true }] },
    ])
  })

  test('an invalid name is named in a summary, focused, and nothing is sent', async ({ page }) => {
    const api = await start(page)
    const dialog = await openDetails(page)
    await dialog.getByLabel('Name', { exact: true }).fill('L')
    await dialog.getByLabel('Name', { exact: true }).blur()
    await expect(dialog.getByText('Enter a product name of 2 to 100 characters.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    const summary = dialog.getByRole('alert').filter({ hasText: 'Fix 1 problem before saving the changes' })
    await expect(summary).toBeVisible()
    await expect(summary).toBeFocused()
    expect(api.of('PATCH', 'product')).toHaveLength(0)
  })

  test('closing with unsaved changes asks first; Cancel keeps the form, Discard changes closes it', async ({ page }) => {
    const api = await start(page)
    const dialog = await openDetails(page)
    await dialog.getByLabel('Name', { exact: true }).fill('Linen Shirt 2')
    await page.keyboard.press('Escape')

    const confirm = prompt(page)
    await expect(confirm).toContainText("Your changes to Linen Shirt haven't been saved yet.")
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(detailsDialog(page).getByLabel('Name', { exact: true })).toHaveValue('Linen Shirt 2')

    await page.keyboard.press('Escape')
    await prompt(page).getByRole('button', { name: 'Discard changes', exact: true }).click()
    await expect(detailsDialog(page)).toHaveCount(0)
    expect(api.of('PATCH', 'product')).toHaveLength(0)
  })

  test('a server error shows why with Try again, which saves', async ({ page }) => {
    const api = await start(page)
    const dialog = await openDetails(page)
    await dialog.getByLabel('Name', { exact: true }).fill('Linen Shirt Classic')
    await interceptOnce(page, 'PATCH', PRODUCT_PATH, failWith(500))
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText("Couldn't save the changes to Linen Shirt.")
    await dialog.getByRole('button', { name: 'Try again' }).click()
    await expect(toast(page, 'Linen Shirt Classic updated')).toBeVisible()
    expect(api.of('PATCH', 'product')).toHaveLength(1)
  })

  test('a 403 says the account may not edit products', async ({ page }) => {
    await start(page)
    const dialog = await openDetails(page)
    await dialog.getByLabel('Name', { exact: true }).fill('Linen Shirt Classic')
    await interceptOnce(page, 'PATCH', PRODUCT_PATH, failWith(403, { message: 'Forbidden resource' }))
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Your account is not allowed to edit products. Sign in again, or ask an admin for access.')
  })
})

test.describe('AR Fitting flag', () => {
  // The box is a custom control with a visually hidden input, so it is toggled through its label.
  const toggleAr = (scope: Locator) => scope.getByText('AR Fitting ready', { exact: true }).click()

  async function openDetails(page: Page) {
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Edit details', exact: true }).click()
    const dialog = detailsDialog(page)
    await expect(dialog).toBeVisible()
    return dialog
  }

  test('Edit details starts from the saved flag, and ticking it sends only isArReady', async ({ page }) => {
    const api = await start(page, [linen(), wool()])
    const dialog = await openDetails(page)
    const box = dialog.getByRole('checkbox', { name: 'AR Fitting ready' })
    await expect(box).not.toBeChecked()
    await expect(dialog.getByText(/not stored yet/)).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled()
    await toggleAr(dialog)
    await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled()
    await toggleAr(dialog)
    await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled()
    await toggleAr(dialog)
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()

    await expect(toast(page, 'Linen Shirt updated')).toBeVisible()
    expect(api.of('PATCH', 'product').map((c) => c.body)).toEqual([{ isArReady: true }])
    expect(api.rows.find((p) => p.id === LINEN_ID)?.isArReady).toBe(true)

    const again = await openDetails(page)
    await expect(again.getByRole('checkbox', { name: 'AR Fitting ready' })).toBeChecked()
  })

  test('Edit details can turn the flag off and sends false', async ({ page }) => {
    const api = await start(page, [linen({ isArReady: true }), wool()])
    const dialog = await openDetails(page)
    const box = dialog.getByRole('checkbox', { name: 'AR Fitting ready' })
    await expect(box).toBeChecked()
    await toggleAr(dialog)
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(toast(page, 'Linen Shirt updated')).toBeVisible()
    expect(api.of('PATCH', 'product').map((c) => c.body)).toEqual([{ isArReady: false }])
  })

  test('the stock editor saves the AR box on its own, with no variant request', async ({ page }) => {
    const api = await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Restock product', exact: true }).click()
    await expect(drawer.getByText(/not stored yet/)).toHaveCount(0)
    await expect(drawer.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled()
    await toggleAr(drawer)
    await drawer.getByRole('button', { name: 'Save changes', exact: true }).click()

    await expect(toast(page, 'AR Fitting updated for Linen Shirt')).toBeVisible()
    expect(api.of('PATCH', 'product').map((c) => c.body)).toEqual([{ isArReady: true }])
    expect(api.of('PATCH', 'variant')).toHaveLength(0)
    await expect(drawer.getByText('AR ready', { exact: true })).toBeVisible()
  })

  for (const ticked of [true, false]) {
    test(`Add product sends isArReady: ${ticked}`, async ({ page }) => {
      await page.route(/\/storage\/v1\/object\/products\//, (route) => route.fulfill({ status: 200, json: { Key: 'products/x.png' } }))
      const api = await start(page)
      await page.getByRole('button', { name: 'Add product', exact: true }).first().click()
      const dialog = page.getByRole('dialog', { name: 'Add product', exact: true })
      await dialog.getByRole('textbox', { name: /^Name/ }).fill('Canvas Tote')
      await dialog.getByRole('textbox', { name: /Base price/ }).fill('900')
      await dialog.getByLabel('Choose image files').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: Buffer.from('x') })
      await dialog.getByRole('textbox', { name: 'Colour 1 name' }).fill('Sand')
      if (ticked) await dialog.getByText('AR Fitting ready', { exact: true }).click()
      if (ticked) await expect(dialog.getByRole('checkbox', { name: 'AR Fitting ready' })).toBeChecked()
      await dialog.getByRole('button', { name: 'Create product', exact: true }).click()

      await expect(toast(page, 'Canvas Tote added')).toBeVisible()
      const [call] = api.of('POST', 'list')
      expect(call.body).toMatchObject({ name: 'Canvas Tote', isArReady: ticked })
      expect(call.body).not.toHaveProperty('arReady')
      expect(api.rows.find((p) => p.name === 'Canvas Tote')?.isArReady).toBe(ticked)
    })
  }
})

test.describe('loading and error states', () => {
  test('the drawer shows a variants skeleton while the detail loads, then the table', async ({ page }) => {
    await start(page)
    const release = await hold(page, 'GET', PRODUCT_PATH)
    await rowButton(page, 'Linen Shirt').click()
    const drawer = drawerOf(page, 'Linen Shirt')
    await expect(drawer.getByRole('status', { name: 'Loading variants' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Edit details', exact: true })).toBeDisabled()
    release()
    await expect(drawer.getByRole('table')).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Edit details', exact: true })).toBeEnabled()
  })

  test('a failed detail load says what happened with Retry, and Restock product waits for it', async ({ page }) => {
    await start(page)
    await interceptOnce(page, 'GET', PRODUCT_PATH, failWith(500))
    await rowButton(page, 'Linen Shirt').click()
    const drawer = drawerOf(page, 'Linen Shirt')
    await expect(drawer.getByRole('alert')).toContainText("We couldn't load the variants.")
    await expect(drawer.getByRole('button', { name: 'Restock product', exact: true })).toBeDisabled()
    await drawer.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(drawer.getByRole('table')).toBeVisible()
  })

  test('a 403 on the list says the account is not allowed to see it', async ({ page }) => {
    await setupInventory(page, [linen()])
    await page.route(
      (url) => isApi(url, /^\/products$/),
      (route) => (route.request().method() === 'GET' ? failWith(403, { message: 'Forbidden resource' })(route) : route.fallback()),
    )
    await page.goto('/login?next=%2Fstaff%2Finventory')
    await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
    await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText("We couldn't load the products.")
    await expect(page.getByRole('alert')).toContainText('Your account is not allowed to see this. Sign in again, or ask an admin for access.')
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  })

  test('an empty catalogue offers Add product', async ({ page }) => {
    await start(page, [])
    await expect(page.getByText('No products yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add product' })).toHaveCount(2)
  })

  test('a rejected staff token sends the user to sign in, and a customer account is turned away', async ({ page }) => {
    await setupInventory(page, [linen()])
    await page.goto('/login?next=%2Fstaff%2Finventory')
    await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
    await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/staff\/inventory$/)

    await page.route('**/users/me', (route) =>
      route.request().method() === 'OPTIONS' ? route.fallback() : route.fulfill({ status: 401, json: {}, headers: CORS }),
    )
    await page.goto('/staff/inventory')
    await expect(page).toHaveURL(/\/login\?next=%2Fstaff%2Finventory$/)
  })

  test('a customer account cannot open staff inventory', async ({ page }) => {
    await setupInventory(page, [linen()])
    await page.goto('/login?next=%2Fstaff%2Finventory')
    await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
    await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/staff\/inventory$/)

    await page.route('**/users/me', (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fallback()
        : route.fulfill({
            json: { id: 'u', email: DEMO.email, role: 'customer', firstName: 'Demo', lastName: 'Shopper', middleName: null, suffix: null, fullName: 'Demo Shopper', avatarUrl: null, createdAt: '', updatedAt: '' },
            headers: CORS,
          }),
    )
    await page.goto('/staff/inventory')
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByText('Staff pages need a staff account.')).toBeVisible()
  })
})

test.describe('keyboard', () => {
  const inside = (page: Page, name: string) => drawerOf(page, name).evaluate((el) => el.contains(document.activeElement))

  test('Enter on a row opens the drawer, Tab and Shift+Tab stay inside, Escape closes and focus returns to the row', async ({ page }) => {
    await start(page)
    const row = rowButton(page, 'Linen Shirt')
    await row.focus()
    await page.keyboard.press('Enter')
    const drawer = drawerOf(page, 'Linen Shirt')
    await expect(drawer.getByRole('table')).toBeVisible()
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab')
      expect(await inside(page, 'Linen Shirt'), `Tab ${i + 1}`).toBe(true)
    }
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Shift+Tab')
      expect(await inside(page, 'Linen Shirt'), `Shift+Tab ${i + 1}`).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(row).toBeFocused()
  })

  test('the delete prompt is reachable by keyboard; Escape steps back to the drawer, a second Escape closes it', async ({ page }) => {
    const api = await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Delete product', exact: true }).focus()
    await page.keyboard.press('Enter')
    const confirm = prompt(page)
    await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(confirm.getByRole('button', { name: 'Delete Product', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(drawerOf(page, 'Linen Shirt')).toBeVisible()
    await expect(drawerOf(page, 'Linen Shirt').getByRole('button', { name: 'Delete product', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(drawerOf(page, 'Linen Shirt')).toBeHidden()
    expect(api.of('DELETE', 'product')).toHaveLength(0)
  })

  test('the variant sheet traps focus; Escape closes it and the drawer comes back', async ({ page }) => {
    await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Add color variant', exact: true }).click()
    const dialog = variantDialog(page, 'Add')
    await expect(dialog).toBeVisible()
    const stays = () => dialog.evaluate((el) => el.contains(document.activeElement))
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab')
      expect(await stays(), `Tab ${i + 1}`).toBe(true)
    }
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Shift+Tab')
      expect(await stays(), `Shift+Tab ${i + 1}`).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(drawerOf(page, 'Linen Shirt')).toBeVisible()
  })

  test('the variant form can be filled and saved with the keyboard alone', async ({ page }) => {
    const api = await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Add color variant', exact: true }).focus()
    await page.keyboard.press('Enter')
    const dialog = variantDialog(page, 'Add')
    await dialog.getByLabel('Size (optional)', { exact: true }).focus()
    await page.keyboard.type('XL')
    await dialog.getByLabel('Price (PHP)', { exact: true }).focus()
    await page.keyboard.type('250')
    await page.keyboard.press('Enter') // submits the form
    await expect(toast(page, 'Variant added')).toBeVisible()
    expect(api.of('POST', 'variants')[0].body).toMatchObject({ size: 'XL', price: 250 })
  })

  test('Escape closes the details sheet and focus is not lost to the page behind', async ({ page }) => {
    await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Edit details', exact: true }).click()
    await expect(detailsDialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(detailsDialog(page)).toBeHidden()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')
  })
})

test.describe('layout', () => {
  const longSku = 'W'.repeat(40)
  const crowded = () =>
    linen({
      variants: [
        variant({ id: 'linen-s', sku: longSku, size: 'XXXXXL', name: 'N'.repeat(60), color: 'Navy', colorHex: '#1b2a49', price: 1500, stock: 99999 }),
        variant({ id: 'linen-m', sku: 'LS-NAVY-M', size: 'M', color: 'Navy', colorHex: '#1b2a49', price: 1700, stock: 5 }),
      ],
    })

  /** Counts the buttons that stick out of the panel, are under 44px, or fall off the right edge. */
  async function violations(_page: Page, dialog: Locator) {
    const panel = (await dialog.boundingBox())!
    const scrollSlack = await dialog.getByRole('region').evaluate((el) => el.scrollWidth - el.clientWidth)
    const buttons = await dialog.getByRole('button', { name: /^(Edit|Delete) (Navy|XXXXXL)/ }).all()
    let bad = scrollSlack > 0 ? 1 : 0
    for (const button of buttons) {
      const box = (await button.boundingBox())!
      if (box.x < panel.x - 0.5 || box.x + box.width > panel.x + panel.width + 0.5) bad += 1
      if (box.width < 43.5 || box.height < 43.5) bad += 1
    }
    return { bad, count: buttons.length }
  }

  for (const width of [320, 768, 1280]) {
    test(`has no horizontal scroll at ${width}px with the drawer, the variant actions and both sheets open`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await start(page, [crowded(), wool()])
      expect(await overflow(page)).toBeLessThanOrEqual(0)

      const drawer = await openDrawer(page, 'Linen Shirt')
      await expect.poll(async () => (await violations(page, drawer)).bad).toBe(0)
      expect((await violations(page, drawer)).count).toBe(4)
      expect(await overflow(page)).toBeLessThanOrEqual(0)

      await drawer.getByRole('button', { name: /^Edit (Navy|XXXXXL)/ }).first().click()
      const edit = variantDialog(page, 'Edit')
      await expect(edit).toBeVisible()
      await expect.poll(async () => (await edit.getByRole('region').evaluate((el) => el.scrollWidth - el.clientWidth))).toBeLessThanOrEqual(0)
      expect(await overflow(page)).toBeLessThanOrEqual(0)
      await edit.getByRole('button', { name: 'Cancel', exact: true }).click()

      const back = drawerOf(page, 'Linen Shirt')
      await expect(back.getByRole('table')).toBeVisible()
      await back.getByRole('button', { name: 'Edit details', exact: true }).click()
      const details = detailsDialog(page)
      await expect(details).toBeVisible()
      await expect.poll(async () => (await details.getByRole('region').evaluate((el) => el.scrollWidth - el.clientWidth))).toBeLessThanOrEqual(0)
      expect(await overflow(page)).toBeLessThanOrEqual(0)
    })
  }

  test('the delete prompt fits at 320px and its buttons are at least 44px tall', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await start(page)
    const drawer = await openDrawer(page, 'Linen Shirt')
    await drawer.getByRole('button', { name: 'Delete product', exact: true }).click()
    const confirm = prompt(page)
    await expect(confirm).toBeVisible()
    for (const name of ['Cancel', 'Delete Product']) {
      await expect.poll(async () => (await confirm.getByRole('button', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('dark mode', () => {
  test('drawer, variant sheet and delete prompt render with text that differs from the surface', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
    await page.emulateMedia({ colorScheme: 'dark' })
    await start(page)
    const colors = (locator: Locator) =>
      locator.evaluate((el) => {
        let bg = 'rgba(0, 0, 0, 0)'
        for (let node: Element | null = el; node; node = node.parentElement) {
          bg = getComputedStyle(node).backgroundColor
          if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') break
        }
        return { text: getComputedStyle(el).color, bg }
      })

    const drawer = await openDrawer(page, 'Linen Shirt')
    const title = await colors(drawer.getByRole('heading', { name: 'Linen Shirt' }))
    expect(title.text).not.toBe(title.bg)
    const cell = await colors(drawer.getByText('LS-NAVY-S'))
    expect(cell.text).not.toBe(cell.bg)

    await drawer.getByRole('button', { name: 'Delete product', exact: true }).click()
    const copy = await colors(prompt(page).getByText('permanently deleted', { exact: false }))
    expect(copy.text).not.toBe(copy.bg)
    await prompt(page).getByRole('button', { name: 'Cancel', exact: true }).click()

    await drawerOf(page, 'Linen Shirt').getByRole('button', { name: 'Add color variant', exact: true }).click()
    const heading = await colors(variantDialog(page, 'Add').getByRole('heading', { name: 'Add variant' }))
    expect(heading.text).not.toBe(heading.bg)
    const input = await colors(variantDialog(page, 'Add').getByLabel('Price (PHP)', { exact: true }))
    expect(input.text).not.toBe(input.bg)
  })
})
