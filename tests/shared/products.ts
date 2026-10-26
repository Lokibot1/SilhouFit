import type { Page, Route } from '@playwright/test'
import { DEMO, mockAuth } from './session'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const PAGE_ORIGIN = 'http://localhost:5173'

export interface MockMeasurements {
  chestWidthCm: number | null
  waistWidthCm: number | null
  hipWidthCm: number | null
  totalLengthCm: number | null
  inseamCm: number | null
  shoulderWidthCm: number | null
  sleeveLengthCm: number | null
  neckCm: number | null
  thighCm: number | null
}

export interface MockVariant {
  id: string
  sku: string
  name: string | null
  size: string | null
  color: string | null
  colorHex: string | null
  price: number
  stock: number
  imageUrl: string | null
  measurements: MockMeasurements | null
}

export interface MockImage {
  url: string
  altText: string | null
  displayOrder: number
  isPrimary: boolean
}

export interface MockProduct {
  id: string
  name: string
  slug: string
  category: string
  brand: string | null
  description: string | null
  gender: string | null
  isActive: boolean
  createdAt: string
  images: MockImage[]
  variants: MockVariant[]
}

let counter = 0
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`

export const IMAGE_HOST = 'https://images.silhoufit.test'

export const variant = (overrides: Partial<MockVariant> = {}): MockVariant => {
  const id = overrides.id ?? uuid()
  return {
    id,
    sku: `SKU-${id.slice(-4)}`,
    name: null,
    size: 'M',
    color: 'Navy',
    colorHex: '#1b2a49',
    price: 1500,
    stock: 10,
    imageUrl: null,
    measurements: null,
    ...overrides,
  }
}

export const product = (overrides: Partial<MockProduct> = {}): MockProduct => {
  const id = overrides.id ?? uuid()
  const name = overrides.name ?? 'Linen Shirt'
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    category: 'Tops',
    brand: 'Atelier Manila',
    description: 'A breathable linen shirt.',
    gender: null,
    isActive: true,
    createdAt: '2026-05-01T08:00:00.000Z',
    images: [
      { url: `${IMAGE_HOST}/${id}-1.svg`, altText: `${name} front`, displayOrder: 0, isPrimary: true },
      { url: `${IMAGE_HOST}/${id}-2.svg`, altText: `${name} back`, displayOrder: 1, isPrimary: false },
    ],
    variants: [variant({ size: 'S', sku: 'LS-NAVY-S' }), variant({ size: 'M', sku: 'LS-NAVY-M' })],
    ...overrides,
  }
}

export interface ProductCall {
  method: string
  /** list: /products, product: /products/:id, variants: /products/:id/variants, variant: /products/:id/variants/:variantId. */
  kind: 'list' | 'product' | 'variants' | 'variant'
  productId: string | null
  variantId: string | null
  body: Record<string, unknown> | null
}

export interface ProductsMock {
  /** The server's products, in the order they were added. */
  rows: MockProduct[]
  /** Every request that reached the API, OPTIONS excluded. */
  calls: ProductCall[]
  /** The calls of one method and kind, in order, e.g. `api.of('PATCH', 'variant')`. */
  of: (method: string, kind: ProductCall['kind']) => ProductCall[]
}

const priceRange = (p: MockProduct) => {
  const prices = p.variants.map((v) => v.price)
  return prices.length ? { minPrice: Math.min(...prices), maxPrice: Math.max(...prices) } : { minPrice: 0, maxPrice: 0 }
}

const listItem = (p: MockProduct) => {
  const main = p.images.find((i) => i.isPrimary) ?? p.images[0]
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    category: p.category,
    brand: p.brand,
    ...priceRange(p),
    totalStock: p.variants.reduce((sum, v) => sum + v.stock, 0),
    primaryImage: main ? { url: main.url, altText: main.altText } : null,
    createdAt: p.createdAt,
    isActive: p.isActive,
  }
}

const detail = (p: MockProduct) => ({ ...p, ...priceRange(p) })

/**
 * Stands in for the products API (GET /products, GET/PATCH/DELETE /products/:id, and the variant routes) with an in-memory
 * catalogue that follows the API's rules: the list is active products only; a variant needs a size, colour or name, a price,
 * and a colorHex with a colour; a SKU is unique across all products (409 `SKU "X" is already in use`); PATCH replaces `images`
 * whole when sent; DELETE answers `{ success: true }`. Register it after mockAuth.
 */
export async function mockProducts(page: Page, initial: MockProduct[] = []): Promise<ProductsMock> {
  const mock: ProductsMock = {
    rows: initial.map((p) => structuredClone(p)),
    calls: [],
    of: (method, kind) => mock.calls.filter((c) => c.method === method && c.kind === kind),
  }
  const skuInUse = (sku: string, exceptId?: string) =>
    mock.rows.some((p) => p.variants.some((v) => v.id !== exceptId && v.sku.toUpperCase() === sku.toUpperCase()))

  const handle = async (route: Route) => {
    const request = route.request()
    const method = request.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(request.url())
    const [, , productId = null, section = null, variantId = null] = url.pathname.split('/')
    const body = (['POST', 'PATCH'].includes(method) ? request.postDataJSON() : null) as Record<string, unknown> | null
    const kind = !productId ? 'list' : !section ? 'product' : variantId ? 'variant' : 'variants'
    mock.calls.push({ method, kind, productId, variantId, body })
    const reply = (status: number, json: unknown) => route.fulfill({ status, json, headers: CORS })

    if (!productId) {
      const q = url.searchParams.get('search')?.toLowerCase()
      const limit = Number(url.searchParams.get('limit')) || 25
      const pageNo = Number(url.searchParams.get('page')) || 1
      const matched = mock.rows.filter((p) => p.isActive && (!q || p.name.toLowerCase().includes(q)))
      const totalPages = Math.ceil(matched.length / limit)
      return reply(200, {
        data: matched.slice((pageNo - 1) * limit, pageNo * limit).map(listItem),
        meta: { total: matched.length, page: pageNo, limit, totalPages, hasNextPage: pageNo < totalPages, hasPreviousPage: pageNo > 1 },
      })
    }

    const row = mock.rows.find((p) => p.id === productId)
    if (!row) return reply(404, { message: 'Product not found' })

    if (!section) {
      if (method === 'GET') return reply(200, detail(row))
      if (method === 'DELETE') {
        mock.rows = mock.rows.filter((p) => p.id !== productId)
        return reply(200, { success: true })
      }
      if (method === 'PATCH') {
        const { images, ...rest } = body ?? {}
        Object.assign(row, rest)
        if (typeof rest.name === 'string') row.slug = rest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        if (Array.isArray(images)) row.images = images as MockImage[]
        return reply(200, detail(row))
      }
      return reply(405, {})
    }

    if (section !== 'variants') return reply(404, {})

    if (!variantId) {
      if (method !== 'POST') return reply(405, {})
      const input = body ?? {}
      const text = (k: string) => (typeof input[k] === 'string' && input[k] ? (input[k] as string) : null)
      if (!text('size') && !text('color') && !text('name')) return reply(400, { message: ['A variant needs a size, a colour or a name'] })
      if (text('color') && !text('colorHex')) return reply(400, { message: ['colorHex is required when color is provided'] })
      if (typeof input.price !== 'number') return reply(400, { message: ['price must be a number conforming to the specified constraints'] })
      const sku = text('sku') ?? `${row.slug.toUpperCase()}-${uuid().slice(-4)}`
      if (skuInUse(sku)) return reply(409, { message: `SKU "${sku}" is already in use` })
      const created: MockVariant = {
        id: uuid(),
        sku,
        name: text('name'),
        size: text('size'),
        color: text('color'),
        colorHex: text('color') ? text('colorHex') : null,
        price: input.price,
        stock: typeof input.stock === 'number' ? input.stock : 0,
        imageUrl: text('imageUrl'),
        measurements: input.measurements
          ? { chestWidthCm: null, waistWidthCm: null, hipWidthCm: null, totalLengthCm: null, inseamCm: null, shoulderWidthCm: null, sleeveLengthCm: null, neckCm: null, thighCm: null, ...(input.measurements as object) }
          : null,
      }
      row.variants.push(created)
      return reply(201, created)
    }

    const target = row.variants.find((v) => v.id === variantId)
    if (!target) return reply(404, { message: 'Variant not found' })
    if (method === 'DELETE') {
      row.variants = row.variants.filter((v) => v.id !== variantId)
      return reply(200, { success: true })
    }
    if (method === 'PATCH') {
      const { measurements, ...fields } = body ?? {}
      if (typeof fields.sku === 'string' && skuInUse(fields.sku, target.id)) return reply(409, { message: `SKU "${fields.sku}" is already in use` })
      Object.assign(target, fields)
      if (!target.color) target.colorHex = null
      if (measurements) {
        target.measurements = {
          ...(target.measurements ?? { chestWidthCm: null, waistWidthCm: null, hipWidthCm: null, totalLengthCm: null, inseamCm: null, shoulderWidthCm: null, sleeveLengthCm: null, neckCm: null, thighCm: null }),
          ...(measurements as object),
        }
      }
      return reply(200, target)
    }
    return reply(405, {})
  }

  // Product images are only decoration; answer them so no request hangs on a host that does not exist.
  await page.route(`${IMAGE_HOST}/**`, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#888"/></svg>' }),
  )
  // The dev server also serves /src/data/products.ts, so match on origin as well as the path.
  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/products(\/|$)/.test(url.pathname), handle)
  return mock
}

/**
 * The inventory page picks between the shop's placeholder catalogue and the real products API with the build-time constant
 * INVENTORY_SAMPLE_DATA in src/service/sampleInventory.ts (true today). It cannot be flipped from a test through the app, so
 * this rewrites that one module as the dev server sends it to the browser. The app source is not touched. Needs the Vite dev
 * server (the playwright config starts it); a production build has no such module to rewrite.
 */
export async function useRealInventoryApi(page: Page) {
  await page.route('**/src/service/sampleInventory.ts*', async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    await route.fulfill({
      response,
      body: source.replace(/INVENTORY_SAMPLE_DATA\s*=\s*true/, 'INVENTORY_SAMPLE_DATA = false'),
    })
  })
}

/** Keeps the staff session but makes /users/me answer with `role` (staff by default). Register it after mockAuth. */
export async function mockStaffMe(page: Page, role: 'staff' | 'admin' | 'customer' = 'staff') {
  await page.route('**/users/me', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    return route.fulfill({
      json: {
        id: 'staff-1',
        email: DEMO.email,
        role,
        firstName: 'Sam',
        middleName: null,
        lastName: 'Staff',
        suffix: null,
        fullName: 'Sam Staff',
        avatarUrl: null,
        birthday: null,
        gender: null,
        createdAt: '2026-01-15T08:30:00.000Z',
        updatedAt: '2026-01-15T08:30:00.000Z',
      },
      headers: CORS,
    })
  })
}

/** Everything a staff inventory test needs before it signs in: auth, the staff profile, real-API mode and the products mock. */
export async function setupInventory(page: Page, products: MockProduct[]) {
  await mockAuth(page)
  await mockStaffMe(page)
  await useRealInventoryApi(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  return mockProducts(page, products)
}
