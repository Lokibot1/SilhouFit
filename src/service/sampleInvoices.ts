import {
  isMerchantComplete,
  type InvoiceBundle,
  type InvoiceExport,
  type InvoiceRecord,
  type MerchantProfile,
} from './fetchInvoice'
import { simulateRequest, type RequestOptions } from './simulateRequest'

/** A placeholder seller. Every value is obviously fake, and the invoice is tagged as a sample while it is used. */
export const SAMPLE_MERCHANT: MerchantProfile = {
  registeredName: 'SilhouFit Sample Store',
  tin: '000-000-000',
  branchCode: '00000',
  address: '123 Sample Street, Sample Barangay, Sample City, Metro Manila 0000',
  vatRegistered: true,
  permitNo: 'SAMPLE-PTU-0000-0000',
  footerText: 'Thank you for shopping with us. This is a sample invoice.',
  sample: true,
}

// Kept in memory, so a reload starts again at SI-0000001. The real API keeps these per seller.
const issued = new Map<string, InvoiceRecord>()
let profile = SAMPLE_MERCHANT

/** Back to an empty book and the sample merchant. For tests. */
export function resetSampleInvoices() {
  issued.clear()
  profile = SAMPLE_MERCHANT
}

/** Replaces fields of the sample merchant, e.g. to blank one and see the draft. For tests. */
export function setSampleMerchant(changes: Partial<MerchantProfile>) {
  profile = { ...SAMPLE_MERCHANT, ...changes }
}

/** The number issued for an order, or undefined while it has none. */
export const invoiceNoFor = (orderId: string) => issued.get(orderId)?.invoiceNo

export async function sampleMerchantProfile({ signal, delayMs = 300 }: RequestOptions = {}): Promise<MerchantProfile> {
  await simulateRequest(delayMs, signal, () => false)
  return profile
}

/** Read-only: the order's record, or null while it has none. Never issues a number. */
export async function sampleLookupInvoice(orderId: string, { signal, delayMs = 300 }: RequestOptions = {}): Promise<InvoiceRecord | null> {
  await simulateRequest(delayMs, signal, () => false)
  const record = issued.get(orderId)
  return record ? { ...record } : null
}

/** Called on the first export. The same order always gets the same number; a new order gets the next one, with no gaps. */
export async function sampleIssueInvoice(orderId: string, { signal, delayMs = 300 }: RequestOptions = {}): Promise<InvoiceRecord> {
  await simulateRequest(delayMs, signal, () => false)
  let record = issued.get(orderId)
  if (!record) {
    record = { invoiceNo: `SI-${String(issued.size + 1).padStart(7, '0')}`, exportCount: 0 }
    issued.set(orderId, record)
  }
  return { ...record }
}

export async function sampleExportInvoice(orderId: string, { signal, delayMs = 300 }: RequestOptions = {}): Promise<InvoiceExport> {
  await simulateRequest(delayMs, signal, () => false)
  const record = issued.get(orderId)
  if (!record) throw Object.assign(new Error('No invoice was issued for this order.'), { kind: 'not-found' })
  return { invoiceNo: record.invoiceNo, reprintCount: record.exportCount++ }
}

export async function sampleInvoiceBundle(orderId: string, options: RequestOptions = {}): Promise<InvoiceBundle> {
  const merchant = await sampleMerchantProfile(options)
  return { profile: merchant, invoice: isMerchantComplete(merchant) ? await sampleLookupInvoice(orderId, options) : null }
}
