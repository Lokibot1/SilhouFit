import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import type { CurrentUser } from '../hooks/useCurrentUser'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { signOut as endSession } from '../service/signOut'
import { useToast } from './toast/useToast'
import { LogOutIcon, MoonIcon, SettingsIcon, UserIcon } from './form/icons'
import { Avatar } from './ui/Avatar'
import { ThemeToggle } from './ThemeToggle'
import { computePlace, LISTBOX_PANEL } from './ui/listbox'
import { Tooltip } from './ui/Tooltip'

const PANEL_WIDTH = 256
const ITEM = 'flex min-h-9 pointer-coarse:min-h-11 w-full items-center gap-2 px-3 text-base'
const ITEM_LIVE = `${ITEM} cursor-pointer hover:bg-fg/10`

/**
 * The signed-in avatar as a button that opens a small panel with who is signed in and Sign out.
 * `profileTo` is where Profile goes; null shows it as coming soon, for an area with no profile page yet.
 * `onSignOut` runs just before the session ends. `themeSwitch` adds a Dark mode row with the theme switch.
 */
export function AccountMenu({
  user,
  profileTo = '/profile',
  onSignOut,
  themeSwitch = false,
}: {
  user: CurrentUser
  profileTo?: string | null
  onSignOut?: () => void
  themeSwitch?: boolean
}) {
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
    // Inset by the panel's overhang so its right edge lines up with the avatar and it opens toward the left.
    const update = () => {
      const button = buttonRef.current!
      setPlace(computePlace(button, PANEL_WIDTH, PANEL_WIDTH - button.offsetWidth))
    }
    function onKeyDown(event: KeyboardEvent) {
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a, button, input') ?? [])
      const at = items.indexOf(document.activeElement as HTMLElement)
      if (event.key === 'Tab') {
        // Tab walks the rows. The panel sits at the end of the page, so leaving it by Tab would drop focus: go back to the avatar.
        if (at >= 0 && at !== (event.shiftKey ? 0 : items.length - 1)) return
        event.preventDefault()
        close(true)
        return
      }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && at >= 0) {
        event.preventDefault()
        items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus()
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
    if (open && placed) panelRef.current?.querySelector<HTMLElement>('a, button')?.focus()
  }, [open, placed])

  function signOut() {
    onSignOut?.()
    endSession()
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
              className={`${LISTBOX_PANEL} py-1`}
            >
              <div className="min-w-0 px-3 py-2">
                <p className="truncate text-base font-semibold text-fg">{user.name}</p>
                {user.email && <p className="truncate text-sm text-fg-muted">{user.email}</p>}
              </div>
              <div className="my-1 h-px bg-line-strong" role="separator" />
              {profileTo ? (
                <Link to={profileTo} onClick={() => close(false)} className={ITEM_LIVE}>
                  <UserIcon />
                  Profile
                </Link>
              ) : (
                <button type="button" aria-disabled="true" className={`${ITEM_LIVE} text-fg-muted`}>
                  <UserIcon />
                  Profile
                  <span className="ml-auto text-sm">Soon</span>
                </button>
              )}
              {/* The settings page is still to do, so the row shows but does nothing yet. */}
              <button type="button" aria-disabled="true" className={`${ITEM_LIVE} text-fg-muted`}>
                <SettingsIcon />
                Settings
                <span className="ml-auto text-sm">Soon</span>
              </button>
              {themeSwitch && (
                // The whole row toggles; the switch itself and its label already handle their own clicks.
                <div
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest('.sky-toggle')) event.currentTarget.querySelector('input')?.click()
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    event.currentTarget.querySelector('input')?.click()
                  }}
                  className={`${ITEM_LIVE} focus-within:bg-fg/10`}
                >
                  <MoonIcon />
                  Dark mode
                  <span className="ml-auto flex">
                    <ThemeToggle nativeTitle={false} />
                  </span>
                </div>
              )}
              <div className="my-1 h-px bg-line-strong" role="separator" />
              <button type="button" onClick={signOut} className={ITEM_LIVE}>
                <LogOutIcon />
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
