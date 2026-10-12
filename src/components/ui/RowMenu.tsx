import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { KebabIcon, TrashIcon } from '../form/icons'
import { computePlace, LISTBOX_PANEL } from './listbox'
import { Tooltip } from './Tooltip'

const PANEL_WIDTH = 160

/** A kebab button that opens a small menu holding a single destructive action (Remove). */
export function RowMenu({ label, actionLabel, onAction }: { label: string; actionLabel: string; onAction: () => void }) {
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<ReturnType<typeof computePlace>>()

  function close(refocus: boolean) {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const update = () => setPlace(computePlace(buttonRef.current!, PANEL_WIDTH))
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Tab') {
        event.preventDefault()
        close(true)
        return
      }
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close(true)
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  // The panel mounts once its place is known, so focus moves in then.
  const placed = place !== undefined
  useEffect(() => {
    if (open && placed) panelRef.current?.querySelector('button')?.focus()
  }, [open, placed])

  return (
    <>
      <Tooltip label="More actions">
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={label}
          onClick={() => setOpen((isOpen) => !isOpen)}
          className="-mt-2 -mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:bg-fg/10 hover:text-fg"
        >
          <KebabIcon />
        </button>
      </Tooltip>
      {createPortal(
        <AnimatePresence>
          {open && place && (
            <motion.div
              ref={panelRef}
              id={panelId}
              role="menu"
              aria-label={label}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: DURATION.state, ease: EASE_OUT }}
              style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom }}
              className={`${LISTBOX_PANEL} p-1`}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close(false)
                  onAction()
                }}
                className="flex min-h-9 pointer-coarse:min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-3 text-left text-base text-danger hover:bg-fg/10"
              >
                <TrashIcon />
                {actionLabel}
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
