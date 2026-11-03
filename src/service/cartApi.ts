import { ProductListError, request } from './fetchProductList'
import type { RequestOptions } from './simulateRequest'

export interface ApiCartItem {
  id: string
  variantId: string
  quantity: number
  unitPrice: number
  variant: {
    size: string | null
    color: string | null
    colorHex: string | null
    price: number
    stock: number
    imageUrl: string | null
    product: { id: string; name: string; slug: string; category: string; brand: string | null; isActive: boolean; imageUrl: string | null }
  }
}

export interface ApiCart {
  totalItems: number
  subtotal: number
  items: ApiCartItem[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown) => (typeof value === 'string' && value ? value : null)

function toItem(value: unknown): ApiCartItem {
  if (!isRecord(value) || !isRecord(value.variant) || !isRecord(value.variant.product)) throw new ProductListError('server')
  const { id, variantId, quantity, unitPrice, variant } = value
  const { price, stock, product } = variant as Record<string, unknown> & { product: Record<string, unknown> }
  if (typeof id !== 'string' || typeof variantId !== 'string' || !isCount(quantity) || !isCount(unitPrice) || !isCount(price) || !isCount(stock)) {
    throw new ProductListError('server')
  }
  if (typeof product.id !== 'string' || typeof product.name !== 'string') throw new ProductListError('server')
  return {
    id,
    variantId,
    quantity,
    unitPrice,
    variant: {
      size: text(variant.size),
      color: text(variant.color),
      colorHex: text(variant.colorHex),
      price,
      stock,
      imageUrl: text(variant.imageUrl),
      product: {
        id: product.id,
        name: product.name,
        slug: typeof product.slug === 'string' ? product.slug : '',
        category: typeof product.category === 'string' ? product.category : '',
        brand: text(product.brand),
        isActive: product.isActive !== false,
        imageUrl: text(product.imageUrl),
      },
    },
  }
}

function toCart(body: unknown): ApiCart {
  if (!isRecord(body) || !Array.isArray(body.items)) throw new ProductListError('server')
  const items = body.items.map(toItem)
  return {
    totalItems: isCount(body.totalItems) ? body.totalItems : items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: isCount(body.subtotal) ? body.subtotal : items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    items,
  }
}

/** GET /cart. Needs a signed-in user. */
export async function fetchCart({ signal }: RequestOptions = {}) {
  return toCart(await request('GET', '/cart', undefined, signal))
}

/** POST /cart/items. An item already in the cart gains the quantity. Answers with the whole cart; 400 when it would pass the stock or the product is inactive. */
export async function addCartItem(variantId: string, quantity: number, { signal }: RequestOptions = {}) {
  return toCart(await request('POST', '/cart/items', { variantId, quantity }, signal))
}

/** PATCH /cart/items/:itemId. Answers with the whole cart. */
export async function setCartItemQuantity(itemId: string, quantity: number, { signal }: RequestOptions = {}) {
  return toCart(await request('PATCH', `/cart/items/${encodeURIComponent(itemId)}`, { quantity }, signal))
}

/** Feature: Cart – Clear cart */
/** DELETE /cart. Empties the cart. The API answers `{ success: true }` only. */
export async function clearCart({ signal }: RequestOptions = {}) {
  await request('DELETE', '/cart', undefined, signal)
}

/** DELETE /cart/items/:itemId. The API answers `{ success: true }` only, so the caller reloads the cart. */
export async function removeCartItem(itemId: string, { signal }: RequestOptions = {}) {
  await request('DELETE', `/cart/items/${encodeURIComponent(itemId)}`, undefined, signal)
}
