import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { useState } from 'react'
import { DURATION, EASE_OUT } from '../../motion/tokens'

/** Appears once the reader is well into the document, and fades away again. */
export function LegalBackToTop() {
  const { scrollY } = useScroll()
  const [visible, setVisible] = useState(false)
  useMotionValueEvent(scrollY, 'change', (value) => setVisible(value > 600))

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.shift, ease: EASE_OUT }}
          className="fixed right-4 bottom-[calc(1.5rem+var(--cookie-banner-h,0px))] z-40 flex min-h-11 items-center gap-2 border border-kral-fg bg-kral-bg px-4 font-kral-mono text-xs font-medium tracking-[0.08em] text-kral-fg uppercase transition-colors duration-200 ease-out hover:bg-kral-fg hover:text-kral-bg kral-focus motion-reduce:transition-none sm:right-6"
        >
          Back to top
          <svg
            viewBox="0 0 16 16"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M8 13V3M3 7l5-5 5 5" strokeLinecap="butt" strokeLinejoin="miter" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
