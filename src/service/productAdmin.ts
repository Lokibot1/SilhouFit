import { ProductListError, request, toVariant, type Gender, type MeasurementKey, type ProductListErrorKind, type ProductVariant } from './fetchProductList'
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
  arReady: boolean
  description?: string
  /** The API gives each variant without measurements of its own the base measurements of its category and size. */
  inheritBaseMeasurements?: boolean
  /** The first image is the primary one. */
  images: { url: string; altText: string; isPrimary: boolean }[]
  variants: { sku: string; size: string; color: string; colorHex: string; stock: number; price?: number; measurements?: MeasurementsInput }[]
}

/**
 * POST /products. Answers with the new product's id and name; anything else is a server fault. A 400 carries the server's message
 * in `detail`, and a 409 (a SKU already in the catalogue) names the SKU there.
 */
export async function createProduct({ arReady, basePrice, ...input }: NewProductInput, { signal }: RequestOptions = {}): Promise<{ id: string; name: string }> {
  const body = await request(
    'POST',
    '/products',
    // The API calls it `defaultPrice` (the price of any variant that has none of its own); an unknown `basePrice` key would be a 400.
    { ...input, defaultPrice: basePrice, isArReady: arReady, isActive: true, images: input.images.map((image, displayOrder) => ({ ...image, displayOrder })) },
    signal,
  )
  if (!isRecord(body) || typeof body.id !== 'string' || typeof body.name !== 'string') throw new ProductListError('server')
  return { id: body.id, name: body.name }
}

/** DELETE /products/:id. Permanent: the API removes the product with its images, variants, measurements and cart items. */
export async function deleteProduct(productId: string, { signal }: RequestOptions = {}): Promise<void> {
  const body = await request('DELETE', path(productId), undefined, signal)
  if (!isRecord(body) || body.success !== true) throw new ProductListError('server')
}

/** Garment measurements in cm; on a patch, `null` clears one. */
export type MeasurementsInput<T = number> = Partial<Record<MeasurementKey, T>>

export interface VariantInput {
  /** Blank or left out: the API generates one. */
  sku?: string
  name?: string
  size?: string
  color?: string
  /** Required with `color`. */
  colorHex?: string
  price: number
  stock?: number
  imageUrl?: string
  measurements?: MeasurementsInput
}

/** Only the keys that changed. `null` clears a name, size or colour (clearing the colour clears its hex); a new colour needs its `colorHex` in the same patch. */
export interface VariantPatch {
  sku?: string
  name?: string | null
  size?: string | null
  color?: string | null
  colorHex?: string | null
  price?: number
  imageUrl?: string
  measurements?: MeasurementsInput<number | null>
}

/** POST /products/:id/variants. Answers with the new variant; a 400 says which rule it broke and a 409 names the SKU that is taken. */
export async function addVariant(productId: string, input: VariantInput, { signal }: RequestOptions = {}): Promise<ProductVariant> {
  return toVariant(await request('POST', `${path(productId)}/variants`, input, signal))
}

/** PATCH /products/:id/variants/:variantId. The API merges the patch into the variant and checks the whole again. */
export async function updateVariant(productId: string, variantId: string, patch: VariantPatch, { signal }: RequestOptions = {}): Promise<ProductVariant> {
  return toVariant(await request('PATCH', path(productId, variantId), patch, signal))
}

/** DELETE /products/:id/variants/:variantId. The last variant of a product can go too; the product is then left with no price or stock. */
export async function deleteVariant(productId: string, variantId: string, { signal }: RequestOptions = {}): Promise<void> {
  const body = await request('DELETE', path(productId, variantId), undefined, signal)
  if (!isRecord(body) || body.success !== true) throw new ProductListError('server')
}

export interface ProductPatch {
  name?: string
  description?: string
  category?: string
  /** Cannot be cleared; send '' to empty it. */
  brand?: string
  gender?: Gender
  isArReady?: boolean
  /** Replaces every image of the product, so send the whole ordered list or leave it out. */
  images?: { url: string; altText?: string; displayOrder: number; isPrimary: boolean }[]
}

/**
 * PATCH /products/:id with the fields that changed. Never `isActive` (see setProductActive), and `images` only when they changed, since the API
 * replaces them all. A new name makes a new slug.
 */
export async function updateProduct(productId: string, patch: ProductPatch, { signal }: RequestOptions = {}): Promise<void> {
  const body = await request('PATCH', path(productId), patch, signal)
  if (!isRecord(body) || typeof body.id !== 'string') throw new ProductListError('server')
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
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      // Storage answers a policy rejection as HTTP 400 and puts the real code (403) in the body, so read that first.
      let status = xhr.status
      let detail: string | undefined
      try {
        const body = JSON.parse(xhr.responseText) as { statusCode?: string | number; message?: string }
        status = Number(body.statusCode) || status
        detail = body.message
      } catch {
        // Not JSON; the HTTP status stands.
      }
      reject(new ProductListError(UPLOAD_KIND[status] ?? 'server', detail))
    }
    xhr.onerror = () => reject(new ProductListError('network'))
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(file)
  })
  onProgress(100)
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}
