import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession } }),
}))

const { fetchProductById, fetchProductBySlug } = await import('../../src/service/fetchProductList')

const DETAIL = {
  id: 'p-1',
  name: 'Linen Shirt',
  slug: 'linen-shirt',
  category: 'Tops',
  brand: 'Acme',
  minPrice: 450,
  maxPrice: 600,
  createdAt: '2026-01-15T08:30:00.000Z',
  images: [
    { url: 'https://img/a.jpg', altText: null, isPrimary: false },
    { url: 'https://img/b.jpg', altText: 'Front', isPrimary: true },
  ],
  variants: [
    { stock: 2, price: 450 },
    { stock: 3, price: 600 },
  ],
}
const fetchMock = vi.fn()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'token-123' } } })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('fetchProductBySlug', () => {
  it('calls /products/slug/:slug with the slug URL-encoded', async () => {
    fetchMock.mockResolvedValue(json(DETAIL))
    await fetchProductBySlug('a/b c?d')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/products\/slug\/a%2Fb%20c%3Fd$/)
    expect(init.method).toBe('GET')
  })

  it('shapes the product like fetchProductById and carries the slug through', async () => {
    fetchMock.mockImplementation(async () => json(DETAIL))
    const bySlug = await fetchProductBySlug('linen-shirt')
    const byId = await fetchProductById('p-1')
    expect(bySlug).toEqual(byId)
    expect(bySlug).toMatchObject({
      slug: 'linen-shirt',
      minPrice: 450,
      maxPrice: 600,
      totalStock: 5,
      primaryImage: { url: 'https://img/b.jpg', altText: 'Front' },
    })
  })

  it('maps a 404 to not-found', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Not found' }, 404))
    await expect(fetchProductBySlug('nope')).rejects.toMatchObject({ kind: 'not-found' })
  })

  it('maps a body without variants to server', async () => {
    const { variants: _variants, ...noVariants } = DETAIL
    fetchMock.mockResolvedValue(json(noVariants))
    await expect(fetchProductBySlug('linen-shirt')).rejects.toMatchObject({ kind: 'server' })
  })

  it('sends no Authorization header without a session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    fetchMock.mockResolvedValue(json(DETAIL))
    await fetchProductBySlug('linen-shirt')
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
  })
})
