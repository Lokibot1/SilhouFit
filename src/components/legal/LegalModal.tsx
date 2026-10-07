import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'
import { PRIVACY, TERMS, type LegalDoc } from './legalContent'

const DOCS = {
  terms: { title: 'Terms of Service', content: TERMS },
  privacy: { title: 'Privacy Policy', content: PRIVACY },
}

// Sub-pixel rounding and zoom can leave the last pixel or two unreachable.
const END_TOLERANCE = 8

interface LegalModalProps {
  doc: LegalDoc
  open: boolean
  /** The reader scrolled to the end and pressed "I understand". */
  onAcknowledge: () => void
  /** Dismissed without acknowledging. */
  onClose: () => void
}

export function LegalModal({ doc, open, onAcknowledge, onClose }: LegalModalProps) {
  const { title, content } = DOCS[doc]
  const hintId = useId()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [atEnd, setAtEnd] = useState(false)

  const check = useCallback(() => {
    const el = bodyRef.current
    if (el) setAtEnd(el.scrollHeight - el.scrollTop - el.clientHeight <= END_TOLERANCE)
  }, [])

  // Layout effect: a reopened modal must not paint one frame with the previous, enabled button.
  useLayoutEffect(() => {
    if (!open) return
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [open, check])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      bodyRef={bodyRef}
      onBodyScroll={check}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p id={hintId} role="status" className="text-xs leading-snug text-fg-muted sm:flex-1">
            {atEnd ? 'You have reached the end. You can continue.' : 'Scroll to the end to continue'}
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
              Cancel
            </button>
            <button
              type="button"
              aria-disabled={!atEnd}
              aria-describedby={hintId}
              onClick={() => atEnd && onAcknowledge()}
              className={`${PRIMARY_BUTTON} aria-disabled:pointer-events-none aria-disabled:opacity-60`}
            >
              I understand
            </button>
          </div>
        </div>
      }
    >
      <p className="font-ui text-sm text-fg-muted">Last updated {content.lastUpdated}</p>
      <div className="mt-4 border-l-2 border-chrome/40 pl-4 text-sm leading-relaxed text-fg-muted">
        {content.scopeNote}
      </div>
      <div className="mt-6 space-y-6 pb-4 text-base leading-relaxed text-fg-muted">
        {content.sections.map(({ heading, body }) => (
          <section key={heading}>
            <h3 className="display text-lg text-fg">{heading}</h3>
            <div className="mt-2 space-y-3">{body}</div>
          </section>
        ))}
      </div>
    </Modal>
  )
}
