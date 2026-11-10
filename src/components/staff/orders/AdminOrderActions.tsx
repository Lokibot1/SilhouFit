import { useId, useState, type ReactNode } from 'react'
import { cancelDelivery, cancelDeliveryFailure, dispatchFailure, dispatchOrder, explainFailure, updateAdminOrder, type AdminOrderDetail } from '../../../service/adminOrdersApi'
import { cleanText, stripControl } from '../../../utils/checkoutValidation'
import { advanceActions, canCancelDelivery, cancelOrderBlock, dispatchBlock, isClosed, type AdvanceAction } from '../../../utils/orders'
import { ConfirmDialog } from '../../admin/users/ConfirmDialog'
import { AlertIcon, SpinnerIcon } from '../../form/icons'
import { useToast } from '../../toast/useToast'
import { PRIMARY_BUTTON_SM, SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
import { Field, FIELD_INPUT } from '../inventory/FormField'

const NOTES_MAX = 500
const REASON_MAX = 255

/** A button that can be off, and under it the reason, as text anyone can read. */
function Guarded({ why, children }: { why: string | null; children: (describedBy: string | undefined) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {children(why ? id : undefined)}
      {why && (
        <p id={id} className="text-xs text-fg-muted">
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

/** What staff can do to the order: move it on, book or cancel the rider, cancel it, and keep notes. */
export function AdminOrderActions({ detail, onChanged }: ActionsProps) {
  const toast = useToast()
  // The action in flight ('dispatch', 'notes', 'cancel-order', 'cancel-delivery' or a status); every button waits for it.
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'order' | 'delivery' | null>(null)
  const [reason, setReason] = useState('')
  const [dialogError, setDialogError] = useState('')
  const [notes, setNotes] = useState(detail.adminNotes ?? '')
  const pending = busy !== null
  const closed = isClosed(detail)
  const dispatchWhy = dispatchBlock(detail)
  const cancelWhy = cancelOrderBlock(detail)
  const spin = (key: string) => busy === key && <SpinnerIcon />

  async function advance(action: AdvanceAction) {
    setBusy(action.status)
    try {
      await updateAdminOrder(detail.id, { status: action.status })
      toast.show({ kind: 'success', message: action.done })
      onChanged()
    } catch (error) {
      toast.show({ kind: 'error', message: `The order was not updated. ${explainFailure(error)}`, action: { label: 'Retry', onClick: () => void advance(action) } })
    } finally {
      setBusy(null)
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

  const saved = detail.adminNotes ?? ''
  async function saveNotes() {
    setBusy('notes')
    try {
      const cleaned = cleanText(notes)
      await updateAdminOrder(detail.id, { adminNotes: cleaned })
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
    <section>
      <h3 className="mb-2 text-xs font-semibold text-fg">Actions</h3>
      {closed ? (
        <p className="text-sm text-fg-muted">This order is closed.</p>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          {advanceActions(detail).map((action, index) => (
            <button key={action.status} type="button" disabled={pending} aria-busy={busy === action.status} onClick={() => void advance(action)} className={index === 0 ? PRIMARY_BUTTON_SM : SECONDARY_BUTTON_SM}>
              {spin(action.status)}
              {action.label}
            </button>
          ))}
          <Guarded why={dispatchWhy}>
            {(describedBy) => (
              <button type="button" disabled={pending || !!dispatchWhy} aria-describedby={describedBy} aria-busy={busy === 'dispatch'} onClick={() => void book()} className={SECONDARY_BUTTON_SM}>
                {spin('dispatch')}
                {busy === 'dispatch' ? 'Booking a rider…' : 'Book rider'}
              </button>
            )}
          </Guarded>
          {canCancelDelivery(detail) && (
            <button type="button" disabled={pending} onClick={() => setDialog('delivery')} className={SECONDARY_BUTTON_SM}>
              Cancel delivery
            </button>
          )}
          <Guarded why={cancelWhy}>
            {(describedBy) => (
              <button type="button" disabled={pending || !!cancelWhy} aria-describedby={describedBy} onClick={() => setDialog('order')} className={SECONDARY_BUTTON_SM}>
                Cancel order
              </button>
            )}
          </Guarded>
        </div>
      )}

      <div className="mt-4">
        <Field id={`notes-${detail.id}`} label="Staff notes" count={{ value: notes.length, max: NOTES_MAX }}>
          <textarea
            id={`notes-${detail.id}`}
            value={notes}
            onChange={(event) => setNotes(stripControl(event.target.value))}
            maxLength={NOTES_MAX}
            rows={3}
            readOnly={busy === 'notes'}
            aria-describedby={`notes-${detail.id}-count`}
            className={FIELD_INPUT}
          />
        </Field>
        <button type="button" disabled={pending || notes.trim() === saved.trim()} aria-busy={busy === 'notes'} onClick={() => void saveNotes()} className={`${SECONDARY_BUTTON_SM} mt-2`}>
          {spin('notes')}
          Save notes
        </button>
      </div>

      <ConfirmDialog
        open={dialog === 'order'}
        title={`Cancel order ${detail.orderNumber}?`}
        confirmLabel="Cancel order"
        pending={busy === 'cancel-order'}
        onConfirm={() => void confirmCancelOrder()}
        onClose={closeDialog}
      >
        <p>Stock goes back to inventory and any open payment link expires.</p>
        {detail.paymentStatus === 'PAID' && <p className="mt-2 font-semibold text-fg">The payment is not refunded automatically.</p>}
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
    </section>
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
