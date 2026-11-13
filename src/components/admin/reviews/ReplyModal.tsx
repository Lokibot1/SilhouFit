import { useState } from 'react'
import { REPLY_MAX, type AdminReview } from '../../../service/reviewsApi'
import { SpinnerIcon } from '../../form/icons'
import { Field, FIELD_INPUT } from '../../staff/inventory/FormField'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { Modal } from '../../ui/Modal'

interface ReplyModalProps {
  open: boolean
  review: AdminReview
  pending: boolean
  /** Why the last save failed; the dialog stays open so the text is not lost. */
  error: string | null
  onSave: (reply: string) => void
  onClose: () => void
}

/** Posts a reply to a review, or edits the one there. Mount it with a new `key` per review so the text starts from that review's reply. */
export function ReplyModal({ open, review, pending, error, onSave, onClose }: ReplyModalProps) {
  const [text, setText] = useState(review.adminReply ?? '')
  const id = `reply-${review.id}`
  const editing = review.adminReply !== null
  const reply = text.trim()
  const unchanged = reply === (review.adminReply ?? '').trim()

  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      title={editing ? 'Edit reply' : 'Reply to review'}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className={`${SECONDARY_BUTTON} disabled:opacity-60`}>
            Cancel
          </button>
          <button type="submit" form={`${id}-form`} disabled={pending || !reply || unchanged} aria-busy={pending} className={PRIMARY_BUTTON}>
            {pending && <SpinnerIcon className="mr-2" />}
            {editing ? 'Save reply' : 'Post reply'}
          </button>
        </div>
      }
    >
      <form
        id={`${id}-form`}
        onSubmit={(event) => {
          event.preventDefault()
          if (reply && !unchanged && !pending) onSave(reply)
        }}
        className="grid gap-3 pb-5"
      >
        <blockquote className="border-l-2 border-line-strong pl-3 text-base text-fg-muted">
          <p className="font-semibold text-fg">{review.user.name}</p>
          <p className="line-clamp-3 break-words whitespace-pre-line">{review.comment ?? 'No comment'}</p>
        </blockquote>
        <Field id={id} label="Your reply" count={{ value: text.length, max: REPLY_MAX }}>
          <textarea
            id={id}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={REPLY_MAX}
            rows={5}
            readOnly={pending}
            aria-describedby={`${id}-count`}
            className={FIELD_INPUT}
          />
        </Field>
        <p className="text-sm text-fg-muted">Shoppers see this under the review on the product page, as a reply from SilhouFit.</p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
