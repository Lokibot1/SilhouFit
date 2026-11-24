import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { useSection } from '../../../hooks/useSection'
import { explainFailure } from '../../../service/adminOrdersApi'
import { redactPayload } from '../../../service/adminTransactionsApi'
import { getRefund, REFUND_REASON_LABELS, MAX_AUTO_ATTEMPTS, REFUND_STATUS_LABELS, REFUND_TRIGGER_LABELS, resolveRefundManually, retryRefund, syncRefund, type Refund, type RefundDetail, type RefundStatus } from '../../../service/refunds'
import type { RequestOptions } from '../../../service/simulateRequest'
import { formatMessageTime, formatPeso, formatPlacedAt } from '../../../utils/format'
import { REFUND_LIMITS, sanitizeText, validateResolution } from '../../../utils/refundValidation'
import { providerLabel } from '../../../utils/transactionQuery'
import { AlertIcon, CheckIcon, ChevronDownIcon, RestoreIcon, SpinnerIcon, XIcon } from '../../form/icons'
import { Field, FIELD_INPUT } from '../../staff/inventory/FormField'
import { CopyId } from '../../staff/inventory/ProductDetail'
import { EmptyNote, SectionBody } from '../../staff/StaffSection'
import { useToast } from '../../toast/useToast'
import { SECONDARY_BUTTON, SECONDARY_BUTTON_SM, UPDATE_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { RefundStatusBadge } from './RefundsTable'

type Action = 'retry' | 'sync' | 'resolve'
type Touched = { manualReference?: boolean; notes?: boolean }

const FORM_ID = 'refund-resolve-form'

const Bar = ({ className }: { className: string }) => <div className={`rounded-xl bg-line ${className}`} />

/** What the status means, in plain words: a refund is made by the API itself, and an admin steps in only where it says so. */
function explain(refund: Refund, canAct: boolean) {
  const spent = refund.attempts >= MAX_AUTO_ATTEMPTS
  const text: Record<RefundStatus, string> = {
    REQUESTED: 'Waiting to be sent to the gateway.',
    PROCESSING: `Sent to the gateway and settling.${canAct ? ' Use Check with gateway to see where it stands.' : ''}`,
    FAILED: spent ? 'The gateway did not take it, and the automatic attempts are used up.' : 'The gateway did not take it. It is retried automatically.',
    REQUIRES_MANUAL_ACTION: 'Needs an admin: the automatic attempts could not finish it.',
    SUCCEEDED: 'The money was sent back to the customer.',
    CANCELLED: 'This refund was cancelled, so no money was sent.',
  }
  return text[refund.status]
}

/** The refund as the list row has it, shown at once while the detail loads. */
function Header({ refund, canAct }: { refund: Refund; canAct: boolean }) {
  return (
    <div>
      <p className="text-base font-semibold text-fg">{refund.customerName}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="font-mono text-2xl font-semibold text-fg tabular-nums">{formatPeso(refund.amount)}</p>
        <RefundStatusBadge status={refund.status} />
      </div>
      <p className="mt-2 text-base text-fg-muted md:text-sm">{explain(refund, canAct)}</p>
      {refund.status === 'FAILED' && refund.nextRetryAt && (
        <p className="mt-1 text-base text-fg md:text-sm">
          Next automatic retry at <time dateTime={refund.nextRetryAt}>{formatMessageTime(refund.nextRetryAt)}</time>
        </p>
      )}
    </div>
  )
}

function Fact({ label, number, children }: { label: string; number?: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 font-medium text-fg-muted">{label}</dt>
      <dd className={`min-w-0 flex-1 break-words text-fg ${number ? 'text-right tabular-nums' : ''}`}>{children}</dd>
    </div>
  )
}

const When = ({ iso }: { iso: string }) => <time dateTime={iso}>{formatPlacedAt(iso)}</time>

/** Same blocks as the loaded detail, at about the same heights, so nothing jumps when it arrives. */
function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading refund details" className="grid animate-pulse gap-6">
      <Bar className="h-96 w-full" />
      <Bar className="h-11 w-full" />
    </div>
  )
}

/** The gateway's own answer. Collapsed, shown as plain text (never markup), with secret-looking values hidden. */
function GatewayResponse({ response }: { response: Record<string, unknown> | null }) {
  return (
    <details className="group rounded-xl border border-line">
      <summary className="font-ui flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-base font-semibold text-fg md:text-sm [&::-webkit-details-marker]:hidden">
        Gateway response (JSON)
        <ChevronDownIcon className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line p-3">
        {response === null ? <EmptyNote>No response recorded</EmptyNote> : <pre className="max-h-80 overflow-auto font-mono text-xs break-all whitespace-pre-wrap text-fg">{JSON.stringify(redactPayload(response), null, 2)}</pre>}
      </div>
    </details>
  )
}

function Detail({ refund }: { refund: RefundDetail }) {
  return (
    <div className="grid gap-6">
      {(refund.status === 'FAILED' || refund.status === 'REQUIRES_MANUAL_ACTION') && (refund.failureCode || refund.failureMessage) && (
        <div className="flex items-start gap-3 rounded-xl border border-danger p-3">
          <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-base font-semibold text-fg md:text-sm">Why it failed</p>
            {refund.failureMessage && <p className="mt-1 text-base break-words text-fg-muted md:text-sm">{refund.failureMessage}</p>}
            {refund.failureCode && <p className="mt-1 font-mono text-xs break-all text-fg-muted">{refund.failureCode}</p>}
          </div>
        </div>
      )}
      <dl className="grid gap-3 text-base md:text-sm">
        <Fact label="Order">
          {refund.orderNumber ? (
            <Link to={`/admin/transactions?q=${encodeURIComponent(refund.orderNumber)}`} className="inline-flex min-h-11 items-center font-mono underline underline-offset-2 hover:text-chrome-strong">
              {refund.orderNumber}
            </Link>
          ) : (
            <span className="text-fg-muted">No order</span>
          )}
        </Fact>
        <Fact label="Customer">
          {refund.customerName}
          {refund.customerEmail && <span className="block break-all text-fg-muted">{refund.customerEmail}</span>}
        </Fact>
        <Fact label="Reason">
          <span className="font-semibold">{REFUND_REASON_LABELS[refund.reason]}</span>
          {refund.reasonNotes && <span className="mt-1 block text-fg-muted">{refund.reasonNotes}</span>}
        </Fact>
        <Fact label="Triggered by">{REFUND_TRIGGER_LABELS[refund.trigger]}</Fact>
        <Fact label="Started by">{refund.startedBy ?? 'System'}</Fact>
        <Fact label="Created">
          <When iso={refund.createdAt} />
        </Fact>
        <Fact label="Attempts" number>
          {refund.attempts} of {MAX_AUTO_ATTEMPTS}
        </Fact>
        <Fact label="Gateway">{providerLabel(refund.provider)}</Fact>
        <Fact label="Payment ref">
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0 font-mono break-all">{refund.paymentReference}</span>
            <CopyId id={refund.paymentReference} what="payment reference" />
          </span>
        </Fact>
        <Fact label="Refund ref">
          {refund.refundReference ? (
            <span className="flex items-center justify-between gap-2">
              <span className="min-w-0 font-mono break-all">{refund.refundReference}</span>
              <CopyId id={refund.refundReference} what="refund reference" />
            </span>
          ) : (
            <span className="text-fg-muted">Not sent to the gateway yet</span>
          )}
        </Fact>
        {refund.manualReference && (
          <Fact label="Manual ref">
            <span className="font-mono break-all">{refund.manualReference}</span>
          </Fact>
        )}
        {refund.resolvedBy && <Fact label="Resolved by">{refund.resolvedBy}</Fact>}
      </dl>
      <GatewayResponse response={refund.gatewayResponse} />
    </div>
  )
}

const NEXT_STEP = {
  FAILED: 'You can retry the refund once the cause is fixed.',
  REQUIRES_MANUAL_ACTION: 'This refund needs manual handling. Check the gateway, then retry if the cause is fixed.',
} as const

const FAILED_TITLE: Record<Action, string> = {
  retry: "The gateway didn't accept the retry.",
  sync: 'The gateway reports the refund did not go through.',
  resolve: "The refund wasn't marked as refunded.",
}
const ERROR_TITLE: Record<Action, string> = {
  retry: "We couldn't retry the refund.",
  sync: "We couldn't check with the gateway.",
  resolve: "We couldn't mark the refund as refunded.",
}

interface RefundDetailSheetProps {
  /** The list row to show first. Give the sheet a new `key` for every open so it loads the detail again. */
  refund: Refund
  open: boolean
  onClose: () => void
  /** The refund no longer exists on the server (a 404): the list should load again. */
  onGone: () => void
}

/** One refund: its facts from the API, and for an admin Retry refund, Check with gateway and Mark as refunded. */
export function RefundDetailSheet({ refund: row, open, onClose, onGone }: RefundDetailSheetProps) {
  const toast = useToast()
  const role = useCurrentUser()?.role
  const canAct = role === 'admin' || role === 'superadmin'
  const fetcher = useCallback((options: RequestOptions) => getRefund(row.id, options), [row.id])
  const section = useSection(fetcher)
  const [resolving, setResolving] = useState(false)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [touched, setTouched] = useState<Touched>({})
  const [confirming, setConfirming] = useState<'retry' | 'resolve' | null>(null)
  const [pending, setPending] = useState<Action | null>(null)
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null)
  const inFlight = useRef(false)
  // The ids to focus once the next step is on screen, first one found (the control that held focus may be gone).
  const focusNext = useRef<string[]>([])
  useEffect(() => {
    const id = focusNext.current.find((candidate) => document.getElementById(candidate))
    // A finished refund has no button left, so focus stays inside the sheet instead of dropping to the page.
    if (focusNext.current.length) (id ? document.getElementById(id) : document.querySelector<HTMLElement>('[role="dialog"]'))?.focus()
    focusNext.current = []
  })

  const loaded = section.state.status === 'success' ? section.state.data : null
  const shown = loaded ?? row
  // A refund that has not finished and is not with the gateway: the three states an admin can still act on.
  const unfinished = loaded !== null && (shown.status === 'REQUESTED' || shown.status === 'FAILED' || shown.status === 'REQUIRES_MANUAL_ACTION')
  const canSync = loaded !== null && shown.refundReference !== null && shown.status !== 'SUCCEEDED' && shown.status !== 'CANCELLED'
  const orderName = shown.orderNumber ?? 'this order'
  const errors = validateResolution({ manualReference: reference, notes })
  const shownErrors = { manualReference: touched.manualReference ? errors.manualReference : undefined, notes: touched.notes ? errors.notes : undefined }

  async function run(action: Action) {
    if (inFlight.current) return
    inFlight.current = true
    setPending(action)
    setNotice(null)
    try {
      // The API answers 200 even when the gateway refused, so the returned status says what happened.
      const result = await (action === 'retry' ? retryRefund(row.id) : action === 'sync' ? syncRefund(row.id) : resolveRefundManually(row.id, { manualReference: reference.trim(), notes: notes.trim() || undefined }))
      section.swap(result)
      if (action === 'resolve') {
        setResolving(false)
        setReference('')
        setNotes('')
        setTouched({})
      }
      if (result.status === 'SUCCEEDED') {
        toast.show({ kind: 'success', message: action === 'resolve' ? `Refund for order ${orderName} marked as refunded.` : `Refund for order ${orderName} is complete: ${formatPeso(result.amount)}` })
      } else if (result.status === 'FAILED' || result.status === 'REQUIRES_MANUAL_ACTION') {
        setNotice({ title: FAILED_TITLE[action], message: `${result.failureMessage ?? 'The gateway gave no reason.'} ${NEXT_STEP[result.status]}` })
      } else {
        toast.show({ kind: 'info', message: result.status === 'PROCESSING' ? 'Sent to the gateway; it will update when it settles.' : `The refund is now ${REFUND_STATUS_LABELS[result.status].toLowerCase()}.` })
      }
    } catch (error) {
      if ((error as { kind?: string }).kind === 'not-found') {
        onGone()
        return
      }
      setNotice({ title: ERROR_TITLE[action], message: explainFailure(error) })
    } finally {
      // Set once the request is over: the render that starts it would use up the ids before the outcome is on screen.
      focusNext.current = ['refund-outcome', 'refund-retry-open', 'refund-sync-open']
      setConfirming(null)
      inFlight.current = false
      setPending(null)
    }
  }

  const askRetry = () => {
    setNotice(null)
    setConfirming('retry')
    focusNext.current = ['refund-confirm-cancel']
  }
  const openResolve = () => {
    setNotice(null)
    setResolving(true)
    focusNext.current = ['refund-reference']
  }
  const reviewResolve = (event: FormEvent) => {
    event.preventDefault()
    setTouched({ manualReference: true, notes: true })
    const first = errors.manualReference ? 'refund-reference' : errors.notes ? 'refund-notes' : null
    if (first) {
      document.getElementById(first)?.focus()
      return
    }
    setConfirming('resolve')
    focusNext.current = ['refund-confirm-cancel']
  }
  const closeOne = () => {
    if (pending) return
    if (confirming) {
      focusNext.current = [confirming === 'retry' ? 'refund-retry-open' : 'refund-resolve-review']
      setConfirming(null)
    } else if (resolving) {
      setResolving(false)
      focusNext.current = ['refund-resolve-open']
    } else onClose()
  }

  let footer: ReactNode
  if (confirming) {
    footer = (
      <div key="confirm" className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button id="refund-confirm-cancel" type="button" onClick={closeOne} disabled={pending !== null} className={`${SECONDARY_BUTTON} disabled:opacity-60`}>
          <XIcon />
          Cancel
        </button>
        <button id="refund-confirm-go" type="button" onClick={() => void run(confirming)} disabled={pending !== null} aria-busy={pending === confirming} className={UPDATE_BUTTON}>
          {pending === confirming ? <SpinnerIcon /> : confirming === 'retry' ? <RestoreIcon /> : <CheckIcon />}
          {confirming === 'retry' ? 'Retry refund' : 'Mark as refunded'}
        </button>
      </div>
    )
  } else if (resolving) {
    footer = (
      <div key="form" className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={closeOne} className={SECONDARY_BUTTON}>
          <XIcon />
          Cancel
        </button>
        <button id="refund-resolve-review" type="submit" form={FORM_ID} className={UPDATE_BUTTON}>
          <CheckIcon />
          Review
        </button>
      </div>
    )
  } else if (canAct && (unfinished || canSync)) {
    footer = (
      <div key="actions" className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {canSync && (
          <button id="refund-sync-open" type="button" onClick={() => void run('sync')} disabled={pending !== null} aria-busy={pending === 'sync'} className={`${SECONDARY_BUTTON} disabled:cursor-progress disabled:opacity-70`}>
            {pending === 'sync' ? <SpinnerIcon /> : <RestoreIcon />}
            Check with gateway
          </button>
        )}
        {unfinished && (
          <>
            <button id="refund-resolve-open" type="button" onClick={openResolve} disabled={pending !== null} className={UPDATE_BUTTON}>
              <CheckIcon />
              Mark as refunded
            </button>
            <button id="refund-retry-open" type="button" onClick={askRetry} disabled={pending !== null} className={UPDATE_BUTTON}>
              <RestoreIcon />
              Retry refund
            </button>
          </>
        )}
      </div>
    )
  }

  const title = confirming === 'retry' ? `Retry refund for ${orderName}?` : confirming === 'resolve' ? `Mark refund for ${orderName} as refunded?` : (shown.orderNumber ?? 'Refund')

  return (
    <Modal variant="sheet" open={open} onClose={closeOne} title={title} footer={footer}>
      {confirming ? (
        <div className="pb-5">
          <p className="text-base font-semibold text-fg">Are you sure?</p>
          <p className="mt-2 text-base text-fg-muted">
            {confirming === 'retry'
              ? `This asks the gateway to send ${formatPeso(shown.amount)} to ${shown.customerName} again for order ${orderName}. The result shows here once the gateway answers.`
              : "Use this only after the money was returned outside SilhouFit. This can't be undone."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 pb-5">
          <Header refund={shown} canAct={canAct} />
          {notice && (
            <div id="refund-outcome" tabIndex={-1} role="alert" className="flex items-start gap-3 rounded-xl border border-danger p-3 outline-none">
              <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0">
                <p className="text-base font-semibold text-fg md:text-sm">{notice.title}</p>
                <p className="mt-1 text-base break-words text-fg-muted md:text-sm">{notice.message}</p>
              </div>
            </div>
          )}
          {resolving && (
            <form id={FORM_ID} noValidate onSubmit={reviewResolve} className="grid gap-4">
              <Field id="refund-reference" label="Reference" count={{ value: reference.length, max: REFUND_LIMITS.referenceMax }} error={shownErrors.manualReference} hint="The reference of the payment that returned the money, such as a bank transfer number.">
                <input
                  id="refund-reference"
                  type="text"
                  value={reference}
                  onChange={(event) => setReference(sanitizeText(event.target.value, REFUND_LIMITS.referenceMax))}
                  onBlur={() => setTouched((old) => ({ ...old, manualReference: true }))}
                  aria-invalid={Boolean(shownErrors.manualReference)}
                  aria-describedby={shownErrors.manualReference ? 'refund-reference-error' : 'refund-reference-hint'}
                  autoComplete="off"
                  spellCheck={false}
                  className={FIELD_INPUT}
                />
              </Field>
              <Field id="refund-notes" label="Notes" optional count={{ value: notes.length, max: REFUND_LIMITS.notesMax }} error={shownErrors.notes}>
                <textarea
                  id="refund-notes"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(sanitizeText(event.target.value, REFUND_LIMITS.notesMax))}
                  onBlur={() => setTouched((old) => ({ ...old, notes: true }))}
                  aria-invalid={Boolean(shownErrors.notes)}
                  aria-describedby={shownErrors.notes ? 'refund-notes-error' : undefined}
                  autoComplete="off"
                  className={`${FIELD_INPUT} resize-none`}
                />
              </Field>
            </form>
          )}
          {section.state.status === 'error' && section.state.kind === 'not-found' ? (
            <div role="alert">
              <p className="text-base font-semibold text-fg md:text-sm">This refund no longer exists.</p>
              <p className="mt-1 text-base text-fg-muted md:text-sm">It may have been removed. Close this panel and refresh the list.</p>
              <button type="button" onClick={onGone} className={`${SECONDARY_BUTTON_SM} mt-4`}>
                <RestoreIcon />
                Refresh the list
              </button>
            </div>
          ) : (
            <SectionBody section={section} what="the refund details" skeleton={<DetailSkeleton />}>
              {(data) => <Detail refund={data} />}
            </SectionBody>
          )}
        </div>
      )}
    </Modal>
  )
}
