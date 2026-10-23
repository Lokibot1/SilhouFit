import type { ReactNode } from 'react'
import { formatPeso, formatPlacedAt } from '../../../utils/format'
import { INVOICE_NOTICE, PAYMENT_LABELS, RETURN_NOTICE, type Invoice, type VatClass } from '../../../utils/invoiceTax'

const money = (centavos: number) => formatPeso(centavos / 100)
const VAT_TAG: Record<VatClass, string> = { vatable: '', exempt: 'VAT-exempt', zero: 'Zero-rated' }

// A printed page: always black on white, whatever the app's theme. `.invoice-sheet` is what the print stylesheet keeps.
const ROW = 'grid grid-cols-[1fr_auto] gap-x-3 border-b border-neutral-300 py-2 @lg:grid-cols-[2.5rem_1fr_6.5rem_6.5rem]'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-x-2">
      <dt className="font-semibold">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

/** The invoice as the buyer receives it. This one component is the preview, and the print stylesheet prints it. */
export function InvoiceSheet({ invoice }: { invoice: Invoice }) {
  const { seller, buyer, totals } = invoice
  const draft = invoice.status === 'draft'
  const totalRows: [string, number][] = [
    ['VATable Sales', totals.vatableSales],
    ['VAT-Exempt Sales', totals.vatExempt],
    ['Zero-Rated Sales', totals.zeroRated],
    ['VAT (12%)', totals.vatAmount],
  ]
  return (
    <article
      aria-label={draft ? 'Draft sales invoice' : invoice.invoiceNo ? `Sales invoice ${invoice.invoiceNo}` : 'Sales invoice, number not yet assigned'}
      className="invoice-sheet @container relative overflow-hidden rounded-xl border border-neutral-300 bg-white p-4 text-sm leading-snug text-black wrap-break-word sm:p-6"
    >
      {draft && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="-rotate-35 text-center text-xl leading-tight font-bold whitespace-pre-line text-red-700/30 @md:text-3xl @md:whitespace-nowrap">
            {'DRAFT —\nNOT A VALID INVOICE'}
          </p>
        </div>
      )}
      {invoice.reprintCount > 0 && (
        <p className="mb-3 inline-block border-2 border-black px-2 py-0.5 text-xs font-bold">DUPLICATE COPY (reprint {invoice.reprintCount})</p>
      )}
      {invoice.returned && (
        <div className="mb-3 border-2 border-black p-2">
          <p className="text-sm font-bold">ORDER RETURNED — REFUNDED IN FULL on {formatPlacedAt(invoice.returned.returnedAt)}</p>
          <p className="text-xs text-neutral-700">{RETURN_NOTICE}</p>
        </div>
      )}
      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <p className="text-lg font-bold whitespace-nowrap">SALES INVOICE</p>
          {invoice.invoiceNo || draft ? (
            <p className="font-semibold whitespace-nowrap tabular-nums">{draft ? 'DRAFT' : `No. ${invoice.invoiceNo}`}</p>
          ) : (
            <p className="text-xs text-neutral-700">Invoice No. assigned on first download or print</p>
          )}
        </div>
        <h3 className="mt-2 text-base font-bold">{seller.registeredName}</h3>
        <p>
          {seller.vatRegistered ? 'VAT Reg.' : 'NON-VAT Reg.'} TIN <span className="tabular-nums">{seller.tin}-{seller.branchCode}</span>
        </p>
        <p>{seller.address}</p>
        <p>Permit to Use No. {seller.permitNo}</p>
        {seller.sample && <p className="mt-1 inline-block rounded border border-neutral-500 px-1.5 text-xs font-semibold text-neutral-700">Sample merchant profile</p>}
      </header>

      <dl className="mt-3 grid gap-y-0.5 border-t border-neutral-300 pt-3">
        <Field label="Date and time">
          <time dateTime={invoice.placedAt}>{formatPlacedAt(invoice.placedAt)}</time>
        </Field>
        <Field label="Order">{invoice.orderNo}</Field>
        <Field label="Payment">{invoice.paymentMethod ? PAYMENT_LABELS[invoice.paymentMethod] : 'Not recorded'}</Field>
        <Field label="Sold to">{buyer ? buyer.name : 'Walk-in customer'}</Field>
        {buyer && (
          <>
            <Field label="Buyer TIN">
              <span className="tabular-nums">{buyer.tin}</span>
            </Field>
            <Field label="Buyer address">{buyer.address}</Field>
          </>
        )}
      </dl>

      <div role="table" aria-label="Items" className="mt-3">
        <div role="row" className={`${ROW} border-y-2 border-black py-1 font-semibold`}>
          <span role="columnheader" className="hidden @lg:block @lg:text-right">
            Qty
          </span>
          <span role="columnheader">Description</span>
          <span role="columnheader" className="hidden @lg:block @lg:text-right">
            Unit price
          </span>
          <span role="columnheader" className="text-right">
            Amount
          </span>
        </div>
        {invoice.lines.map((line, index) => (
          <div role="row" key={index} className={ROW}>
            <span role="cell" className="hidden text-right tabular-nums @lg:block">
              {line.units}
            </span>
            <span role="cell" className="min-w-0">
              {line.description}
              {seller.vatRegistered && line.vatClass !== 'vatable' && <span className="text-neutral-700"> ({VAT_TAG[line.vatClass]})</span>}
              <span className="block text-neutral-700 tabular-nums @lg:hidden">
                {line.units} × {money(line.unitPrice)}
              </span>
            </span>
            <span role="cell" className="hidden text-right tabular-nums @lg:block">
              {money(line.unitPrice)}
            </span>
            <span role="cell" className="text-right whitespace-nowrap tabular-nums">
              {money(line.amount)}
            </span>
          </div>
        ))}
      </div>

      <dl className="mt-3 ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
        {seller.vatRegistered &&
          totalRows.map(([label, amount]) => (
            <div key={label} className="col-span-2 grid grid-cols-subgrid">
              <dt>{label}</dt>
              <dd className="text-right tabular-nums">{money(amount)}</dd>
            </div>
          ))}
        <div className="col-span-2 grid grid-cols-subgrid border-t-2 border-black pt-1 text-base font-bold">
          <dt>Total Amount Due</dt>
          <dd className="text-right tabular-nums">{money(totals.totalDue)}</dd>
        </div>
      </dl>
      {seller.vatRegistered && <p className="mt-1 text-right text-xs text-neutral-700">Prices include 12% VAT.</p>}

      {seller.footerText.trim() && <p className="mt-4">{seller.footerText}</p>}
      <p className="mt-4 border-t border-neutral-300 pt-2 text-xs text-neutral-700">{INVOICE_NOTICE}</p>
    </article>
  )
}
