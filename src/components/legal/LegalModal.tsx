import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { PRIVACY, TERMS, type LegalDoc } from './legalContent'

const KRAL_BUTTON =
  'flex min-h-11 items-center justify-center border px-5 font-kral-mono text-sm font-medium tracking-[0.08em] uppercase transition-colors duration-200 ease-out kral-focus motion-reduce:transition-none'

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
      tone="kral"
      bodyRef={bodyRef}
      onBodyScroll={check}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p id={hintId} role="status" className="font-kral-mono text-sm leading-snug text-kral-muted sm:flex-1">
            {atEnd ? 'You have reached the end. You can continue.' : 'Scroll to the end to continue'}
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button type="button" onClick={onClose} className={`${KRAL_BUTTON} border-kral-fg text-kral-fg hover:bg-kral-fg hover:text-kral-bg`}>
              Cancel
            </button>
            <button
              type="button"
              aria-disabled={!atEnd}
              aria-describedby={hintId}
              onClick={() => atEnd && onAcknowledge()}
              className={`${KRAL_BUTTON} border-kral-red bg-kral-red text-kral-paper hover:border-kral-red-press hover:bg-kral-red-press aria-disabled:pointer-events-none aria-disabled:opacity-60`}
            >
              I understand
            </button>
          </div>
        </div>
      }
    >
      <p className="font-kral-mono text-sm font-medium tracking-[0.08em] text-kral-muted uppercase">
        Last updated // {content.lastUpdated}
      </p>
      <div className="mt-4 border-l-2 border-kral-red pl-4 font-kral-mono text-sm leading-relaxed text-kral-muted">
        {content.scopeNote}
      </div>
      <div className="kral-counter mt-6 space-y-6 pb-4 font-kral-mono text-base leading-relaxed text-kral-muted tabular-nums">
        {content.sections.map(({ heading, body }) => (
          <section key={heading} className="border-t border-kral-rule pt-3">
            <span aria-hidden="true" className="kral-index block text-sm font-medium tracking-[0.08em] text-kral-red-ink" />
            <h3 className="mt-2 font-kral-display text-lg leading-tight font-extrabold text-kral-fg uppercase">{heading}</h3>
            <div className="mt-2 space-y-3">{body}</div>
          </section>
        ))}
      </div>
    </Modal>
  )
}
