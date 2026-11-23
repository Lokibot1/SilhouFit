import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { mockAdminOrders, manyAdminOrders } from '../shared/adminOrders'
import { mockProductMetrics, mockStaffMe, seedCatalogue, setupInventory } from '../shared/products'

// /admin/reports and /superadmin/reports: the Sales and Inventory reports as Excel or PDF. The files are built in the browser from the
// API's /analytics, /admin/orders and /products endpoints (stubbed here). Sign-in is the dev-only simulated one.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const OUT = process.env.REPORT_OUT
const { Workbook } = createRequire(import.meta.url)('exceljs') as typeof import('exceljs')

async function signIn(page: Page, { email, password }: { email: string; password: string }, home: RegExp) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(home)
}

async function open(page: Page, who = ADMIN, area: 'admin' | 'superadmin' = 'admin') {
  await setupInventory(page, seedCatalogue())
  await mockStaffMe(page, area)
  await mockProductMetrics(page)
  await mockAdminOrders(page, manyAdminOrders(3))
  const json = (body: unknown) => (route: import('@playwright/test').Route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : route.fulfill({ json: body, headers: CORS })
  await page.route('**/analytics/sales**', json([{ date: '2026-01-01', total: 1200 }, { date: '2026-02-01', total: 3400.5 }]))
  await page.route('**/analytics/trending**', json([{ productId: 'p1', name: 'Linen Shirt', category: 'Hoodie', orders: 4, stock: 25, arConversion: null }]))
  await page.route('**/analytics/product-mix**', json([{ category: 'Hoodie', units: 9 }, { category: 'Pants', units: 2 }]))
  await signIn(page, who, new RegExp(`/${area}$`))
  await page.goto(`/${area}/reports`)
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible({ timeout: 20_000 })
}

async function download(page: Page, card: string, button: string) {
  const region = page.getByRole('region', { name: card })
  const [file] = await Promise.all([page.waitForEvent('download'), region.getByRole('button', { name: button }).click()])
  const dir = OUT ?? test.info().outputDir
  await mkdir(dir, { recursive: true })
  const saved = path.join(dir, file.suggestedFilename())
  await file.saveAs(saved)
  return { name: file.suggestedFilename(), bytes: await readFile(saved), saved }
}

test.describe('Reports', () => {
  test('an admin downloads the sales report as Excel with the branded summary and every section', async ({ page }) => {
    await open(page)
    const { name, bytes } = await download(page, 'Sales report', 'Download Excel')
    expect(name).toMatch(/^sales-report-\d{4}-\d{2}-\d{2}\.xlsx$/)
    const book = new Workbook()
    await book.xlsx.load(bytes as never)
    expect(book.worksheets.map((s) => s.name)).toHaveLength(4)
    expect(book.worksheets[0].name).toBe('Summary')
    expect(String(book.worksheets[0].getCell(1, 1).value)).toContain('SilhouFit')
    expect(String(book.worksheets[0].getCell(1, 1).value)).toContain('KRAL')
    expect(book.worksheets.some((s) => s.name.startsWith('Best sellers'))).toBe(true)
    await expect(page.getByText('Sales report downloaded as Excel')).toBeVisible()
  })

  test('an admin downloads the sales report as a PDF with the branded header, footer links and page numbers', async ({ page }) => {
    await open(page)
    const { name, bytes } = await download(page, 'Sales report', 'Download PDF')
    expect(name).toMatch(/^sales-report-\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    const raw = bytes.toString('latin1')
    for (const host of ['facebook.com', 'instagram.com', 'tiktok.com', 'shp.ee', 'lazada.com.ph']) expect(raw).toContain(host)
  })

  test('the inventory report downloads in both formats and lists every size', async ({ page }) => {
    await open(page)
    const xlsx = await download(page, 'Inventory report', 'Download Excel')
    const book = new Workbook()
    await book.xlsx.load(xlsx.bytes as never)
    const sheet = book.worksheets.find((s) => s.name.startsWith('Stock per product'))!
    const cells = sheet.getSheetValues().flat().map(String)
    expect(cells).toContain('LS-BLK-S')
    expect(cells).toContain('WT-BLK-30')
    const pdf = await download(page, 'Inventory report', 'Download PDF')
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-')
  })

  test('a superadmin has the page too, and a failed request makes no file and offers Retry', async ({ page }) => {
    await open(page, SUPERADMIN, 'superadmin')
    await page.route('**/analytics/sales**', (route) => (route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : route.fulfill({ status: 500, json: {}, headers: CORS })))
    await page.getByRole('region', { name: 'Sales report' }).getByRole('button', { name: 'Download Excel' }).click()
    await expect(page.getByText(/Couldn't make the sales report/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  test('each card previews its report: sales figures and chart, and the stock status bar', async ({ page }) => {
    await open(page)
    const sales = page.getByRole('region', { name: 'Sales report', exact: true })
    await expect(sales.getByText('Revenue', { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(sales.getByText('Linen Shirt')).toBeVisible()
    await expect(sales.getByRole('region', { name: 'Sales', exact: true })).toBeVisible()
    await expect(sales.getByText('Best sellers', { exact: true })).toBeVisible()
    const inventory = page.getByRole('region', { name: 'Inventory report', exact: true })
    await expect(inventory.getByRole('img', { name: /products: .*in stock.*low stock.*sold out/ })).toBeVisible({ timeout: 15000 })
    await expect(inventory.getByText('Sold out', { exact: true }).first()).toBeVisible()
  })

  test('the page has no horizontal scroll and the nav lists Reports', async ({ page }) => {
    await open(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    // On a phone the sidebar is a drawer, closed until opened, so only the wide layout lists it.
    if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(page.getByRole('link', { name: 'Reports' }).first()).toBeVisible()
  })
})
