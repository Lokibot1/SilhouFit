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
import {
  INVENTORY_SAMPLE_DATA,
  sampleAddVariant,
  sampleCreateProduct,
  sampleDeleteProduct,
  sampleDeleteVariant,
  sampleRestockVariants,
  sampleSetArchived,
  sampleSetArReady,
  sampleSkus,
  sampleUpdateProduct,
  sampleUpdateVariant,
  sampleUploadImage,
} from './sampleInventory'
import type { RequestOptions } from './simulateRequest'

/** Archives or restores a product, from the sample catalogue or the API. */
export const setArchived = (productId: string, archived: boolean, options: RequestOptions = {}): Promise<void> =>
  INVENTORY_SAMPLE_DATA ? sampleSetArchived(productId, archived, options) : setProductActive(productId, !archived, options)

/** Sets variants to exact stock numbers. The sample catalogue saves all or none; the API saves one by one, so some may fail while others are saved. */
export async function saveStocks(productId: string, changes: StockChange[], options: RequestOptions = {}): Promise<StockResult> {
  if (!INVENTORY_SAMPLE_DATA) return updateStocks(productId, changes, options)
  await sampleRestockVariants(productId, changes, options)
  return { saved: changes.map((c) => c.variantId), failed: [] }
}

/** Turns AR Fitting on or off. Sample catalogue only: the API has no `arReady` field to PATCH (see productAdmin), so the drawer hides the checkbox there. */
export const saveArReady = (productId: string, arReady: boolean, options: RequestOptions = {}): Promise<void> => sampleSetArReady(productId, arReady, options)

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
export const uploadImage = (file: File, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<string> =>
  INVENTORY_SAMPLE_DATA ? sampleUploadImage(file, onProgress, { signal }) : uploadProductImage(file, onProgress, signal)

/** Creates a product from the sample catalogue or the API. Never retried on its own: the caller decides. */
export const addProduct = (input: NewProductInput, options: RequestOptions = {}): Promise<{ id: string; name: string }> =>
  INVENTORY_SAMPLE_DATA ? sampleCreateProduct(input, options) : createProduct(input, options)

/** SKUs known to be taken before sending. Only the sample catalogue can say; the API answers 409 for one that is. */
export const knownSkus = (): Set<string> => (INVENTORY_SAMPLE_DATA ? sampleSkus() : new Set())

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
  return (stage === 'upload' ? UPLOAD_WHY : CREATE_WHY)[kind] ?? WHY.server
}

/** Deletes a product for good, from the sample catalogue or the API. */
export const removeProduct = (productId: string, options: RequestOptions = {}): Promise<void> =>
  INVENTORY_SAMPLE_DATA ? sampleDeleteProduct(productId, options) : deleteProduct(productId, options)

/** Adds a variant to a product. */
export const createVariant = (productId: string, input: VariantInput, options: RequestOptions = {}): Promise<ProductVariant> =>
  INVENTORY_SAMPLE_DATA ? sampleAddVariant(productId, input, options) : addVariant(productId, input, options)

/** Saves the changed fields of a variant. */
export const saveVariant = (productId: string, variantId: string, patch: VariantPatch, options: RequestOptions = {}): Promise<ProductVariant> =>
  INVENTORY_SAMPLE_DATA ? sampleUpdateVariant(productId, variantId, patch, options) : updateVariant(productId, variantId, patch, options)

/** Deletes a variant for good. */
export const removeVariant = (productId: string, variantId: string, options: RequestOptions = {}): Promise<void> =>
  INVENTORY_SAMPLE_DATA ? sampleDeleteVariant(productId, variantId, options) : deleteVariant(productId, variantId, options)

/** Saves the changed fields of a product. */
export const saveProduct = (productId: string, patch: ProductPatch, options: RequestOptions = {}): Promise<void> =>
  INVENTORY_SAMPLE_DATA ? sampleUpdateProduct(productId, patch, options) : updateProduct(productId, patch, options)

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
