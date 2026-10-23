import { ProductListError, request } from './fetchProductList'
import type { RequestOptions } from './simulateRequest'

/** The seller printed on every invoice. */
export interface MerchantProfile {
  registeredName: string
  /** The nine-digit TIN, e.g. "000-000-000". */
  tin: string
  /** Five digits, e.g. "00000". */
  branchCode: string
  address: string
  vatRegistered: boolean
  /** The Permit to Use number, typed by the merchant. */
  permitNo: string
  /** Free text under the totals; may be empty. */
  footerText: string
  /** True while the profile is a placeholder, so the invoice says so. */
  sample: boolean
}

/** An invoice number and how many times the invoice has been exported (downloaded or printed). */
export interface InvoiceRecord {
  invoiceNo: string
  exportCount: number
}

export interface InvoiceBundle {
  profile: MerchantProfile
  /** Null until the order's first download or print has issued a number, and always null while the profile is incomplete (a draft). Previewing never issues one. */
  invoice: InvoiceRecord | null
}

/** What an export returns: `reprintCount` is how many exports came before it, so 0 is the original and 1 the first duplicate. */
export interface InvoiceExport {
  invoiceNo: string
  reprintCount: number
}

/** True when every field an invoice needs is filled in. The footer text is optional. */
export const isMerchantComplete = (profile: MerchantProfile) =>
  [profile.registeredName, profile.tin, profile.address, profile.permitNo].every((value) => value.trim() !== '') && /^\d{5}$/.test(profile.branchCode)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * GET /merchant/profile. Staff only. The backend has no merchant model yet, so this is the contract:
 *   { registeredName, tin, branchCode, address, vatRegistered, permitNo, footerText }
 * Editing it will be PUT /merchant/profile with the same body (strictly validated: TIN 9 digits, branchCode 5 digits).
 */
export async function fetchMerchantProfile({ signal }: RequestOptions = {}): Promise<MerchantProfile> {
  const body = await request('GET', '/merchant/profile', undefined, signal)
  if (!isRecord(body)) throw new ProductListError('server')
  const { registeredName, tin, branchCode, address, vatRegistered, permitNo, footerText } = body
  if ([registeredName, tin, branchCode, address, permitNo, footerText].some((v) => typeof v !== 'string') || typeof vatRegistered !== 'boolean') throw new ProductListError('server')
  return { registeredName, tin, branchCode, address, vatRegistered, permitNo, footerText, sample: false } as MerchantProfile
}

function toRecord(body: unknown): InvoiceRecord {
  if (!isRecord(body) || typeof body.invoiceNo !== 'string' || typeof body.exportCount !== 'number') throw new ProductListError('server')
  return { invoiceNo: body.invoiceNo, exportCount: body.exportCount }
}

/**
 * POST /orders/:id/invoice. Called on the first real download or print, never for a preview. Issues the order's invoice number,
 * or returns the one it already has (idempotent; numbers are gapless and consecutive per seller, "SI-0000001").
 *   { invoiceNo, exportCount }
 */
export async function issueInvoice(orderId: string, { signal }: RequestOptions = {}): Promise<InvoiceRecord> {
  return toRecord(await request('POST', `/orders/${encodeURIComponent(orderId)}/invoice`, undefined, signal))
}

/**
 * GET /orders/:id/invoice. Read-only: the same body as the POST, or 404 when no invoice was issued yet (null here).
 * It must never issue a number.
 */
export async function lookupInvoice(orderId: string, { signal }: RequestOptions = {}): Promise<InvoiceRecord | null> {
  try {
    return toRecord(await request('GET', `/orders/${encodeURIComponent(orderId)}/invoice`, undefined, signal))
  } catch (error) {
    if (error instanceof ProductListError && error.kind === 'not-found') return null
    throw error
  }
}

/**
 * POST /orders/:id/invoice/reprint. Records one export of an issued invoice (a 404 if none was issued):
 *   { invoiceNo, reprintCount }   // reprintCount: exports before this one; 0 is the original
 */
export async function exportInvoice(orderId: string, { signal }: RequestOptions = {}): Promise<InvoiceExport> {
  const body = await request('POST', `/orders/${encodeURIComponent(orderId)}/invoice/reprint`, undefined, signal)
  if (!isRecord(body) || typeof body.invoiceNo !== 'string' || typeof body.reprintCount !== 'number') throw new ProductListError('server')
  return { invoiceNo: body.invoiceNo, reprintCount: body.reprintCount }
}

/** The profile, and the order's invoice number if it was already issued. Nothing is issued here, so a preview burns no number. */
export async function fetchInvoiceBundle(orderId: string, options: RequestOptions = {}): Promise<InvoiceBundle> {
  const profile = await fetchMerchantProfile(options)
  return { profile, invoice: isMerchantComplete(profile) ? await lookupInvoice(orderId, options) : null }
}
