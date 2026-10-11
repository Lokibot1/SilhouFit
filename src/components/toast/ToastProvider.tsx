import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { AlertIcon, CheckIcon, XIcon } from '../form/icons'
import { ToastContext, type ToastOptions } from './useToast'

const AUTO_DISMISS_MS = 4500

type ActiveToast = ToastOptions & { id: number }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null)
  const nextId = useRef(0)
  const reduced = useReducedMotion()

  // One slot: a new toast replaces the current one.
  const show = useCallback((options: ToastOptions) => setToast({ ...options, id: ++nextId.current }), [])
  const dismiss = useCallback(() => setToast(null), [])
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-32 z-[60] flex justify-center sm:inset-x-auto sm:right-4 sm:justify-end">
        <AnimatePresence mode="wait">
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: reduced ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 0 }}
              transition={{ duration: DURATION.state, ease: EASE_OUT }}
              className="pointer-events-auto w-full sm:w-96"
            >
              <ToastView toast={toast} onDismiss={dismiss} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

function ToastView({ toast, onDismiss }: { toast: ActiveToast; onDismiss: () => void }) {
  const remaining = useRef(AUTO_DISMISS_MS)
  const startedAt = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const resume = useCallback(() => {
    clearTimeout(timer.current)
    startedAt.current = Date.now()
    timer.current = setTimeout(onDismiss, remaining.current)
  }, [onDismiss])

  const pause = useCallback(() => {
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = undefined
    remaining.current -= Date.now() - startedAt.current
  }, [])

  useEffect(() => {
    resume()
    return () => clearTimeout(timer.current)
  }, [resume])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  const isError = toast.kind === 'error'
  const Icon = isError ? AlertIcon : CheckIcon

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className="glass-card glass-floating [--g-fill:1.2]! flex flex-wrap items-start gap-3 rounded-2xl py-2 pr-2 pl-4"
    >
      <Icon
        size={20}
        className={`mt-3 ${isError ? 'text-danger' : toast.kind === 'success' ? 'text-success' : 'text-chrome-strong'}`}
      />
      <p className="min-w-0 flex-1 basis-36 py-3 text-sm leading-snug text-fg">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            onDismiss()
            toast.action?.onClick()
          }}
          className="font-ui order-last mb-1 ml-8 min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-fg underline decoration-chrome-strong decoration-2 underline-offset-2 hover:text-chrome-strong"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-fg-muted hover:text-fg"
      >
        <XIcon />
      </button>
    </div>
  )
}
