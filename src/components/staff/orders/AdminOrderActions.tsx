import { flushSync } from 'react-dom'
import { useId, useRef, useState, type ReactNode } from 'react'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { cancelAndRefundOrder, cancelDelivery, cancelDeliveryFailure, cancelRefundFailure, dispatchFailure, dispatchOrder, explainFailure, failureOf, updateAdminOrder, type AdminOrderDetail } from '../../../service/adminOrdersApi'
import { cleanText, stripControl } from '../../../utils/checkoutValidation'
import { formatPeso } from '../../../utils/format'
import { canCancelDelivery, canStartPreparing, cancelOrderBlock, cancelRefundBlock, dispatchBlock, isClosed, RIDER_BOOKING_WHY } from '../../../utils/orders'
import { ConfirmDialog } from '../../admin/users/ConfirmDialog'
import { AlertIcon, BoxIcon, InfoIcon, NoteIcon, SendIcon, SpinnerIcon } from '../../form/icons'
import { useToast } from '../../toast/useToast'
import { PRIMARY_BUTTON_SM, SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { Checkbox } from '../../ui/Checkbox'
import { Field, FIELD_INPUT, PLAIN_INPUT } from '../inventory/FormField'
import { CARD_LABEL, OrderCard } from './OrderCard'

const NOTES_MAX = 500
const REASON_MAX = 255

// Phones get 16px text; the shared small buttons are 14px.
const ACTION = 'font-ui flex min-h-9 pointer-coarse:min-h-11 max-md:min-h-11 items-center justify-center gap-2 rounded-xl text-base md:text-sm font-semibold'
const ACTION_PRIMARY = `${PRIMARY_BUTTON_SM} max-md:text-base`
const ACTION_SECONDARY = `${SECONDARY_BUTTON_SM} max-md:text-base`

/** A button that can be off, and under it the reason, as text anyone can read. */
function Guarded({ why, children }: { why: string | null; children: (describedBy: string | undefined) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {children(why ? id : undefined)}
      {why && (
        <p id={id} className="text-sm text-fg-muted md:text-xs">
          {why}
        </p>
      )}
    </div>
  )
}

interface ActionsProps {
  detail: AdminOrderDetail
  /** Something changed: read the order again, and the list and counts. */
  onChanged: () => void
}

/** What staff can do to the order: start preparing it, book or cancel the rider, cancel it, and keep notes. The API moves the other statuses itself (payment webhooks and courier updates). */
export function AdminOrderActions({ detail, onChanged }: ActionsProps) {
  const toast = useToast()
  // The action in flight ('prepare', 'dispatch', 'notes', 'cancel-order' or 'cancel-delivery'); every button waits for it.
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'order' | 'refund' | 'delivery' | null>(null)
  const [reason, setReason] = useState('')
  const [dialogError, setDialogError] = useState('')
  // Cancel and refund only: the dialog error can be retried, items go back on the shelf, the order number is typed to confirm, the reason field was left.
  const [canRetry, setCanRetry] = useState(false)
  const [restock, setRestock] = useState(true)
  const [typed, setTyped] = useState('')
  const [reasonTouched, setReasonTouched] = useState(false)
  const role = useCurrentUser()?.role
  const [notes, setNotes] = useState(detail.internalNotes ?? '')
  const pending = busy !== null
  const closed = isClosed(detail)
  const dispatchWhy = dispatchBlock(detail)
  const paid = detail.paymentStatus === 'PAID' || detail.paymentStatus === 'PARTIALLY_REFUNDED'
  const cancelWhy = paid ? cancelRefundBlock(detail, role === 'admin' || role === 'superadmin') : cancelOrderBlock(detail)
  const reasonError = reasonTouched && !cleanText(reason) ? 'Enter why the order is being cancelled.' : ''
  const prepareWhy = detail.shipment?.status === 'DISPATCHING' ? RIDER_BOOKING_WHY : null
  const bookRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const spin = (key: string) => busy === key && <SpinnerIcon />

  async function prepare() {
    setBusy('prepare')
    try {
      await updateAdminOrder(detail.id, { status: 'PROCESSING' })
      toast.show({ kind: 'success', message: 'Order moved to Preparing' })
      // The button leaves once the order reloads, so hand focus on now, after the buttons are enabled again.
      flushSync(() => setBusy(null))
      ;(bookRef.current && !bookRef.current.disabled ? bookRef.current : headingRef.current)?.focus()
    } catch (error) {
      const { kind } = failureOf(error) ?? {}
      const retry = kind !== 'validation' && kind !== 'forbidden' && kind !== 'conflict'
      toast.show({ kind: 'error', message: `The order was not moved to Preparing. ${explainFailure(error)}`, action: retry ? { label: 'Retry', onClick: () => void prepare() } : undefined })
    } finally {
      setBusy(null)
      onChanged()
    }
  }

  async function book() {
    setBusy('dispatch')
    try {
      await dispatchOrder(detail.id)
      toast.show({ kind: 'success', message: 'Rider booked' })
    } catch (error) {
      const failure = dispatchFailure(error)
      toast.show({ kind: 'error', message: failure.message, action: failure.retry ? { label: 'Retry', onClick: () => void book() } : undefined })
    } finally {
      setBusy(null)
      onChanged()
    }
  }

  const saved = detail.internalNotes ?? ''
  async function saveNotes() {
    setBusy('notes')
    try {
      const cleaned = cleanText(notes)
      await updateAdminOrder(detail.id, { internalNotes: cleaned })
      setNotes(cleaned)
      toast.show({ kind: 'success', message: 'Notes saved' })
      onChanged()
    } catch (error) {
      toast.show({ kind: 'error', message: `The notes were not saved. ${explainFailure(error)}`, action: { label: 'Retry', onClick: () => void saveNotes() } })
    } finally {
      setBusy(null)
    }
  }

  function closeDialog() {
    setDialog(null)
    setReason('')
    setDialogError('')
    setCanRetry(false)
    setRestock(true)
    setTyped('')
    setReasonTouched(false)
  }

  async function confirmCancelOrder() {
    setBusy('cancel-order')
    setDialogError('')
    try {
      const why = cleanText(reason)
      await updateAdminOrder(detail.id, { status: 'CANCELLED', ...(why && { cancellationReason: why }) })
      closeDialog()
      toast.show({ kind: 'success', message: 'Order cancelled' })
      onChanged()
    } catch (error) {
      setDialogError(`The order was not cancelled. ${explainFailure(error)}`)
    } finally {
      setBusy(null)
    }
  }

  async function confirmCancelRefund() {
    const why = cleanText(reason)
    if (!why) {
      setReasonTouched(true)
      return
    }
    setBusy('cancel-refund')
    setDialogError('')
    setCanRetry(false)
    try {
      const result = await cancelAndRefundOrder(detail.id, { reason: why, restockItems: restock })
      closeDialog()
      onChanged()
      // The order is cancelled even when the gateway refused the refund, so the toast follows the refund.
      const refund = result.refunds?.find((r) => r.reason === 'ORDER_CANCELLED')
      const amount = formatPeso(refund?.amount ?? detail.total)
      if (refund?.status === 'SUCCEEDED') toast.show({ kind: 'success', message: `Order ${detail.orderNumber} cancelled and ${amount} refunded` })
      else if (refund?.status === 'REQUESTED' || refund?.status === 'PROCESSING') toast.show({ kind: 'success', message: `Order cancelled. The ${amount} refund is with the gateway and updates when it settles.` })
      else toast.show({ kind: 'info', message: "Order cancelled, but the refund didn't go through. Open it in Refunds to retry." })
    } catch (error) {
      const failure = cancelRefundFailure(error)
      setDialogError(failure.message)
      setCanRetry(failure.retry)
    } finally {
      setBusy(null)
    }
  }

  async function confirmCancelDelivery() {
    setBusy('cancel-delivery')
    setDialogError('')
    try {
      await cancelDelivery(detail.id)
      closeDialog()
      toast.show({ kind: 'success', message: 'Delivery cancelled' })
      onChanged()
    } catch (error) {
      setDialogError(cancelDeliveryFailure(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-6">
      <section aria-labelledby={`actions-${detail.id}`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 id={`actions-${detail.id}`} ref={headingRef} tabIndex={-1} className={`${CARD_LABEL} outline-none`}>
            Actions
          </h3>
          {!closed && cancelWhy && (
            <p id={`cancel-why-${detail.id}`} className="flex items-center gap-1 text-sm text-fg-muted md:text-xs">
              <InfoIcon className="shrink-0" />
              {cancelWhy}
            </p>
          )}
        </div>
        {closed ? (
          <p className="text-base text-fg-muted md:text-sm">This order is closed.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {canStartPreparing(detail) && (
              <Guarded why={prepareWhy}>
                {(describedBy) => (
                  <button type="button" disabled={pending || !!prepareWhy} aria-describedby={describedBy} aria-busy={busy === 'prepare'} onClick={() => void prepare()} className={ACTION_SECONDARY}>
                    {busy === 'prepare' ? <SpinnerIcon /> : <BoxIcon size={16} />}
                    {busy === 'prepare' ? 'Starting…' : 'Start preparing'}
                  </button>
                )}
              </Guarded>
            )}
            <Guarded why={dispatchWhy}>
              {(describedBy) => (
                <button ref={bookRef} type="button" disabled={pending || !!dispatchWhy} aria-describedby={describedBy} aria-busy={busy === 'dispatch'} onClick={() => void book()} className={ACTION_PRIMARY}>
                  {busy === 'dispatch' ? <SpinnerIcon /> : <SendIcon size={16} />}
                  {busy === 'dispatch' ? 'Booking a rider…' : 'Book rider'}
                </button>
              )}
            </Guarded>
            {canCancelDelivery(detail) && (
              <button type="button" disabled={pending} onClick={() => setDialog('delivery')} className={ACTION_SECONDARY}>
                Cancel delivery
              </button>
            )}
            <button
              type="button"
              disabled={pending || !!cancelWhy}
              aria-describedby={cancelWhy ? `cancel-why-${detail.id}` : undefined}
              onClick={() => setDialog(paid ? 'refund' : 'order')}
              className={`${ACTION} px-2 whitespace-nowrap text-fg-muted hover:text-danger disabled:cursor-progress disabled:opacity-60`}
            >
              {paid ? 'Cancel and refund' : 'Cancel order'}
            </button>
          </div>
        )}
      </section>

      <OrderCard
        icon={<NoteIcon size={16} />}
        title="Staff notes"
        aside={
          <span id={`notes-${detail.id}-count`} className="text-sm text-fg-muted tabular-nums md:text-xs">
            {notes.length}/{NOTES_MAX}
          </span>
        }
      >
        <textarea
          id={`notes-${detail.id}`}
          aria-label="Staff notes"
          value={notes}
          onChange={(event) => setNotes(stripControl(event.target.value))}
          maxLength={NOTES_MAX}
          rows={4}
          readOnly={busy === 'notes'}
          placeholder="Add internal notes for packaging, customer call verification, or courier handling..."
          aria-describedby={`notes-${detail.id}-count`}
          className={`${PLAIN_INPUT} resize-y py-2`}
        />
        <div className="mt-3 flex justify-end">
          <button type="button" disabled={pending || notes.trim() === saved.trim()} aria-busy={busy === 'notes'} onClick={() => void saveNotes()} className={ACTION_PRIMARY}>
            {spin('notes')}
            Save notes
          </button>
        </div>
      </OrderCard>

      <ConfirmDialog
        open={dialog === 'order'}
        title={`Cancel order ${detail.orderNumber}?`}
        confirmLabel="Cancel order"
        pending={busy === 'cancel-order'}
        onConfirm={() => void confirmCancelOrder()}
        onClose={closeDialog}
      >
        <p>Stock goes back to inventory and any open payment link expires.</p>
        <div className="mt-3">
          <Field id={`reason-${detail.id}`} label="Reason" optional count={{ value: reason.length, max: REASON_MAX }}>
            <textarea
              id={`reason-${detail.id}`}
              value={reason}
              onChange={(event) => setReason(stripControl(event.target.value))}
              maxLength={REASON_MAX}
              rows={2}
              readOnly={busy === 'cancel-order'}
              className={FIELD_INPUT}
            />
          </Field>
        </div>
        {dialogError && <DialogError>{dialogError}</DialogError>}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'refund'}
        title={`Cancel and refund order ${detail.orderNumber}?`}
        confirmLabel="Cancel and refund"
        pending={busy === 'cancel-refund'}
        confirmDisabled={typed.trim().toUpperCase() !== detail.orderNumber.toUpperCase()}
        onConfirm={() => void confirmCancelRefund()}
        onClose={closeDialog}
      >
        <p>
          The customer gets <span className="tabular-nums">{formatPeso(detail.total - (detail.refundedAmount ?? 0))}</span> back to their original payment method. This can't be undone.
        </p>
        <div className="mt-3">
          <Field
            id={`refund-reason-${detail.id}`}
            label="Reason"
            count={{ value: reason.length, max: REASON_MAX }}
            error={reasonError}
            hint="The customer sees this reason in their order and email."
          >
            <textarea
              id={`refund-reason-${detail.id}`}
              value={reason}
              onChange={(event) => setReason(stripControl(event.target.value))}
              onBlur={() => setReasonTouched(true)}
              maxLength={REASON_MAX}
              rows={2}
              readOnly={busy === 'cancel-refund'}
              aria-invalid={!!reasonError}
              aria-describedby={`refund-reason-${detail.id}-${reasonError ? 'error' : 'hint'}`}
              className={FIELD_INPUT}
            />
          </Field>
        </div>
        <Checkbox checked={restock} onChange={setRestock} label="Put items back in stock" disabled={busy === 'cancel-refund'} className="justify-start!">
          Put items back in stock
        </Checkbox>
        <div className="mt-3">
          <Field id={`refund-confirm-${detail.id}`} label={`Type ${detail.orderNumber} to confirm`}>
            <input
              id={`refund-confirm-${detail.id}`}
              type="text"
              value={typed}
              onChange={(event) => setTyped(stripControl(event.target.value))}
              readOnly={busy === 'cancel-refund'}
              autoComplete="off"
              spellCheck={false}
              className={FIELD_INPUT}
            />
          </Field>
        </div>
        {dialogError && <DialogError>{dialogError}</DialogError>}
        {dialogError && canRetry && (
          <button type="button" disabled={pending} onClick={() => void confirmCancelRefund()} className={`${ACTION_SECONDARY} mt-2`}>
            Retry
          </button>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'delivery'}
        title={`Cancel the delivery for ${detail.orderNumber}?`}
        confirmLabel="Cancel delivery"
        pending={busy === 'cancel-delivery'}
        onConfirm={() => void confirmCancelDelivery()}
        onClose={closeDialog}
      >
        <p>The order goes back to Preparing so you can book again.</p>
        {dialogError && <DialogError>{dialogError}</DialogError>}
      </ConfirmDialog>
    </div>
  )
}

function DialogError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-danger">
      <AlertIcon className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
