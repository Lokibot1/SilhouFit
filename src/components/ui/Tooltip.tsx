import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EASE_SCRUB } from '../../motion/tokens'

const EDGE = 8
const GAP = 8
const HOVER_DELAY_MS = 300
// One even curve in and out, slow enough to read as a fade rather than a blink.
const FADE = { duration: 0.32, ease: EASE_SCRUB }

interface BubbleProps {
  id: string
  label: string
  anchor: HTMLElement
  wrap?: boolean
}

// Fixed to the viewport (rendered in a portal) so no ancestor clips it, and clamped inside the edges.
function Bubble({ id, label, anchor, wrap }: BubbleProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ left: -9999, top: 0 })

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect()
    const tip = ref.current!.getBoundingClientRect()
    const left = Math.min(Math.max(EDGE, rect.left + rect.width / 2 - tip.width / 2), window.innerWidth - tip.width - EDGE)
    const below = rect.bottom + GAP
    const top = below + tip.height + EDGE <= window.innerHeight ? below : rect.top - GAP - tip.height
    setPlace({ left, top })
  }, [anchor, label])

  return createPortal(
    <motion.div
      ref={ref}
      id={id}
      role="tooltip"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: FADE }}
      exit={{ opacity: 0, scale: 0.96, transition: FADE }}
      style={place}
      className={`font-ui pointer-events-none fixed z-[100] ${wrap ? 'w-max max-w-[min(18rem,calc(100vw-1rem))]' : 'max-w-[calc(100vw-1rem)]'} rounded-xl bg-fg px-3 py-1.5 text-sm text-canvas shadow-[0_8px_20px_-8px_rgb(var(--shadow-key)/var(--shadow-b))]`}
    >
      {label}
    </motion.div>,
    document.body,
  )
}

interface TooltipProps {
  label: string
  /** Also expose the label as the control's description. Off by default: the tooltip is never the accessible name. */
  describe?: boolean
  /** Shows the tip while true, for a caller that follows a pointer itself (a chart's readout). Hover and focus then do nothing. */
  open?: boolean
  /** For a long explanation: the tip wraps at about 18rem instead of running in one line. */
  wrap?: boolean
  children: ReactNode
}

/**
 * A hint for a control. Shows on mouse hover after a short delay and at once on keyboard focus; a touch tap never
 * shows it. Hides on leave, press, blur or Escape.
 */
export function Tooltip({ label, describe = false, open: controlled, wrap, children }: TooltipProps) {
  const id = useId()
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null)
  const timer = useRef<number>(undefined)
  const [hovered, setOpen] = useState(false)
  const open = controlled ?? hovered

  const hide = () => {
    window.clearTimeout(timer.current)
    setOpen(false)
  }

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') hide()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <span
      ref={setAnchor}
      className="inline-flex"
      aria-describedby={describe && open ? id : undefined}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setOpen(true), HOVER_DELAY_MS)
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(event) => {
        if ((event.target as HTMLElement).matches(':focus-visible')) setOpen(true)
      }}
      onBlur={hide}
    >
      {children}
      <AnimatePresence>{open && anchor && <Bubble id={id} label={label} anchor={anchor} wrap={wrap} />}</AnimatePresence>
    </span>
  )
}
