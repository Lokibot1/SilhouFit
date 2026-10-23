import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError } from '../../src/service/fetchProductList'
import { createProduct, setProductActive, updateStocks, updateVariantStock, uploadProductImage } from '../../src/service/productAdmin'

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
    const { arReady: _sent, ...sent } = input
    expect(JSON.parse(init.body)).toEqual({
      ...sent,
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
