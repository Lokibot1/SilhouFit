import { useId, useRef, useState } from 'react'
import { cleanText, stripControl } from '../../utils/checkoutValidation'
import { AlertIcon, SpinnerIcon } from '../form/icons'
import { KRAL_DANGER, KRAL_INPUT, KRAL_SECONDARY } from '../shop/shopControls'
import { Modal } from '../ui/Modal'

export const CANCEL_REASON_MAX = 255

interface CancelOrderModalProps {
  open: boolean
  /** The order number the question names. */
  orderNumber: string
  pending: boolean
  /** Why the last try failed, shown inside the dialog. */
  error: string | null
  onClose: () => void
  /** The reason, trimmed; empty when none was given. */
  onConfirm: (reason: string) => void
}

/** "Are you sure?" before cancelling an unpaid order, with an optional reason. Keep order takes focus first; both buttons wait while the request is in flight. */
export function CancelOrderModal({ open, orderNumber, pending, error, onClose, onConfirm }: CancelOrderModalProps) {
  const [reason, setReason] = useState('')
  const keep = useRef<HTMLButtonElement>(null)
  const reasonId = useId()
  // A fresh question each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setReason('')
  }

  return (
    <Modal
      open={open}
      initialFocusRef={keep}
      onClose={pending ? () => {} : onClose}
      closable={!pending}
      title="Cancel this order?"
      tone="kral"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button ref={keep} type="button" onClick={onClose} disabled={pending} className={KRAL_SECONDARY}>
            Keep order
          </button>
          <button type="button" onClick={() => onConfirm(cleanText(reason))} disabled={pending} aria-busy={pending} className={`${KRAL_DANGER} disabled:cursor-progress`}>
            {pending && <SpinnerIcon className="mr-2" />}
            Cancel order
          </button>
        </div>
      }
    >
      <div className="font-kral-mono pb-5">
        <p className="text-base font-medium text-kral-fg uppercase">Are you sure?</p>
        <p className="mt-2 text-base text-kral-muted">
          <span className="tabular-nums">{orderNumber}</span> will be cancelled. This can&apos;t be undone. You can buy the items again from your orders.
        </p>
        <label htmlFor={reasonId} className="mt-4 block text-base text-kral-muted md:text-xs md:tracking-[0.08em] md:uppercase">
          Reason (optional)
        </label>
        <textarea
          id={reasonId}
          value={reason}
          readOnly={pending}
          maxLength={CANCEL_REASON_MAX}
          rows={3}
          onChange={(event) => setReason(stripControl(event.target.value))}
          className={`${KRAL_INPUT} h-24 resize-none py-3`}
        />
        <p className="mt-1 text-right text-xs text-kral-muted tabular-nums" aria-hidden="true">
          {reason.length}/{CANCEL_REASON_MAX}
        </p>
        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-base leading-snug text-danger">
            <AlertIcon className="mt-1 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </Modal>
  )
}
