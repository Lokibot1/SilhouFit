import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { approveRefund, REFUND_CHANNEL_LABELS, REFUND_REASON_LABELS, rejectRefund, type RefundDecision, type RefundRequest } from '../../../service/refunds'
import { filterPriceInput, formatPeso, formatPlacedAt } from '../../../utils/format'
import { REFUND_LIMITS, sanitizeText, validateApproval, validateRejection } from '../../../utils/refundValidation'
import { AlertIcon, SpinnerIcon } from '../../form/icons'
import { Field, FIELD_INPUT } from '../../staff/inventory/FormField'
import { useToast } from '../../toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'
import { RefundStatusBadge } from './RefundsTable'

/** Placeholders sit clearly dimmer than typed text yet stay above 4.5:1 on the page colour in both themes. */
const FORM_ID = 'refund-form'
const TEXTAREA = `${FIELD_INPUT} resize-none`

type Mode = 'view' | 'approve' | 'reject'
type FormField = 'amount' | 'note' | 'reason'

const LINE_ROW = 'h-[4.5rem]'
const TH = 'sticky top-0 z-10 h-11 border-b border-line bg-canvas-sub px-3 text-left font-semibold text-fg'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  )
}

function Details({ request }: { request: RefundRequest }) {
  return (
    <dl className="grid gap-2 rounded-xl border border-line bg-canvas-sub p-3 text-sm">
      <Fact label="Customer">{request.customerName}</Fact>
      <Fact label="Order">
        <Link to={`/admin/transactions?q=${encodeURIComponent(request.orderNo)}`} className="inline-flex min-h-11 items-center font-mono underline underline-offset-2 hover:text-chrome-strong">
          {request.orderNo}
        </Link>
      </Fact>
      <Fact label="Order date">
        <time dateTime={request.orderPlacedAt}>{formatPlacedAt(request.orderPlacedAt)}</time>
      </Fact>
      <Fact label="Channel">{REFUND_CHANNEL_LABELS[request.channel]}</Fact>
      <Fact label="Requested by">{request.requestedBy}</Fact>
      <Fact label="Requested at">
        <time dateTime={request.requestedAt}>{formatPlacedAt(request.requestedAt)}</time>
      </Fact>
      <Fact label="Reason">
        <span className="font-semibold">{REFUND_REASON_LABELS[request.reason]}</span>
        <span className="mt-1 block text-fg-muted">{request.reasonText}</span>
      </Fact>
      <Fact label="Requested">
        <span className="font-semibold tabular-nums">{formatPeso(request.amount)}</span>
      </Fact>
      <Fact label="Order total">
        <span className="tabular-nums">{formatPeso(request.orderTotal)}</span>
      </Fact>
    </dl>
  )
}

function Items({ request }: { request: RefundRequest }) {
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
      <caption className="sr-only">Items in the order with category, units, unit price and line total</caption>
      <colgroup>
        <col />
        <col className="w-28" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className={TH}>
            Item
          </th>
          <th scope="col" className={`${TH} text-right`}>
            Total
          </th>
        </tr>
      </thead>
      <tbody>
        {request.items.map((item, index) => (
          <tr key={`${item.name}-${index}`} className={LINE_ROW}>
            <td className="border-b border-line px-3 py-2">
              <span className="block truncate font-semibold text-fg">{item.name}</span>
              <span className="flex gap-x-3 text-fg-muted">
                <span className="truncate">{item.category}</span>
                <span className="shrink-0 whitespace-nowrap tabular-nums">
                  {item.units} × {formatPeso(item.unitPrice)}
                </span>
              </span>
            </td>
            <td className="border-b border-line px-3 text-right whitespace-nowrap text-fg tabular-nums">{formatPeso(item.units * item.unitPrice)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** What was decided, who decided it and when. Read only: a decision is final. */
function Decision({ request }: { request: RefundRequest }) {
  const approved = request.status === 'approved'
  return (
    <div id="refund-decision" tabIndex={-1} className="grid gap-1 rounded-xl border border-line bg-canvas-sub p-3 text-sm outline-none">
      <RefundStatusBadge status={request.status} />
      <p className="mt-1 font-semibold text-fg">
        {approved ? 'Approved' : 'Rejected'} by {request.decidedBy}
        {request.decidedAt && (
          <>
            {' '}
            on <time dateTime={request.decidedAt}>{formatPlacedAt(request.decidedAt)}</time>
          </>
        )}
      </p>
      {approved && <p className="text-fg tabular-nums">Refunded: {formatPeso(request.approvedAmount ?? request.amount)}</p>}
      {request.decisionNote && (
        <p className="text-fg-muted">
          {approved ? 'Note' : 'Reason'}: {request.decisionNote}
        </p>
      )}
    </div>
  )
}

function Choice({ id, name, checked, onChange, children }: { id: string; name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-fg">
      <input type="radio" id={id} name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-fg bg-canvas peer-checked:[&>span]:scale-100 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-chrome-strong"
      >
        <span className="size-3 scale-0 rounded-full bg-fg" />
      </span>
      {children}
    </label>
  )
}

interface RefundDetailSheetProps {
  /** The request to show. Give the sheet a new `key` for every open so it starts from the request, with no form open. */
  request: RefundRequest
  open: boolean
  onClose: () => void
}

/** One request: its facts and items, and for a pending one the approve and reject forms, each confirmed before it is sent. */
export function RefundDetailSheet({ request: initial, open, onClose }: RefundDetailSheetProps) {
  const toast = useToast()
  const admin = useCurrentUser()?.name ?? 'Admin'
  const [request, setRequest] = useState(initial)
  const [mode, setMode] = useState<Mode>('view')
  const [full, setFull] = useState(true)
  const [partial, setPartial] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState<Partial<Record<FormField, boolean>>>({})
  const [serverErrors, setServerErrors] = useState<Partial<Record<FormField, string>>>({})
  const [confirming, setConfirming] = useState<RefundDecision | null>(null)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const inFlight = useRef(false)
  // The control to focus once the next step is on screen (the one that held focus may be gone).
  const focusNext = useRef<string | null>(null)
  useEffect(() => {
    if (focusNext.current) document.getElementById(focusNext.current)?.focus()
    focusNext.current = null
  })

  const amount = full ? String(request.amount) : partial
  const approval = validateApproval({ amount, note }, request.orderTotal)
  const rejection = validateRejection({ reason })
  const all: Partial<Record<FormField, string>> = { ...approval, ...rejection }
  const errors = { ...Object.fromEntries(Object.entries(all).filter(([name]) => touched[name as FormField])), ...serverErrors } as Partial<Record<FormField, string>>

  const touch = (name: FormField) => setTouched((current) => ({ ...current, [name]: true }))
  function change(name: FormField, set: (value: string) => void, value: string) {
    set(value)
    setServerErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== name)))
    setFailure(null)
  }

  function go(next: Mode, focus: string) {
    setMode(next)
    setTouched({})
    setServerErrors({})
    setFailure(null)
    focusNext.current = focus
  }

  function review(event: FormEvent) {
    event.preventDefault()
    const fields: FormField[] = mode === 'approve' ? ['amount', 'note'] : ['reason']
    setTouched(Object.fromEntries(fields.map((name) => [name, true])))
    const first = fields.find((name) => all[name])
    if (first) {
      document.getElementById(`refund-${first}`)?.focus()
      return
    }
    setConfirming(mode === 'approve' ? { kind: 'approve', amount: Number(amount), note: note.trim() || undefined } : { kind: 'reject', reason: reason.trim() })
    focusNext.current = 'refund-confirm-cancel'
  }

  function back() {
    setConfirming(null)
    focusNext.current = 'refund-review'
  }

  async function decide(decision: RefundDecision) {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setFailure(null)
    try {
      const decided =
        decision.kind === 'approve'
          ? await approveRefund(request.id, { amount: decision.amount, note: decision.note, decidedBy: admin })
          : await rejectRefund(request.id, { reason: decision.reason, decidedBy: admin })
      setRequest(decided)
      setConfirming(null)
      setMode('view')
      focusNext.current = 'refund-decision'
      toast.show({ kind: 'success', message: decision.kind === 'approve' ? `Refund ${request.requestNo} approved: ${formatPeso(decision.amount)}` : `Refund ${request.requestNo} rejected` })
    } catch (error) {
      const { kind, field, message } = error as { kind?: string; field?: FormField; message: string }
      if (kind === 'conflict') {
        onClose()
        toast.show({ kind: 'error', message: `Refund ${request.requestNo} was already decided by someone else, so nothing was changed. The list now shows its latest status.` })
      } else if (kind === 'validation' && field) {
        setConfirming(null)
        setServerErrors({ [field]: message })
        focusNext.current = `refund-${field}`
      } else {
        // The confirm button was disabled while sending, which dropped focus: it comes back to the button that was pressed.
        focusNext.current = 'refund-confirm-decide'
        setFailure(`The request failed before anything was changed, so refund ${request.requestNo} is still pending. Check your connection, then try again. What you typed is still here.`)
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const decideable = request.status === 'pending'
  const title = confirming
    ? confirming.kind === 'approve'
      ? `Approve ${formatPeso(confirming.amount)} refund for ${request.orderNo}?`
      : `Reject refund ${request.requestNo}?`
    : request.requestNo
  const closeOne = () => (pending ? undefined : confirming ? back() : onClose())

  const input = (name: 'amount' | 'note' | 'reason') => ({
    id: `refund-${name}`,
    readOnly: pending,
    onBlur: () => touch(name),
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `refund-${name}-error` : undefined,
    autoComplete: 'off',
    spellCheck: name !== 'amount',
  })

  // Each footer has its own key: a reused button would turn into the submit button mid-click, and the same click would submit the form.
  let footer: ReactNode
  if (confirming) {
    footer = (
      <div key="confirm" className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button id="refund-confirm-cancel" type="button" onClick={back} disabled={pending} className={`${SECONDARY_BUTTON} disabled:opacity-60`}>
          Cancel
        </button>
        <button id="refund-confirm-decide" type="button" onClick={() => void decide(confirming)} disabled={pending} aria-busy={pending} className={`${SECONDARY_BUTTON} disabled:cursor-progress disabled:opacity-70`}>
          {pending && <SpinnerIcon className="mr-2" />}
          {confirming.kind === 'approve' ? 'Approve refund' : 'Reject refund'}
        </button>
      </div>
    )
  } else if (decideable && mode === 'view') {
    footer = (
      <div key="view" className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button id="refund-reject-open" type="button" onClick={() => go('reject', 'refund-reason')} className={SECONDARY_BUTTON}>
          Reject refund
        </button>
        <button id="refund-approve-open" type="button" onClick={() => go('approve', 'refund-full')} className={PRIMARY_BUTTON}>
          Approve refund
        </button>
      </div>
    )
  } else if (decideable) {
    footer = (
      <div key="form" className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => go('view', `refund-${mode}-open`)} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button id="refund-review" type="submit" form={FORM_ID} className={PRIMARY_BUTTON}>
          {mode === 'approve' ? 'Review approval' : 'Review rejection'}
        </button>
      </div>
    )
  }

  return (
    <Modal variant="sheet" open={open} onClose={closeOne} title={title} footer={footer}>
      {confirming ? (
        <div className="pb-5">
          <p className="text-base font-semibold text-fg">Are you sure?</p>
          <p className="mt-2 text-base text-fg-muted">
            {confirming.kind === 'approve'
              ? `${request.customerName} is refunded ${formatPeso(confirming.amount)} for order ${request.orderNo}. This can't be changed afterwards.`
              : `${request.customerName} is told the request was rejected and sees your reason. This can't be changed afterwards.`}
          </p>
          {failure && <Failure what={confirming.kind === 'approve' ? 'approve' : 'reject'} message={failure} />}
        </div>
      ) : (
        <div className="grid gap-6 pb-5">
          {!decideable && <Decision request={request} />}
          <section aria-label="Request details">
            <Details request={request} />
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">Items</h3>
            <Items request={request} />
          </section>
          {decideable && mode === 'approve' && (
            <form id={FORM_ID} noValidate onSubmit={review} aria-busy={pending} className="grid gap-4">
              <fieldset className="grid gap-1">
                <legend className="text-sm font-semibold text-fg">Refund amount</legend>
                <Choice id="refund-full" name="refund-kind" checked={full} onChange={() => setFull(true)}>
                  {request.amount === request.orderTotal ? 'Full refund' : 'Requested amount'} ({formatPeso(request.amount)})
                </Choice>
                <Choice id="refund-partial" name="refund-kind" checked={!full} onChange={() => setFull(false)}>
                  Partial refund
                </Choice>
              </fieldset>
              {!full && (
                <Field id="refund-amount" label="Amount to refund" error={errors.amount}>
                  <input
                    {...input('amount')}
                    type="text"
                    value={partial}
                    onChange={(event) => change('amount', setPartial, filterPriceInput(event.target.value) ?? partial)}
                    inputMode="decimal"
                    placeholder={String(Math.floor(request.orderTotal / 2))}
                    className={`${FIELD_INPUT} tabular-nums`}
                  />
                </Field>
              )}
              <Field id="refund-note" label="Note" optional count={{ value: note.length, max: REFUND_LIMITS.noteMax }} error={errors.note}>
                <textarea
                  {...input('note')}
                  rows={3}
                  value={note}
                  onChange={(event) => change('note', setNote, sanitizeText(event.target.value, REFUND_LIMITS.noteMax))}
                  placeholder="Anything to remember about this refund"
                  className={TEXTAREA}
                />
              </Field>
              {failure && <Failure what="approve" message={failure} />}
            </form>
          )}
          {decideable && mode === 'reject' && (
            <form id={FORM_ID} noValidate onSubmit={review} aria-busy={pending} className="grid gap-4">
              <Field id="refund-reason" label="Reason for rejecting" count={{ value: reason.length, max: REFUND_LIMITS.reasonMax }} error={errors.reason}>
                <textarea
                  {...input('reason')}
                  rows={4}
                  value={reason}
                  onChange={(event) => change('reason', setReason, sanitizeText(event.target.value, REFUND_LIMITS.reasonMax))}
                  placeholder="Tell the customer why the refund can't be given"
                  className={TEXTAREA}
                />
              </Field>
              {failure && <Failure what="reject" message={failure} />}
            </form>
          )}
        </div>
      )}
    </Modal>
  )
}

function Failure({ what, message }: { what: 'approve' | 'reject'; message: string }) {
  return (
    <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-danger p-3">
      <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fg">{`We couldn't ${what} the refund.`}</p>
        <p className="mt-1 text-sm text-fg-muted">{message}</p>
      </div>
    </div>
  )
}
