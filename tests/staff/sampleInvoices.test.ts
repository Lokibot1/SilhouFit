import { beforeEach, describe, expect, it } from 'vitest'
import { isMerchantComplete } from '../../src/service/fetchInvoice'
import {
  invoiceNoFor,
  resetSampleInvoices,
  SAMPLE_MERCHANT,
  sampleExportInvoice,
  sampleInvoiceBundle,
  sampleIssueInvoice,
  sampleLookupInvoice,
  setSampleMerchant,
} from '../../src/service/sampleInvoices'

const fast = { delayMs: 0 }

beforeEach(resetSampleInvoices)

describe('isMerchantComplete', () => {
  it('accepts the sample merchant and needs every required field', () => {
    expect(isMerchantComplete(SAMPLE_MERCHANT)).toBe(true)
    for (const field of ['registeredName', 'tin', 'address', 'permitNo'] as const) expect(isMerchantComplete({ ...SAMPLE_MERCHANT, [field]: '  ' })).toBe(false)
    expect(isMerchantComplete({ ...SAMPLE_MERCHANT, branchCode: '12' })).toBe(false)
    expect(isMerchantComplete({ ...SAMPLE_MERCHANT, footerText: '' })).toBe(true)
  })
})

describe('sample invoices', () => {
  it('gives an order the same number every time', async () => {
    const first = await sampleIssueInvoice('a', fast)
    expect(first.invoiceNo).toBe('SI-0000001')
    expect((await sampleIssueInvoice('a', fast)).invoiceNo).toBe('SI-0000001')
    expect(invoiceNoFor('a')).toBe('SI-0000001')
  })

  it('numbers different orders consecutively, without gaps', async () => {
    await sampleIssueInvoice('a', fast)
    await sampleIssueInvoice('b', fast)
    await sampleIssueInvoice('a', fast)
    expect((await sampleIssueInvoice('c', fast)).invoiceNo).toBe('SI-0000003')
  })

  it('counts exports: the first is the original (0), each later one a reprint', async () => {
    await sampleIssueInvoice('a', fast)
    expect(await sampleExportInvoice('a', fast)).toEqual({ invoiceNo: 'SI-0000001', reprintCount: 0 })
    expect((await sampleExportInvoice('a', fast)).reprintCount).toBe(1)
    expect((await sampleExportInvoice('a', fast)).reprintCount).toBe(2)
    expect((await sampleIssueInvoice('a', fast)).exportCount).toBe(3)
  })

  it('cannot export an invoice that was never issued', async () => {
    await expect(sampleExportInvoice('nope', fast)).rejects.toMatchObject({ kind: 'not-found' })
  })

  it('previewing (the bundle and the lookup) consumes no numbers', async () => {
    for (const id of ['a', 'b', 'c']) {
      const bundle = await sampleInvoiceBundle(id, fast)
      expect(bundle.profile.sample).toBe(true)
      expect(bundle.invoice).toBeNull()
      expect(await sampleLookupInvoice(id, fast)).toBeNull()
    }
    expect(invoiceNoFor('a')).toBeUndefined()
    expect((await sampleIssueInvoice('a', fast)).invoiceNo).toBe('SI-0000001')
    expect((await sampleIssueInvoice('b', fast)).invoiceNo).toBe('SI-0000002')
  })

  it('shows the issued record in the bundle afterwards', async () => {
    await sampleIssueInvoice('a', fast)
    await sampleExportInvoice('a', fast)
    expect((await sampleInvoiceBundle('a', fast)).invoice).toEqual({ invoiceNo: 'SI-0000001', exportCount: 1 })
  })

  it('makes a draft and consumes no number while the merchant profile is incomplete', async () => {
    setSampleMerchant({ permitNo: '' })
    const draft = await sampleInvoiceBundle('a', fast)
    expect(draft.invoice).toBeNull()
    expect(invoiceNoFor('a')).toBeUndefined()

    setSampleMerchant({})
    expect((await sampleIssueInvoice('b', fast)).invoiceNo).toBe('SI-0000001')
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(sampleIssueInvoice('a', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(invoiceNoFor('a')).toBeUndefined()
  })
})
