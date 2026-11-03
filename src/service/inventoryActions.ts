import type { ProductVariant } from './fetchProductList'
import {
  addVariant,
  createProduct,
  deleteProduct,
  deleteVariant,
  setProductActive,
  updateProduct,
  updateStocks,
  updateVariant,
  uploadProductImage,
  type NewProductInput,
  type ProductPatch,
  type StockChange,
  type StockResult,
  type VariantInput,
  type VariantPatch,
} from './productAdmin'
import { invalidateShopColours } from '../hooks/useShopColours'
import type { RequestOptions } from './simulateRequest'

// Every change below that alters what the shop shows (a product or variant created, edited, archived or deleted) also drops the shop's
// remembered products and colour filter options, so the shop reads them again. Stock changes leave the colours as they are.
const refreshShop = async <T,>(change: Promise<T>): Promise<T> => {
  const result = await change
  invalidateShopColours()
  return result
}

/** Archives or restores a product. */
export const setArchived = (productId: string, archived: boolean, options: RequestOptions = {}): Promise<void> =>
  refreshShop(setProductActive(productId, !archived, options))

/** Sets variants to exact stock numbers in one request: either every change is saved or none is. */
export const saveStocks = (productId: string, changes: StockChange[], options: RequestOptions = {}): Promise<StockResult> => updateStocks(productId, changes, options)

const WHY: Record<string, string> = {
  network: 'The connection dropped before the server answered. Check your connection, then try again.',
  'rate-limit': 'The server is limiting requests right now. Wait a minute, then try again.',
  validation: 'The server rejected the value. Stock must be a whole number from 0 to 99,999, so check it and try again.',
  conflict: 'Someone else changed this product at the same time. Reload the list, then try again.',
  forbidden: 'Your account is not allowed to change inventory. Sign in again, or ask an admin for access.',
  'not-found': 'The product no longer exists. Reload the list to see what is there now.',
  server: 'Something went wrong on our side. Try again in a moment.',
}

/** Why a change failed and what to do next, for the "what happened" sentence that comes before it. */
export const failureReason = (error: unknown): string => WHY[(error as { kind?: string } | null)?.kind ?? ''] ?? WHY.server

/** Uploads one product image and answers with its URL. */
export const uploadImage = (file: File, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<string> => uploadProductImage(file, onProgress, signal)

/** Creates a product. Never retried on its own: the caller decides. */
export const addProduct = (input: NewProductInput, options: RequestOptions = {}): Promise<{ id: string; name: string }> => refreshShop(createProduct(input, options))

const CREATE_WHY: Record<string, string> = {
  ...WHY,
  conflict: 'A SKU in this product is already used by another product. Change the SKU marked below, then create it again.',
  forbidden: 'Your account is not allowed to add products. Sign in again, or ask an admin for access.',
  'not-found': 'The products service could not be reached at that address. Try again in a moment.',
}
const UPLOAD_WHY: Record<string, string> = {
  ...CREATE_WHY,
  validation: 'The server refused the file. Use a JPG, PNG or WebP image under 5 MB, then try again.',
  forbidden: 'Your account is not allowed to upload to the product images storage. Ask an admin to allow staff uploads, then try again.',
}

/** Why adding a product failed and what to do next. A 400 says what the server objected to. */
export function createFailureReason(error: unknown, stage: 'upload' | 'create'): string {
  const { kind = '', detail } = (error ?? {}) as { kind?: string; detail?: string }
  if (kind === 'validation' && stage === 'create')
    return `The server rejected the product${detail ? `: ${detail}` : ''}. Check what you entered, then create it again.`
  const why = (stage === 'upload' ? UPLOAD_WHY : CREATE_WHY)[kind] ?? WHY.server
  return stage === 'upload' && detail ? `${why} (Server said: ${detail})` : why
}

/** Deletes a product for good. */
export const removeProduct = (productId: string, options: RequestOptions = {}): Promise<void> => refreshShop(deleteProduct(productId, options))

/** Adds a variant to a product. */
export const createVariant = (productId: string, input: VariantInput, options: RequestOptions = {}): Promise<ProductVariant> =>
  refreshShop(addVariant(productId, input, options))

/** Saves the changed fields of a variant. */
export const saveVariant = (productId: string, variantId: string, patch: VariantPatch, options: RequestOptions = {}): Promise<ProductVariant> =>
  refreshShop(updateVariant(productId, variantId, patch, options))

/** Deletes a variant for good. */
export const removeVariant = (productId: string, variantId: string, options: RequestOptions = {}): Promise<void> =>
  refreshShop(deleteVariant(productId, variantId, options))

/** Saves the changed fields of a product. */
export const saveProduct = (productId: string, patch: ProductPatch, options: RequestOptions = {}): Promise<void> => refreshShop(updateProduct(productId, patch, options))

export type ManageAction = 'delete-product' | 'delete-variant' | 'add-variant' | 'save-variant' | 'save-product'

const MANAGE_VERB: Record<ManageAction, string> = {
  'delete-product': 'delete products',
  'delete-variant': 'delete variants',
  'add-variant': 'add variants',
  'save-variant': 'edit variants',
  'save-product': 'edit products',
}

/** Why deleting, adding or editing a product or variant failed and what to do next, for the "what happened" sentence before it. A 400 says what the server objected to. */
export function manageFailureReason(error: unknown, action: ManageAction): string {
  const { kind = '', detail } = (error ?? {}) as { kind?: string; detail?: string }
  if (kind === 'validation') return `The server rejected the change${detail ? `: ${detail}` : ''}. Check what you entered, then try again.`
  if (kind === 'conflict') return 'That SKU is already used by another variant. Change the SKU, then try again.'
  if (kind === 'forbidden') return `Your account is not allowed to ${MANAGE_VERB[action]}. Sign in again, or ask an admin for access.`
  if (kind === 'not-found') return 'It no longer exists, so someone may have deleted it. Reload the list to see what is there now.'
  return WHY[kind] ?? WHY.server
}
