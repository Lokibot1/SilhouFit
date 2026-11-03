import { ProductListError, request } from './fetchProductList'
import type { RequestOptions } from './simulateRequest'

/** GET /wishlist/ids. Needs a signed-in user. */
export async function fetchWishlistIds({ signal }: RequestOptions = {}) {
  const body = await request('GET', '/wishlist/ids', undefined, signal)
  const productIds = typeof body === 'object' && body !== null ? (body as { productIds?: unknown }).productIds : undefined
  if (!Array.isArray(productIds)) throw new ProductListError('server')
  return productIds.filter((id): id is string => typeof id === 'string')
}

/** Feature: Wishlist – Saved list */
/** GET /wishlist. Every saved piece with when it was saved, newest first. Only the id and the date are kept: the cards load their products in full elsewhere. */
export async function fetchWishlist({ signal }: RequestOptions = {}) {
  const body = await request('GET', '/wishlist', undefined, signal)
  const items = typeof body === 'object' && body !== null ? (body as { items?: unknown }).items : undefined
  if (!Array.isArray(items)) throw new ProductListError('server')
  return items.flatMap((item: { productId?: unknown; createdAt?: unknown } | null) =>
    typeof item?.productId === 'string' && typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt)) ? [{ productId: item.productId, createdAt: item.createdAt }] : [],
  )
}

/** POST /wishlist. Saving a piece that is already saved is fine. */
export async function addWishlistItem(productId: string, { signal }: RequestOptions = {}) {
  await request('POST', '/wishlist', { productId }, signal)
}

/** DELETE /wishlist. Empties the whole list, including pieces hidden because they were archived. */
export async function clearWishlist({ signal }: RequestOptions = {}) {
  await request('DELETE', '/wishlist', undefined, signal)
}

/** DELETE /wishlist/:productId. */
export async function removeWishlistItem(productId: string, { signal }: RequestOptions = {}) {
  await request('DELETE', `/wishlist/${encodeURIComponent(productId)}`, undefined, signal)
}
