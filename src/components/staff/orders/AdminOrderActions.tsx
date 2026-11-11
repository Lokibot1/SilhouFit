import { useId, useState, type ReactNode } from 'react'
import { cancelDelivery, cancelDeliveryFailure, dispatchFailure, dispatchOrder, explainFailure, updateAdminOrder, type AdminOrderDetail } from '../../../service/adminOrdersApi'
import { cleanText, stripControl } from '../../../utils/checkoutValidation'
import { advanceActions, canCancelDelivery, cancelOrderBlock, dispatchBlock, isClosed, type AdvanceAction } from '../../../utils/orders'
import { ConfirmDialog } from '../../admin/users/ConfirmDialog'
import { AlertIcon, InfoIcon, NoteIcon, SendIcon, SpinnerIcon } from '../../form/icons'
import { useToast } from '../../toast/useToast'
import { PRIMARY_BUTTON_SM, SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'
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

  const primaryBook = advanceActions(detail).length === 0

  return (
    <div className="grid gap-6">
      <section aria-labelledby={`actions-${detail.id}`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 id={`actions-${detail.id}`} className={CARD_LABEL}>
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
          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
            {advanceActions(detail).map((action, index) => (
              <button key={action.status} type="button" disabled={pending} aria-busy={busy === action.status} onClick={() => void advance(action)} className={index === 0 ? ACTION_PRIMARY : ACTION_SECONDARY}>
                {spin(action.status)}
                {action.label}
              </button>
            ))}
            <Guarded why={dispatchWhy}>
              {(describedBy) => (
                <button type="button" disabled={pending || !!dispatchWhy} aria-describedby={describedBy} aria-busy={busy === 'dispatch'} onClick={() => void book()} className={primaryBook ? ACTION_PRIMARY : ACTION_SECONDARY}>
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
              onClick={() => setDialog('order')}
              className={`${ACTION} px-2 whitespace-nowrap text-fg-muted hover:text-danger disabled:cursor-progress disabled:opacity-60`}
            >
              Cancel order
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
