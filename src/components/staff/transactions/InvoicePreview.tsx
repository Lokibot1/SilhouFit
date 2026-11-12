import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { useSection } from '../../../hooks/useSection'
import type { InvoiceBundle, InvoiceRecord } from '../../../service/fetchInvoice'
import type { TransactionDetail, TransactionListItem } from '../../../service/fetchTransactions'
import { sampleExportInvoice, sampleInvoiceBundle, sampleIssueInvoice } from '../../../service/sampleInvoices'
import type { RequestOptions } from '../../../service/simulateRequest'
import { downloadFile } from '../../../utils/downloadFile'
import { buildInvoiceJson } from '../../../utils/invoiceJson'
import { buildInvoice } from '../../../utils/invoiceTax'
import { ChevronLeftIcon, SpinnerIcon } from '../../form/icons'
import { useToast } from '../../toast/useToast'
import { PRIMARY_BUTTON_SM, SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { errorKind, SectionBody } from '../StaffSection'
import { InvoiceSheet } from './InvoiceSheet'

const FORMATS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'json', label: 'JSON' },
] as const
type Format = (typeof FORMATS)[number]['value']

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

/** Stands in for the invoice while it is issued: a sheet's header, details, items and totals. */
function InvoiceSkeleton() {
  return (
    <div role="status" aria-label="Loading invoice" className="animate-pulse rounded-xl border border-line p-4 sm:p-6">
      <Bar className="h-5 w-2/3" />
      <Bar className="mt-2 h-4 w-1/2" />
      <Bar className="mt-1 h-4 w-3/4" />
      <div className="mt-4 grid gap-2 border-t border-line pt-3">
        {[0, 1, 2, 3].map((n) => (
          <Bar key={n} className="h-4 w-full" />
        ))}
      </div>
      <div className="mt-4 grid gap-2">
        {[0, 1, 2].map((n) => (
          <Bar key={n} className="h-10 w-full" />
        ))}
      </div>
      <Bar className="mt-4 ml-auto h-24 w-48" />
    </div>
  )
}

/** PDF | JSON as one radio group. Arrow keys move focus and select, as radios do. */
function Formats({ value, onChange }: { value: Format; onChange: (format: Format) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  function onKeyDown(event: KeyboardEvent, index: number) {
    const target = { ArrowLeft: index - 1, ArrowUp: index - 1, ArrowRight: index + 1, ArrowDown: index + 1, Home: 0, End: FORMATS.length - 1 }[event.key]
    if (target === undefined) return
    event.preventDefault()
    const next = (target + FORMATS.length) % FORMATS.length
    buttons.current[next]?.focus()
    onChange(FORMATS[next].value)
  }
  return (
    <div role="radiogroup" aria-label="File format" className="flex h-9 w-full shrink-0 overflow-hidden sm:w-36 rounded-xl ring-1 ring-line-strong ring-inset pointer-coarse:h-11">
      {FORMATS.map(({ value: format, label }, index) => {
        const checked = value === format
        return (
          <button
            key={format}
            ref={(button) => {
              buttons.current[index] = button
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(format)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`font-ui min-w-16 flex-1 cursor-pointer border-l border-line px-3 text-sm transition-colors first:border-l-0 focus-visible:-outline-offset-2 motion-reduce:transition-none ${
              checked ? 'bg-fg/10 font-semibold text-fg shadow-[inset_0_-2px_0_0_currentColor]' : 'font-medium text-fg-muted hover:bg-fg/5'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

interface InvoicePreviewProps {
  transaction: TransactionListItem
  detail: TransactionDetail
  onBack: () => void
}

/** The invoice for one order: a preview of the sheet, and a sticky footer that downloads it as PDF or JSON or prints it. */
export function InvoicePreview({ transaction, detail, onBack }: InvoicePreviewProps) {
  const toast = useToast()
  const id = transaction.id
  // shortcut: seller details and invoice numbers are placeholders kept in this browser; swap to fetchInvoiceBundle/issueInvoice/exportInvoice (src/service/fetchInvoice.ts) when the backend ships /merchant/profile and /orders/:id/invoice
  const load = useCallback((options: RequestOptions) => sampleInvoiceBundle(id, options), [id])
  const section = useSection(load)
  const [format, setFormat] = useState<Format>('pdf')
  const [pending, setPending] = useState(false)
  // The invoice's record once this view has issued or exported it. Until then the number is not assigned.
  const [issued, setIssued] = useState<InvoiceRecord | null>(null)
  // How many times in a row the PDF chunk failed to load. The browser caches a failed import, so a second Retry cannot succeed.
  const chunkFailures = useRef(0)
  const backRef = useRef<HTMLButtonElement>(null)
  useEffect(() => backRef.current?.focus(), [])

  const bundle: InvoiceBundle | null = section.state.status === 'success' ? section.state.data : null
  const record = issued ?? bundle?.invoice ?? null
  const reprintCount = record?.exportCount ?? 0
  const invoice = useMemo(() => (bundle ? buildInvoice(detail, bundle.profile, record, reprintCount) : null), [bundle, detail, record, reprintCount])
  const draft = invoice?.status === 'draft'

  async function run(kind: 'download' | 'print') {
    if (!bundle || draft || pending) return
    setPending(true)
    let failedAt: 'chunk' | 'work' = 'work'
    try {
      let renderInvoicePdf: typeof import('../../../utils/invoicePdf').renderInvoicePdf | null = null
      if (kind === 'download' && format === 'pdf') {
        failedAt = 'chunk'
        ;({ renderInvoicePdf } = await import('../../../utils/invoicePdf'))
        failedAt = 'work'
        chunkFailures.current = 0
      }
      // The number is assigned here, on the first real export (idempotent afterwards). The file is made before the export is recorded, so a failure there counts no copy.
      const assigned = await sampleIssueInvoice(id)
      // Print reads the sheet, so it must show the number before the browser prints.
      flushSync(() => setIssued(assigned))
      const output = buildInvoice(detail, bundle.profile, assigned, assigned.exportCount)
      let file: { blob: Blob; name: string } | null = null
      let replaced: string[] = []
      if (renderInvoicePdf) {
        const pdf = await renderInvoicePdf(output)
        file = { blob: pdf.blob, name: `${assigned.invoiceNo}.pdf` }
        replaced = pdf.replaced
      } else if (kind === 'download') {
        file = { blob: new Blob([JSON.stringify(buildInvoiceJson(output), null, 2)], { type: 'application/json' }), name: `${assigned.invoiceNo}.json` }
      }
      const recorded = await sampleExportInvoice(id)
      if (file) downloadFile(file.blob, file.name)
      else window.print()
      setIssued({ invoiceNo: assigned.invoiceNo, exportCount: recorded.reprintCount + 1 })
      if (file) {
        const done = `Invoice ${assigned.invoiceNo} downloaded as ${file.name}.`
        toast.show(
          replaced.length
            ? { kind: 'info', message: `${done} Some characters in ${replaced.join(', ')} can't be shown in the PDF and appear as ?. JSON and print keep the full text.` }
            : { kind: 'success', message: done },
        )
      }
    } catch (error) {
      const verb = kind === 'print' ? 'print' : 'download'
      if (failedAt === 'chunk') chunkFailures.current += 1
      const reload = chunkFailures.current >= 2
      const network = errorKind(error) === 'network'
      toast.show({
        kind: 'error',
        message: `Couldn't ${verb} the invoice for ${transaction.orderNo}. ${
          reload
            ? 'The PDF tool failed to load twice, and the browser will not try again until the page reloads. Reload the page, or download JSON instead.'
            : failedAt === 'chunk'
              ? 'The PDF tool failed to load. Check your connection, then retry.'
              : network
                ? 'The connection dropped before the copy could be recorded. Check your connection, then retry.'
                : 'The file could not be made. Retry, or reload the page if it keeps failing.'
        }`,
        action: reload ? { label: 'Reload page', onClick: () => window.location.reload() } : { label: 'Retry', onClick: () => void run(kind) },
      })
    } finally {
      setPending(false)
    }
  }

  const disabled = !invoice || draft || pending
  return (
    <div>
      <button
        ref={backRef}
        type="button"
        onClick={onBack}
        className="font-ui -ml-2 flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-fg-muted hover:text-fg"
      >
        <ChevronLeftIcon />
        Back to order
      </button>
      <p role="status" className="sr-only">
        {invoice ? (draft ? 'Draft invoice. The merchant details are incomplete.' : (invoice.invoiceNo ? `Invoice ${invoice.invoiceNo} ready` : 'Invoice ready. Its number is assigned on first download or print.')) : ''}
      </p>
      <div className="mt-1">
        <SectionBody section={section} what="the invoice" skeleton={<InvoiceSkeleton />}>
          {() =>
            draft ? (
              <p className="mb-3 text-sm text-fg-muted">
                This invoice is a draft. Fill in the merchant&apos;s registered name, TIN, branch code, address and Permit to Use number to issue it. No invoice number is used until then.
              </p>
            ) : null
          }
        </SectionBody>
        {invoice && record && reprintCount > 0 && (
          <p className="mb-3 text-sm text-fg-muted">
            Previously issued as {record.invoiceNo} · next copy will be stamped DUPLICATE (reprint {reprintCount})
          </p>
        )}
        {invoice && <InvoiceSheet invoice={invoice} />}
      </div>
      <div className="sticky bottom-0 -mx-5 mt-4 flex flex-wrap items-center gap-3 border-t border-line bg-canvas px-5 py-3 sm:-mx-8 sm:px-8">
        <Formats value={format} onChange={setFormat} />
        <div className="flex min-w-0 flex-1 basis-full gap-3 sm:basis-44">
          <button type="button" disabled={disabled} onClick={() => void run('download')} className={`${PRIMARY_BUTTON_SM} min-w-0 flex-1 whitespace-nowrap`}>
            {pending && <SpinnerIcon />}
            {pending ? 'Preparing…' : `Download ${format.toUpperCase()}`}
          </button>
          <button type="button" disabled={disabled} onClick={() => void run('print')} className={`${SECONDARY_BUTTON_SM} flex-none px-5`}>
            Print
          </button>
        </div>
      </div>
    </div>
  )
}
