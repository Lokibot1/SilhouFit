import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addCartItem, fetchCart, removeCartItem, setCartItemQuantity } from '../../src/service/cartApi'
import { ProductListError, request } from '../../src/service/fetchProductList'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const item = (over: Record<string, unknown> = {}) => ({
  id: 'item-1',
  cartId: 'cart-1',
  variantId: 'v1',
  quantity: 2,
  unitPrice: 1500,
  totalPrice: 3000,
  variant: {
    size: 'M',
    color: 'Navy',
    colorHex: '#1b2a49',
    price: 1500,
    stock: 5,
    imageUrl: '',
    product: { id: 'p1', name: 'Linen Shirt', slug: 'linen-shirt', category: 'Hoodie', brand: 'Atelier', isActive: true, imageUrl: 'https://img.test/linen-shirt-front.webp' },
  },
  ...over,
})
const cart = (items: unknown[] = [item()]) => ({ id: 'cart-1', userId: 'u1', totalItems: 2, subtotal: 3000, items })

beforeEach(() => vi.resetAllMocks())

describe('cartApi', () => {
  it('reads the cart: lines with their variant and product, an empty image as none', async () => {
    send.mockResolvedValue(cart())
    const result = await fetchCart()
    expect(send).toHaveBeenCalledWith('GET', '/cart', undefined, undefined)
    expect(result).toMatchObject({ totalItems: 2, subtotal: 3000 })
    expect(result.items[0]).toMatchObject({
      id: 'item-1',
      variantId: 'v1',
      quantity: 2,
      unitPrice: 1500,
      variant: { size: 'M', color: 'Navy', stock: 5, imageUrl: null, product: { id: 'p1', name: 'Linen Shirt', isActive: true, imageUrl: 'https://img.test/linen-shirt-front.webp' } },
    })
  })

  it('reads a product without a photo as imageUrl null', async () => {
    send.mockResolvedValue(cart([item({ variant: { ...item().variant, product: { ...item().variant.product, imageUrl: null } } }), item({ variant: { ...item().variant, product: { ...item().variant.product, imageUrl: undefined } } })]))
    expect((await fetchCart()).items.map((i) => i.variant.product.imageUrl)).toEqual([null, null])
  })

  it('reads an inactive product as inactive', async () => {
    send.mockResolvedValue(cart([item({ variant: { ...item().variant, product: { ...item().variant.product, isActive: false } } })]))
    expect((await fetchCart()).items[0].variant.product.isActive).toBe(false)
  })

  it('works out the totals when the API leaves them out', async () => {
    send.mockResolvedValue({ items: [item({ quantity: 3 })] })
    expect(await fetchCart()).toMatchObject({ totalItems: 3, subtotal: 4500 })
  })

  it.each([['not an object', 'cart'], ['no items', {}], ['an item without a variant', { items: [{ id: 'x' }] }], ['an item with a text quantity', { items: [item({ quantity: '2' })] }]])(
    'rejects %s as a server error',
    async (_label, body) => {
      send.mockResolvedValue(body)
      await expect(fetchCart()).rejects.toMatchObject({ kind: 'server' })
    },
  )

  it('sends the add, the quantity change and the removal to the right routes', async () => {
    send.mockResolvedValue(cart())
    await addCartItem('v1', 2)
    expect(send).toHaveBeenLastCalledWith('POST', '/cart/items', { variantId: 'v1', quantity: 2 }, undefined)
    await setCartItemQuantity('item/1', 4)
    expect(send).toHaveBeenLastCalledWith('PATCH', '/cart/items/item%2F1', { quantity: 4 }, undefined)
    send.mockResolvedValue({ success: true })
    await removeCartItem('item-1')
    expect(send).toHaveBeenLastCalledWith('DELETE', '/cart/items/item-1', undefined, undefined)
  })

  it("lets the API's refusal through with its reason", async () => {
    send.mockRejectedValue(new ProductListError('validation', 'Only 2 in stock'))
    await expect(addCartItem('v1', 9)).rejects.toMatchObject({ kind: 'validation', detail: 'Only 2 in stock' })
  })
})
