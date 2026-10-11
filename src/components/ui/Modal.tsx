import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode, type Ref, type UIEventHandler } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { XIcon } from '../form/icons'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  open: boolean
  /** Called for Escape, the backdrop and the close button. */
  onClose: () => void
  title: string
  /** 'sheet' is a right-side panel from sm up and a bottom sheet below it. */
  variant?: 'center' | 'sheet'
  children: ReactNode
  footer?: ReactNode
  /** The scrolling content area, for callers that track how far it is read. */
  bodyRef?: Ref<HTMLDivElement>
  onBodyScroll?: UIEventHandler<HTMLDivElement>
}

export function Modal({ open, onClose, title, variant = 'center', children, footer, bodyRef, onBodyScroll }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const returnTo = document.activeElement as HTMLElement | null
    const { style } = document.body
    const saved = { overflow: style.overflow, paddingRight: style.paddingRight }
    // Hiding the scrollbar would widen the page, so pad by its width.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    style.overflow = 'hidden'
    if (scrollbar > 0) style.paddingRight = `calc(${getComputedStyle(document.body).paddingRight} + ${scrollbar}px)`
    panelRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      const panel = panelRef.current
      if (event.key !== 'Tab' || !panel) return
      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!panel.contains(active) || active === panel) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      style.overflow = saved.overflow
      style.paddingRight = saved.paddingRight
      if (returnTo?.isConnected) returnTo.focus()
    }
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && (
        <ModalView
          title={title}
          variant={variant}
          footer={footer}
          panelRef={panelRef}
          bodyRef={bodyRef}
          onBodyScroll={onBodyScroll}
          onClose={onClose}
        >
          {children}
        </ModalView>
      )}
    </AnimatePresence>,
    document.body,
  )
}

interface ModalViewProps extends Pick<ModalProps, 'title' | 'variant' | 'footer' | 'bodyRef' | 'onBodyScroll' | 'onClose' | 'children'> {
  panelRef: Ref<HTMLDivElement>
}

function ModalView({ title, variant, footer, panelRef, bodyRef, onBodyScroll, onClose, children }: ModalViewProps) {
  const titleId = useId()
  const reduced = useReducedMotion()
  const isPresent = useIsPresent()
  const transition = { duration: DURATION.state, ease: EASE_OUT }
  const sheet = variant === 'sheet'
  const wide = useMediaQuery('(min-width: 640px)')
  // A sheet slides in from the right (wide) or the bottom (narrow); reduced motion only fades.
  const hidden = sheet
    ? { opacity: 0, x: reduced || !wide ? 0 : '100%', y: reduced || wide ? 0 : '100%', scale: 1 }
    : { opacity: 0, y: reduced ? 0 : 12, x: 0, scale: reduced ? 1 : 0.98 }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transition}
      className={`fixed inset-0 z-[80] flex ${
        sheet ? 'items-end justify-center sm:items-stretch sm:justify-end' : 'items-center justify-center p-4'
      } ${isPresent ? '' : 'pointer-events-none'}`}
    >
      {/* Pointer down, not click, so a text selection dragged out of the panel does not close it. Mouse down is
          cancelled so the click does not move focus to the page after it has been returned to the opener. */}
      <div className="absolute inset-0 bg-carbon-950/60" aria-hidden="true" onPointerDown={onClose} onMouseDown={(event) => event.preventDefault()} />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={hidden}
        animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
        exit={hidden}
        transition={transition}
        className={`glass-card glass-elevated glass-dense relative flex w-full flex-col outline-none ${
          sheet
            ? 'max-h-[90svh] rounded-t-2xl sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-2xl'
            : 'max-h-[85svh] max-w-2xl rounded-2xl'
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 sm:px-8 sm:pt-6">
          <h2 id={titleId} className="display text-xl text-fg sm:text-2xl">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-fg-muted hover:text-fg"
          >
            <XIcon />
          </button>
        </div>
        <div
          ref={bodyRef}
          onScroll={onBodyScroll}
          tabIndex={0}
          role="region"
          aria-label={`${title} text`}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 wrap-break-word sm:px-8"
        >
          {children}
        </div>
        {footer && <div className="border-t border-line px-5 py-4 sm:px-8">{footer}</div>}
      </motion.div>
    </motion.div>
  )
}
