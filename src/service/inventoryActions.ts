import { createProduct, setProductActive, updateStocks, uploadProductImage, type NewProductInput, type StockChange, type StockResult } from './productAdmin'
import { INVENTORY_SAMPLE_DATA, sampleCreateProduct, sampleRestockVariants, sampleSetArchived, sampleSetArReady, sampleSkus, sampleUploadImage } from './sampleInventory'
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
    return `The server rejected the product${detail ? `: ${detail}` : ''}. Check the highlighted fields, then create it again.`
  return (stage === 'upload' ? UPLOAD_WHY : CREATE_WHY)[kind] ?? WHY.server
}
