import { useEffect, useId, useRef, useState } from 'react'
import { mediaUrl, type ReviewInput, type ReviewMedia } from '../../service/orderReviews'
import { formatFileSize } from '../../utils/fileSize'
import { checkReviewFile, filterReviewText, isVideoFile, REVIEW_ACCEPT, REVIEW_LIMITS, validateReview } from '../../utils/reviewValidation'
import { AlertIcon, PlusIcon, SpinnerIcon } from '../form/icons'
import { KRAL_INPUT, KRAL_PRIMARY, KRAL_SECONDARY } from '../shop/shopControls'
import { Modal } from '../ui/Modal'
import { ReviewMediaTile } from './ReviewMediaTile'
import { StarRating } from './StarRating'

export interface ReviewInitial {
  rating: number
  text: string
  media: ReviewMedia[]
}

interface ReviewOrderModalProps {
  open: boolean
  /** The order number the dialog names. */
  orderNumber: string
  /** The saved review, when editing. */
  initial?: ReviewInitial
  pending: boolean
  /** Why the last try failed, shown inside the dialog. */
  error: string | null
  onClose: () => void
  onSubmit: (input: ReviewInput) => void
}

/** A photo or video picked in this dialog, not saved yet. `url` previews it. */
interface Draft {
  id: string
  file: File
  url: string
}
let nextDraft = 0

const LABEL = 'font-kral-mono block text-base text-kral-muted md:text-xs md:tracking-[0.08em] md:uppercase'
const revokeAll = (drafts: Draft[]) => drafts.forEach((d) => URL.revokeObjectURL(d.url))

/** Rate an order, write about it and add photos or a video. Errors show once a field is touched, and all of them on submit, which also focuses the first one. */
export function ReviewOrderModal({ open, orderNumber, initial, pending, error, onClose, onSubmit }: ReviewOrderModalProps) {
  const [rating, setRating] = useState(initial?.rating ?? 0)
  const [text, setText] = useState(initial?.text ?? '')
  const [kept, setKept] = useState<ReviewMedia[]>(initial?.media ?? [])
  const [added, setAdded] = useState<Draft[]>([])
  const [rejected, setRejected] = useState<string[]>([])
  const [touched, setTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const firstStar = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const id = useId()

  // A save error lands below the fold of a short phone screen: bring it into view.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [error])

  // A fresh form each time the dialog opens: empty, or the saved review.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setRating(initial?.rating ?? 0)
      setText(initial?.text ?? '')
      setKept(initial?.media ?? [])
      setAdded([])
      setRejected([])
      setTouched(false)
      setSubmitted(false)
    }
  }

  // Previews not saved are let go when the dialog closes or goes away.
  const addedRef = useRef(added)
  useEffect(() => {
    addedRef.current = added
  })
  useEffect(() => {
    if (!open) revokeAll(addedRef.current)
  }, [open])
  useEffect(() => () => revokeAll(addedRef.current), [])

  const errors = validateReview({ rating, text })
  const ratingError = submitted ? errors.rating : undefined
  const textError = touched || submitted ? errors.text : undefined

  function pick(files: FileList | null) {
    const notes: string[] = []
    const accepted: Draft[] = []
    const counts = {
      photos: kept.filter((m) => m.kind === 'photo').length + added.filter((d) => !isVideoFile(d.file)).length,
      videos: kept.filter((m) => m.kind === 'video').length + added.filter((d) => isVideoFile(d.file)).length,
    }
    for (const file of Array.from(files ?? [])) {
      const problem = checkReviewFile(file, counts)
      if (problem) {
        notes.push(problem)
        continue
      }
      counts[isVideoFile(file) ? 'videos' : 'photos']++
      accepted.push({ id: `draft${++nextDraft}`, file, url: URL.createObjectURL(file) })
    }
    setRejected(notes)
    if (accepted.length) setAdded([...added, ...accepted])
    if (fileInput.current) fileInput.current.value = ''
  }

  function removeKept(media: ReviewMedia) {
    setKept(kept.filter((m) => m.id !== media.id))
    addButton.current?.focus()
  }

  function removeDraft(draft: Draft) {
    URL.revokeObjectURL(draft.url)
    setAdded(added.filter((d) => d.id !== draft.id))
    addButton.current?.focus()
  }

  function submit() {
    setSubmitted(true)
    if (errors.rating) firstStar.current?.focus()
    else if (errors.text) textRef.current?.focus()
    else onSubmit({ rating, text, keepIds: kept.map((m) => m.id), files: added.map((d) => d.file) })
  }

  const tiles = [
    ...kept.map((m) => ({ key: m.id, kind: m.kind, name: m.name, url: mediaUrl(m.id), remove: () => removeKept(m) })),
    ...added.map((d) => ({ key: d.id, kind: isVideoFile(d.file) ? ('video' as const) : ('photo' as const), name: d.file.name, url: d.url, remove: () => removeDraft(d) })),
  ]
  let photoNo = 0

  return (
    <Modal
      open={open}
      initialFocusRef={firstStar}
      onClose={pending ? () => {} : onClose}
      closable={!pending}
      title={initial ? 'Edit review' : 'Review order'}
      tone="kral"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className={KRAL_SECONDARY}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={pending} aria-busy={pending} className={`${KRAL_PRIMARY} disabled:cursor-progress`}>
            {pending && <SpinnerIcon className="mr-2" />}
            {initial ? 'Save review' : 'Post review'}
          </button>
        </div>
      }
    >
      <div className="font-kral-mono space-y-5 pb-5">
        <p className="text-base text-kral-muted">
          How did order <span className="tabular-nums">{orderNumber}</span> go?
        </p>

        <div>
          <StarRating value={rating} onChange={setRating} disabled={pending} firstRef={firstStar} error={ratingError} errorId={`${id}-rating-error`} />
          {ratingError && (
            <p id={`${id}-rating-error`} role="alert" className="mt-1 text-base leading-snug text-danger">
              {ratingError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${id}-text`} className={LABEL}>
            Your review
          </label>
          <textarea
            ref={textRef}
            id={`${id}-text`}
            value={text}
            readOnly={pending}
            rows={5}
            onChange={(event) => setText(filterReviewText(event.target.value))}
            onBlur={() => setTouched(true)}
            aria-invalid={textError ? true : undefined}
            aria-describedby={textError ? `${id}-text-error` : undefined}
            className={`${KRAL_INPUT} h-40 resize-none py-3 md:text-sm`}
          />
          {textError && (
            <p id={`${id}-text-error`} role="alert" className="mt-1 text-base leading-snug text-danger">
              {textError}
            </p>
          )}
          <p className="mt-1 text-right text-base text-kral-muted tabular-nums md:text-xs">
            {text.length}/{REVIEW_LIMITS.textMax}
          </p>
        </div>

        <div>
          <p className={LABEL}>Photos and video (optional)</p>
          <p className="mt-1 text-base text-kral-muted md:text-xs">
            Up to {REVIEW_LIMITS.photosMax} photos (JPG, PNG or WebP, 5 MB each) and {REVIEW_LIMITS.videosMax} video (MP4 or WebM, {formatFileSize(REVIEW_LIMITS.videoBytes)}).
          </p>
          <input ref={fileInput} type="file" accept={REVIEW_ACCEPT} multiple tabIndex={-1} aria-label="Choose photo and video files" className="sr-only" onChange={(event) => pick(event.target.files)} />
          <button ref={addButton} type="button" disabled={pending} onClick={() => fileInput.current?.click()} className={`${KRAL_SECONDARY} mt-2`}>
            <PlusIcon />
            Add photos or video
          </button>
          {rejected.length > 0 && (
            <ul role="alert" className="mt-2 space-y-1 text-base leading-snug text-danger">
              {rejected.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          {tiles.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-2 min-[480px]:grid-cols-3 sm:grid-cols-5">
              {tiles.map(({ key, kind, name, url, remove }) => (
                <ReviewMediaTile key={key} kind={kind} name={name} url={url} label={kind === 'photo' ? `Photo ${++photoNo}: ${name}` : `Video: ${name}`} onRemove={remove} disabled={pending} />
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p ref={errorRef} role="alert" className="flex items-start gap-2 text-base leading-snug text-danger">
            <AlertIcon className="mt-1 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </Modal>
  )
}
