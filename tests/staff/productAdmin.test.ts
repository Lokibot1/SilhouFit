import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError } from '../../src/service/fetchProductList'
import {
  addVariant,
  createProduct,
  deleteProduct,
  deleteVariant,
  setProductActive,
  updateProduct,
  updateStocks,
  updateVariant,
  updateVariantStock,
  uploadProductImage,
} from '../../src/service/productAdmin'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
    storage: { from: (bucket: string) => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }) }) },
  }),
}))

const fetchMock = vi.fn()
const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }))

beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

const kindOf = async (call: Promise<unknown>) => {
  const error = await call.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ProductListError)
  return (error as ProductListError).kind
}

describe('updateVariantStock', () => {
  it('PATCHes the variant with exactly { stock }', async () => {
    reply({ id: 'v1', stock: 12 })
    await updateVariantStock('p 1', 'v/1', 12)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/products\/p%201\/variants\/v%2F1$/)
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe('{"stock":12}')
    expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' })
  })

  it('accepts 0, since a sold-out size is a stock of zero', async () => {
    reply({ id: 'v1', stock: 0 })
    await expect(updateVariantStock('p1', 'v1', 0)).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][1].body).toBe('{"stock":0}')
  })

  it('rejects an answer that does not show the new stock as a server fault', async () => {
    reply({ id: 'v1', stock: 3 })
    expect(await kindOf(updateVariantStock('p1', 'v1', 12))).toBe('server')
    reply('nope')
    expect(await kindOf(updateVariantStock('p1', 'v1', 12))).toBe('server')
  })

  it.each([
    [400, 'validation'],
    [401, 'forbidden'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [409, 'conflict'],
    [429, 'rate-limit'],
    [500, 'server'],
  ])('maps a %i answer to %s', async (status, kind) => {
    reply({ message: 'x' }, status)
    expect(await kindOf(updateVariantStock('p1', 'v1', 1))).toBe(kind)
  })

  it('reports a dropped connection as a network fault, and an abort as itself', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'))
    expect(await kindOf(updateVariantStock('p1', 'v1', 1))).toBe('network')
    const controller = new AbortController()
    controller.abort()
    await expect(updateVariantStock('p1', 'v1', 1, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('setProductActive', () => {
  it('sends only { isActive }, so the product images are never touched', async () => {
    reply({ id: 'p1', isActive: false })
    await setProductActive('p1', false)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/products\/p1$/)
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe('{"isActive":false}')

    reply({ id: 'p1', isActive: true })
    await setProductActive('p1', true)
    expect(fetchMock.mock.calls[1][1].body).toBe('{"isActive":true}')
  })

  it('rejects an answer that disagrees, and maps errors', async () => {
    reply({ id: 'p1', isActive: true })
    expect(await kindOf(setProductActive('p1', false))).toBe('server')
    reply({}, 403)
    expect(await kindOf(setProductActive('p1', false))).toBe('forbidden')
  })
})

describe('updateStocks', () => {
  it('sends one PATCH per variant and reports which saved and which failed', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ stock: 5 })))
      .mockResolvedValueOnce(new Response('{}', { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ stock: 7 })))
    const result = await updateStocks('p1', [
      { variantId: 'a', stock: 5 },
      { variantId: 'b', stock: 6 },
      { variantId: 'c', stock: 7 },
    ])
    expect(result.saved).toEqual(['a', 'c'])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({ variantId: 'b' })
    expect((result.failed[0].error as ProductListError).kind).toBe('conflict')
    expect(fetchMock.mock.calls.map((c) => c[1].body)).toEqual(['{"stock":5}', '{"stock":6}', '{"stock":7}'])
  })

  it('stops and rejects when aborted', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    await expect(updateStocks('p1', [{ variantId: 'a', stock: 1 }, { variantId: 'b', stock: 2 }], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

const API_VARIANT = { id: 'v9', sku: 'TEE-1-M', name: null, size: 'M', color: null, colorHex: null, price: 500, stock: 0, imageUrl: null, measurements: null }

/** The failing answers every manage call shares: how each status and failure becomes an error kind. */
function failsLikeTheOthers(call: () => Promise<unknown>) {
  it.each([
    [400, 'validation'],
    [401, 'forbidden'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [409, 'conflict'],
    [429, 'rate-limit'],
    [500, 'server'],
  ])('maps a %i answer to %s', async (status, kind) => {
    reply({ message: 'x' }, status)
    expect(await kindOf(call())).toBe(kind)
  })

  it('reports a dropped connection as a network fault', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'))
    expect(await kindOf(call())).toBe('network')
  })
}

describe('deleteProduct', () => {
  it('sends DELETE with the encoded id and no body or Content-Type', async () => {
    reply({ success: true })
    await expect(deleteProduct('p 1')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/products\/p%201$/)
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
    expect(init.headers).toEqual({ Authorization: 'Bearer tok' })
  })

  it('rejects an answer without success: true as a server fault', async () => {
    reply({ success: false })
    expect(await kindOf(deleteProduct('p1'))).toBe('server')
    reply('nope')
    expect(await kindOf(deleteProduct('p1'))).toBe('server')
  })

  failsLikeTheOthers(() => deleteProduct('p1'))
})

describe('addVariant', () => {
  it('POSTs the input as is and answers with the parsed variant', async () => {
    reply(API_VARIANT, 201)
    const input = { size: 'M', price: 500, stock: 4, measurements: { chestWidthCm: 50 } }
    expect(await addVariant('p/1', input)).toEqual(API_VARIANT)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/products\/p%2F1\/variants$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(input)
  })

  it('rejects a malformed variant as a server fault', async () => {
    reply({ id: 'v9' }, 201)
    expect(await kindOf(addVariant('p1', { size: 'M', price: 1 }))).toBe('server')
  })

  it('carries the server message of a 400 (a list of them is joined) and the SKU a 409 names', async () => {
    reply({ message: ['price must not be less than 0', 'colorHex is required'] }, 400)
    const bad = (await addVariant('p1', { size: 'M', price: 1 }).catch((e: unknown) => e)) as ProductListError
    expect(bad.kind).toBe('validation')
    expect(bad.detail).toBe('price must not be less than 0; colorHex is required')
    reply({ message: 'SKU "TEE-1-M" is already in use' }, 409)
    const taken = (await addVariant('p1', { sku: 'TEE-1-M', size: 'M', price: 1 }).catch((e: unknown) => e)) as ProductListError
    expect(taken.kind).toBe('conflict')
    expect(taken.detail).toContain('TEE-1-M')
  })

  failsLikeTheOthers(() => addVariant('p1', { size: 'M', price: 1 }))
})

describe('updateVariant', () => {
  it('PATCHes the encoded product and variant with exactly the patch, and never sends stock for a price change', async () => {
    reply({ ...API_VARIANT, price: 700 })
    expect((await updateVariant('p 1', 'v/1', { price: 700 })).price).toBe(700)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/products\/p%201\/variants\/v%2F1$/)
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe('{"price":700}')
    expect(init.body).not.toContain('stock')
  })

  it('sends nulls to clear a colour and a measurement', async () => {
    reply(API_VARIANT)
    await updateVariant('p1', 'v1', { color: null, measurements: { neckCm: null } })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ color: null, measurements: { neckCm: null } })
  })

  it('rejects a malformed variant as a server fault', async () => {
    reply({ id: 'v1', sku: 'X' })
    expect(await kindOf(updateVariant('p1', 'v1', { price: 1 }))).toBe('server')
  })

  it('names the SKU of a 409', async () => {
    reply({ message: 'SKU "TEE-2-M" is already in use' }, 409)
    const taken = (await updateVariant('p1', 'v1', { sku: 'TEE-2-M' }).catch((e: unknown) => e)) as ProductListError
    expect(taken.detail).toContain('TEE-2-M')
  })

  failsLikeTheOthers(() => updateVariant('p1', 'v1', { price: 1 }))
})

describe('deleteVariant', () => {
  it('sends DELETE with the encoded ids and no body or Content-Type', async () => {
    reply({ success: true })
    await deleteVariant('p 1', 'v/1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/products\/p%201\/variants\/v%2F1$/)
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
    expect(init.headers).toEqual({ Authorization: 'Bearer tok' })
  })

  it('rejects an answer without success: true as a server fault', async () => {
    reply({})
    expect(await kindOf(deleteVariant('p1', 'v1'))).toBe('server')
  })

  failsLikeTheOthers(() => deleteVariant('p1', 'v1'))
})

describe('updateProduct', () => {
  it('PATCHes only the fields given, and includes images only when passed', async () => {
    reply({ id: 'p1', name: 'New' })
    await updateProduct('p1', { name: 'New', brand: '' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/products\/p1$/)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ name: 'New', brand: '' })
    expect(init.body).not.toContain('images')
    expect(init.body).not.toContain('isActive')

    const images = [{ url: 'https://x/a.jpg', altText: 'Tee', displayOrder: 0, isPrimary: true }]
    reply({ id: 'p1', name: 'New' })
    await updateProduct('p1', { images })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ images })
  })

  it('rejects an answer that is not a product as a server fault', async () => {
    reply({ name: 'x' })
    expect(await kindOf(updateProduct('p1', { name: 'x' }))).toBe('server')
  })

  failsLikeTheOthers(() => updateProduct('p1', { name: 'x' }))
})

describe('createProduct', () => {
  const input = {
    name: 'Tee',
    category: 'Tops',
    basePrice: 500,
    arReady: true,
    images: [
      { url: 'https://x/a.jpg', altText: 'Tee', isPrimary: true },
      { url: 'https://x/b.jpg', altText: 'Tee back', isPrimary: false },
    ],
    variants: [{ sku: 'TOP-TEE-RED-S', size: 'S', color: 'Red', colorHex: '#ff0000', stock: 3 }],
  }

  it('POSTs exactly the product (no arReady, the API has no such field), active, with display orders on the images', async () => {
    reply({ id: 'new-1', name: 'Tee' }, 201)
    await expect(createProduct(input)).resolves.toEqual({ id: 'new-1', name: 'Tee' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/products$/)
    expect(init.method).toBe('POST')
    const { arReady: _sent, basePrice, ...sent } = input
    expect(JSON.parse(init.body)).toEqual({
      ...sent,
      defaultPrice: basePrice,
      isActive: true,
      images: [
        { url: 'https://x/a.jpg', altText: 'Tee', isPrimary: true, displayOrder: 0 },
        { url: 'https://x/b.jpg', altText: 'Tee back', isPrimary: false, displayOrder: 1 },
      ],
    })
  })

  it('treats an answer without id and name as a server fault', async () => {
    reply({ ok: true }, 201)
    expect(await kindOf(createProduct(input))).toBe('server')
  })

  it('maps 400, 409 and 403 and keeps the server message', async () => {
    reply({ message: ['name must be longer', 'sku bad'] }, 400)
    const error = (await createProduct(input).catch((e: unknown) => e)) as ProductListError
    expect(error.kind).toBe('validation')
    expect(error.detail).toBe('name must be longer; sku bad')
    reply({ message: 'SKU TOP-TEE-RED-S already exists' }, 409)
    expect(((await createProduct(input).catch((e: unknown) => e)) as ProductListError).detail).toMatch(/TOP-TEE-RED-S/)
    reply({}, 403)
    expect(await kindOf(createProduct(input))).toBe('forbidden')
  })

  it('reports a dropped connection as network', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    expect(await kindOf(createProduct(input))).toBe('network')
  })
})

describe('uploadProductImage', () => {
  class FakeXhr {
    static last: FakeXhr
    static status = 200
    headers: Record<string, string> = {}
    upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {}
    onload?: () => void
    onerror?: () => void
    onabort?: () => void
    status = 0
    method = ''
    url = ''
    sent: unknown
    constructor() {
      FakeXhr.last = this
    }
    open(method: string, url: string) {
      this.method = method
      this.url = url
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value
    }
    send(body: unknown) {
      this.sent = body
      this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 })
      this.status = FakeXhr.status
      this.onload?.()
    }
    abort() {
      this.onabort?.()
    }
  }

  beforeEach(() => {
    FakeXhr.status = 200
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
  })

  it('uploads to the products bucket with the staff token and answers the public URL', async () => {
    const seen: number[] = []
    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    const url = await uploadProductImage(file, (p) => seen.push(p))
    expect(url).toMatch(/^https:\/\/cdn\.test\/products\/.+\.png$/)
    expect(FakeXhr.last.method).toBe('POST')
    expect(FakeXhr.last.url).toMatch(/\/storage\/v1\/object\/products\/[0-9a-f-]+\.png$/)
    expect(FakeXhr.last.headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'image/png', 'x-upsert': 'false' })
    expect(FakeXhr.last.sent).toBe(file)
    expect(seen).toEqual([25, 100])
  })

  it('reports a refused upload as forbidden (no storage policy for staff)', async () => {
    FakeXhr.status = 403
    expect(await kindOf(uploadProductImage(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), () => {}))).toBe('forbidden')
  })
})
