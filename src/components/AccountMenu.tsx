import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CurrentUser } from '../hooks/useCurrentUser'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { clearSession } from '../service/session'
import { clearLastOrder } from '../utils/checkout'
import { useToast } from './toast/useToast'
import { Avatar } from './ui/Avatar'
import { computePlace, LISTBOX_PANEL } from './ui/listbox'
import { Tooltip } from './ui/Tooltip'

const PANEL_WIDTH = 256

/** The signed-in avatar as a button that opens a small panel with who is signed in and Sign out. */
export function AccountMenu({ user }: { user: CurrentUser }) {
  const toast = useToast()
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
        // The panel sits at the end of the page, so leaving it by Tab would drop focus: go back to the avatar.
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
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('resize', update)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  // The panel mounts once its place is known, so focus moves in then.
  const placed = place !== undefined
  useEffect(() => {
    if (open && placed) panelRef.current?.querySelector('button')?.focus()
  }, [open, placed])

  function signOut() {
    clearSession()
    clearLastOrder() // an order's address and phone must not outlive the session
    close(false)
    // The avatar is replaced by the Sign in icon: put focus there rather than on the page.
    requestAnimationFrame(() => document.getElementById('shop-sign-in')?.focus())
    toast.show({ kind: 'success', message: 'Signed out' })
  }

  return (
    <>
      <Tooltip label="Account">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={`Account, ${user.name}`}
          onClick={() => setOpen((isOpen) => !isOpen)}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl hover:bg-fg/10"
        >
          <Avatar name={user.name} src={user.avatarUrl} size="sm" />
        </button>
      </Tooltip>
      {createPortal(
        <AnimatePresence>
          {open && place && (
            <motion.div
              ref={panelRef}
              id={panelId}
              role="group"
              aria-label="Account"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: DURATION.state, ease: EASE_OUT }}
              style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom }}
              className={`${LISTBOX_PANEL} gap-3 p-4`}
            >
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-fg">{user.name}</p>
                {user.email && <p className="truncate text-sm text-fg-muted">{user.email}</p>}
              </div>
              <button
                type="button"
                onClick={signOut}
                className="skeuo font-ui flex min-h-9 pointer-coarse:min-h-11 cursor-pointer items-center justify-center rounded-xl px-3 text-sm font-semibold"
              >
                Sign out
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
