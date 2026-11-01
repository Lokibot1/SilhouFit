import type { Page, Route } from '@playwright/test'
import { createCartStore, type CartStore } from '../fixtures/cartStore'
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
  isArReady: boolean
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
    category: 'Hoodie',
    brand: 'Atelier Manila',
    description: 'A breathable linen shirt.',
    gender: null,
    isActive: true,
    isArReady: false,
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
  /** list: /products, filters: /products/filters, product: /products/:id, slug: /products/slug/:slug, variants: /products/:id/variants, variant: /products/:id/variants/:variantId. */
  kind: 'list' | 'filters' | 'product' | 'slug' | 'variants' | 'variant'
  /** For a slug lookup, the slug. */
  productId: string | null
  variantId: string | null
  body: Record<string, unknown> | null
  /** The query string of a list request, as the API received it. */
  query: Record<string, string>
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
  const seen = new Set<string>()
  const colors = p.variants.flatMap((v) => {
    const key = `${v.color}|${v.colorHex}`
    if (!v.color || !v.colorHex || seen.has(key)) return []
    seen.add(key)
    return [{ name: v.color, hex: v.colorHex }]
  })
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
    isArReady: p.isArReady,
    colors,
    sizes: [...new Set(p.variants.flatMap((v) => (v.size ? [v.size] : [])))],
    variantCount: p.variants.length,
    outOfStockVariants: p.variants.filter((v) => v.stock <= 0).length,
  }
}

/** GET /products/filters as the API answers it: active products only, sizes alphabetical, colours by name, 0 and 0 prices when empty. */
function filtersBody(rows: MockProduct[]) {
  const active = rows.filter((p) => p.isActive)
  const variants = active.flatMap((p) => p.variants)
  const prices = variants.map((v) => v.price)
  const colours = new Map<string, { name: string; hex: string }>()
  for (const v of variants) if (v.color && v.colorHex) colours.set(`${v.color}|${v.colorHex}`, { name: v.color, hex: v.colorHex })
  const sorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b))
  return {
    categories: sorted(active.map((p) => p.category)).map((name) => ({ name, count: active.filter((p) => p.category === name).length })),
    brands: sorted(active.flatMap((p) => (p.brand ? [p.brand] : []))),
    sizes: sorted(variants.flatMap((v) => (v.size ? [v.size] : []))),
    colors: [...colours.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
  }
}

const detail = (p: MockProduct) => ({ ...p, ...priceRange(p) })

const LIST_KEYS = ['search', 'category', 'gender', 'brand', 'sizes', 'colors', 'minPrice', 'maxPrice', 'page', 'stockLevel', 'sortBy', 'sortOrder', 'limit', 'status', 'isArReady']

/** GET /products as the API answers it: active products unless a staff member asks for `status`, sizes and colours as repeated or comma-separated keys (the singular size and color are gone), and size, colour, price and stock must all hold for the same variant. */
function listPage(rows: MockProduct[], params: URLSearchParams, staff: boolean) {
  const status = params.get('status') ?? 'active'
  if (status !== 'active' && !staff) return { status: 403, json: { message: 'Only staff members can view archived products' } }
  const text = (key: string) => params.get(key)?.toLowerCase()
  // Repeated keys and/or comma lists, trimmed and lower-cased.
  const list = (key: string) => params.getAll(key).flatMap((v) => v.split(',')).map((v) => v.trim().toLowerCase()).filter(Boolean)
  const [sizes, colors] = [list('sizes'), list('colors')]
  const num = (key: string) => (params.has(key) ? Number(params.get(key)) : undefined)
  const search = text('search')
  const [min, max] = [num('minPrice'), num('maxPrice')]
  const level = params.get('stockLevel')
  const inStock = level === 'in'
  const arReady = params.has('isArReady') ? params.get('isArReady') === 'true' : undefined
  const variantMatches = (v: MockVariant) =>
    (!sizes.length || sizes.includes(v.size?.toLowerCase() ?? '')) &&
    (!colors.length || colors.includes(v.color?.toLowerCase() ?? '')) &&
    (min === undefined || v.price >= min) &&
    (max === undefined || v.price <= max) &&
    (!inStock || v.stock > 0)
  const needsVariant = ['sizes', 'colors', 'minPrice', 'maxPrice'].some((key) => params.has(key)) || inStock
  const matched = rows
    .filter((p) => status === 'all' || p.isActive === (status === 'active'))
    .filter((p) => !search || [p.name, p.brand ?? '', p.category].some((t) => t.toLowerCase().includes(search)))
    .filter((p) => !text('category') || p.category.toLowerCase() === text('category'))
    .filter((p) => !text('brand') || p.brand?.toLowerCase() === text('brand'))
    .filter((p) => !text('gender') || p.gender === text('gender'))
    .filter((p) => arReady === undefined || p.isArReady === arReady)
    .filter((p) => !needsVariant || p.variants.some(variantMatches))
    .filter((p) => level !== 'low' || p.variants.some((v) => v.stock <= 5))
    .filter((p) => level !== 'out' || (p.variants.length > 0 && p.variants.every((v) => v.stock === 0)))
  const by = params.get('sortBy') ?? 'createdAt'
  const asc = params.get('sortOrder') === 'asc'
  const sign = asc ? 1 : -1
  // Price orders by the cheapest variant ascending and the priciest descending; products without variants come last.
  const priceOf = (p: MockProduct) => (asc ? Math.min(...p.variants.map((v) => v.price)) : Math.max(...p.variants.map((v) => v.price)))
  matched.sort((a, b) => {
    if (by === 'price') {
      if (!a.variants.length || !b.variants.length) return Number(!a.variants.length) - Number(!b.variants.length)
      return sign * (priceOf(a) - priceOf(b))
    }
    return sign * (by === 'name' ? a.name.localeCompare(b.name) : a.createdAt.localeCompare(b.createdAt))
  })
  const limit = Math.min(Number(params.get('limit')) || 25, 100)
  const pageNo = Number(params.get('page')) || 1
  const totalPages = Math.ceil(matched.length / limit)
  return {
    status: 200,
    json: {
      data: matched.slice((pageNo - 1) * limit, pageNo * limit).map(listItem),
      meta: { total: matched.length, page: pageNo, limit, totalPages, hasNextPage: pageNo < totalPages, hasPreviousPage: pageNo > 1 },
    },
  }
}

/**
 * Stands in for the products API (GET /products, GET/PATCH/DELETE /products/:id, and the variant routes) with an in-memory
 * catalogue that follows the API's rules: the list is active products only unless `staff` is set and `status` asks for more (anyone
 * else gets 403), and an archived product's detail is 404 for non-staff; a variant needs a size, colour or name, a price,
 * and a colorHex with a colour; a SKU is unique across all products (409 `SKU "X" is already in use`); PATCH replaces `images`
 * whole when sent; DELETE answers `{ success: true }`. Register it after mockAuth.
 */
export async function mockProducts(page: Page, initial: MockProduct[] = [], { staff = false }: { staff?: boolean } = {}): Promise<ProductsMock> {
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
    const isSlug = productId === 'slug' && section !== null
    const kind = isSlug ? 'slug' : productId === 'filters' && !section ? 'filters' : !productId ? 'list' : !section ? 'product' : variantId ? 'variant' : 'variants'
    mock.calls.push({ method, kind, productId: isSlug ? section : productId, variantId, body, query: Object.fromEntries(url.searchParams) })
    const reply = (status: number, json: unknown) => route.fulfill({ status, json, headers: CORS })

    if (isSlug) {
      // Public, but an archived product is 404 for anyone who is not staff.
      const bySlug = mock.rows.find((p) => p.slug === section && (p.isActive || staff))
      return bySlug ? reply(200, detail(bySlug)) : reply(404, { message: 'Product not found' })
    }

    if (!productId && method === 'POST') {
      const input = body ?? {}
      if (input.isArReady !== undefined && typeof input.isArReady !== 'boolean') return reply(400, { message: ['isArReady must be a boolean value'] })
      const created = product({
        name: String(input.name ?? ''),
        category: String(input.category ?? 'Hoodie'),
        brand: (input.brand as string | undefined) ?? null,
        description: (input.description as string | undefined) ?? null,
        gender: (input.gender as string | undefined) ?? null,
        isActive: input.isActive !== false,
        isArReady: input.isArReady === true,
        images: (input.images as MockImage[] | undefined) ?? [],
        variants: ((input.variants as Partial<MockVariant>[] | undefined) ?? []).map((v) => variant({ ...v, price: v.price ?? (input.defaultPrice as number) ?? 0 })),
      })
      mock.rows.push(created)
      return reply(201, detail(created))
    }

    if (!productId) {
      const bad = [...url.searchParams.keys()].find((key) => !LIST_KEYS.includes(key))
      if (bad) return reply(400, { message: [`property ${bad} should not exist`] })
      const answer = listPage(mock.rows, url.searchParams, staff)
      return reply(answer.status, answer.json)
    }

    if (kind === 'filters') return reply(200, filtersBody(mock.rows))

    const row = mock.rows.find((p) => p.id === productId && (p.isActive || staff || method !== 'GET'))
    if (!row) return reply(404, { message: 'Product not found' })

    if (!section) {
      if (method === 'GET') return reply(200, detail(row))
      if (method === 'DELETE') {
        mock.rows = mock.rows.filter((p) => p.id !== productId)
        return reply(200, { success: true })
      }
      if (method === 'PATCH') {
        const { images, ...rest } = body ?? {}
        if (rest.isArReady !== undefined && typeof rest.isArReady !== 'boolean') return reply(400, { message: ['isArReady must be a boolean value'] })
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

export interface CartCall {
  method: string
  /** The cart item id, for PATCH and DELETE of one item. */
  itemId: string | null
  body: Record<string, unknown> | null
}

export interface CartMock extends CartStore {
  /** Every request that reached the cart API, OPTIONS excluded. */
  calls: CartCall[]
}

/**
 * Stands in for the cart API (GET /cart, POST /cart/items, PATCH/DELETE /cart/items/:itemId, DELETE /cart) over the products
 * mock's rows, with the API's rules: 400 past a variant's stock or for an inactive product, 404 for an unknown variant or item.
 * Register it after mockAuth. `cart.seed(variantId, qty)` puts a piece in the server cart before the page loads.
 */
export async function mockCart(page: Page, products: ProductsMock): Promise<CartMock> {
  const store = createCartStore(() => products.rows)
  const cart = Object.assign(store, { calls: [] as CartCall[] }) as CartMock
  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/cart(\/|$)/.test(url.pathname), async (route) => {
    const request = route.request()
    const method = request.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const [, , section = null, itemId = null] = new URL(request.url()).pathname.split('/')
    const body = (['POST', 'PATCH'].includes(method) ? request.postDataJSON() : null) as Record<string, unknown> | null
    cart.calls.push({ method, itemId, body })
    const answer = (r: { status: number; json: unknown }) => route.fulfill({ status: r.status, json: r.json, headers: CORS })
    if (!section) return answer(method === 'DELETE' ? store.clear() : store.get())
    if (method === 'POST') return answer(store.add(body?.variantId as string, body?.quantity))
    if (method === 'PATCH' && itemId) return answer(store.patch(itemId, body?.quantity))
    if (method === 'DELETE' && itemId) return answer(store.remove(itemId))
    return route.fulfill({ status: 405, json: {}, headers: CORS })
  })
  return cart
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

/** Everything a staff inventory test needs before it signs in: auth, the staff profile and the products mock. */
export async function setupInventory(page: Page, products: MockProduct[]) {
  await mockAuth(page)
  await mockStaffMe(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  return mockProducts(page, products, { staff: true })
}

const SEED = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`

/** A seeded variant: fixed id and SKU, so a test can name them. */
const seeded = (n: number, sku: string, overrides: Partial<MockVariant>) => variant({ id: SEED(n), sku, ...overrides })
const BLACK = { color: 'Black', colorHex: '#111111' }
const NAVY = { color: 'Navy', colorHex: '#1b2a49' }
const SAND = { color: 'Sand', colorHex: '#d8c3a5' }

/**
 * A small catalogue that is the same on every run, for the shop and the product page. Newest first it is: Linen Shirt and Cotton Tee
 * (Hoodie), Wool Trousers (Pants), Linen Vest (Hoodie, sold out) and Archived Cardigan (Hoodie, archived: only staff can read it).
 * Colours across the active products are Black, Navy and Sand, with Navy spelled "navy" on the tee to prove they count once.
 * Prices run from 1,200 to 2,600. Nothing in it has a sale price, rating or badge, as the API has none, and no product is AR ready until a test sets `isArReady`.
 */
export function seedCatalogue(): MockProduct[] {
  const at = (day: number) => `2026-05-${String(day).padStart(2, '0')}T08:00:00.000Z`
  const img = (id: string, name: string): MockImage[] => [
    { url: `${IMAGE_HOST}/${id}-1.svg`, altText: `${name} front`, displayOrder: 0, isPrimary: true },
    { url: `${IMAGE_HOST}/${id}-2.svg`, altText: `${name} back`, displayOrder: 1, isPrimary: false },
  ]
  const make = (n: number, name: string, category: string, day: number, variants: MockVariant[], extra: Partial<MockProduct> = {}): MockProduct => {
    const id = SEED(n)
    return product({ id, name, category, createdAt: at(day), images: img(id, name), variants, description: `${name}, made to last.`, ...extra })
  }
  return [
    make(1, 'Linen Shirt', 'Hoodie', 5, [
      seeded(11, 'LS-BLK-S', { ...BLACK, size: 'S', price: 1500, stock: 10 }),
      seeded(12, 'LS-BLK-M', { ...BLACK, size: 'M', price: 1500, stock: 10 }),
      seeded(13, 'LS-NVY-M', { ...NAVY, size: 'M', price: 1800, stock: 5 }),
    ]),
    make(2, 'Wool Trousers', 'Pants', 4, [
      seeded(21, 'WT-SND-30', { ...SAND, size: '30', price: 2400, stock: 8 }),
      seeded(22, 'WT-BLK-30', { ...BLACK, size: '30', price: 2600, stock: 3 }),
    ]),
    make(3, 'Cotton Tee', 'Hoodie', 3, [seeded(31, 'CT-NVY-S', { color: 'navy', colorHex: '#1b2a49', size: 'S', price: 1200, stock: 4 })]),
    make(4, 'Linen Vest', 'Hoodie', 2, [seeded(41, 'LV-SND-S', { ...SAND, size: 'S', price: 1300, stock: 0 })]),
    make(5, 'Archived Cardigan', 'Hoodie', 1, [seeded(51, 'AC-BLK-M', { ...BLACK, size: 'M', price: 2000, stock: 6 })], { isActive: false }),
  ]
}
