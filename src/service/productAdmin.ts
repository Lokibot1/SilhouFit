import { ProductListError, request, type Gender, type ProductListErrorKind } from './fetchProductList'
import type { RequestOptions } from './simulateRequest'
import { getSupabase } from './supabase'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const path = (productId: string, variantId?: string) =>
  `/products/${encodeURIComponent(productId)}${variantId ? `/variants/${encodeURIComponent(variantId)}` : ''}`

/** PATCH /products/:id/variants/:variantId. Sets the variant's stock to exactly `stock` (it does not add to it). */
export async function updateVariantStock(productId: string, variantId: string, stock: number, { signal }: RequestOptions = {}): Promise<void> {
  const body = await request('PATCH', path(productId, variantId), { stock }, signal)
  if (!isRecord(body) || body.stock !== stock) throw new ProductListError('server')
}

/**
 * PATCH /products/:id with only `isActive`: the API replaces a product's images whenever `images` is sent, so nothing else goes in the body.
 * Archiving is `isActive: false`; the shop hides the product and nothing is deleted.
 */
export async function setProductActive(productId: string, isActive: boolean, { signal }: RequestOptions = {}): Promise<void> {
  const body = await request('PATCH', path(productId), { isActive }, signal)
  if (!isRecord(body) || body.isActive !== isActive) throw new ProductListError('server')
}

// Backend needs for editing AR Fitting on an existing product: `arReady` (boolean) accepted by PATCH /products/:id and returned by list and
// detail, plus an `arReady` query filter on GET /products. Until then the API would reject the unknown field, so Inventory hides the
// AR Fitting edit and filter outside the sample catalogue.

export interface StockChange {
  variantId: string
  stock: number
}

export interface StockResult {
  saved: string[]
  failed: { variantId: string; error: unknown }[]
}

/** One request per variant, in turn, so a rate limit stops the rest instead of failing them all. An abort rejects; any other failure is reported per variant. */
export async function updateStocks(productId: string, changes: StockChange[], options: RequestOptions = {}): Promise<StockResult> {
  const result: StockResult = { saved: [], failed: [] }
  for (const { variantId, stock } of changes) {
    try {
      await updateVariantStock(productId, variantId, stock, options)
      result.saved.push(variantId)
    } catch (error) {
      if (options.signal?.aborted) throw error
      result.failed.push({ variantId, error })
    }
  }
  return result
}

export interface NewProductInput {
  name: string
  category: string
  basePrice: number
  gender?: Gender
  /** Sample catalogue only: createProduct does not send it. */
  arReady: boolean
  description?: string
  /** The first image is the primary one. */
  images: { url: string; altText: string; isPrimary: boolean }[]
  variants: { sku: string; size: string; color: string; colorHex: string; stock: number; price?: number }[]
}

/**
 * POST /products. Answers with the new product's id and name; anything else is a server fault. A 400 carries the server's message
 * in `detail`, and a 409 (a SKU already in the catalogue) names the SKU there.
 * Backend needs: `Product.arReady` (boolean) on create, update, list and detail. Today AR readiness is only implied by variants having a
 * garmentMeasurement, and the DTO would reject an unknown field, so `arReady` is left out of the body until the API has it.
 */
export async function createProduct({ arReady: _arReady, ...input }: NewProductInput, { signal }: RequestOptions = {}): Promise<{ id: string; name: string }> {
  const body = await request(
    'POST',
    '/products',
    { ...input, isActive: true, images: input.images.map((image, displayOrder) => ({ ...image, displayOrder })) },
    signal,
  )
  if (!isRecord(body) || typeof body.id !== 'string' || typeof body.name !== 'string') throw new ProductListError('server')
  return { id: body.id, name: body.name }
}

const IMAGE_BUCKET = 'products'
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const UPLOAD_KIND: Record<number, ProductListErrorKind> = { 400: 'validation', 413: 'validation', 415: 'validation', 401: 'forbidden', 403: 'forbidden', 429: 'rate-limit' }

/**
 * Uploads a product image to the Supabase `products` bucket and answers with its public URL, which is what POST /products takes.
 * The API has no upload endpoint, so this writes to Storage with the staff member's own session. Backend needs: either a staff
 * insert policy on the `products` bucket (until then a 'forbidden' answer here means staff may not write to it), or an upload
 * endpoint (POST /products/images) that this should call instead. Sent with XHR because fetch cannot report upload progress.
 */
export async function uploadProductImage(file: File, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<string> {
  let supabase: Awaited<ReturnType<typeof getSupabase>>
  let token: string | undefined
  try {
    supabase = await getSupabase()
    token = (await supabase.auth.getSession()).data.session?.access_token
  } catch {
    throw new ProductListError('server')
  }
  signal?.throwIfAborted()
  const path = `${crypto.randomUUID()}.${EXTENSION[file.type] ?? 'jpg'}`
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${IMAGE_BUCKET}/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token ?? anon}`)
    xhr.setRequestHeader('apikey', anon)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100))
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ProductListError(UPLOAD_KIND[xhr.status] ?? 'server')))
    xhr.onerror = () => reject(new ProductListError('network'))
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(file)
  })
  onProgress(100)
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}
