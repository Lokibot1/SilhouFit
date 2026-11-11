import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { CurrentUser } from '../hooks/useCurrentUser'
import { useChatUnread } from '../hooks/useChatUnread'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { CHAT_BRAND_NAME } from '../service/chatApi'
import { openChat } from '../service/chatDock'
import { signOut as endSession } from '../service/signOut'
import { useToast } from './toast/useToast'
import { LogOutIcon, MessageIcon, MoonIcon, ReceiptIcon, SettingsIcon, UserIcon } from './form/icons'
import { Avatar } from './ui/Avatar'
import { ThemeToggle } from './ThemeToggle'
import { computePlace, LISTBOX_PANEL } from './ui/listbox'
import { KRAL_ICON_BUTTON } from './ui/kralIconButton'
import { Tooltip } from './ui/Tooltip'

const PANEL_WIDTH = 256
const ITEM = 'flex min-h-9 pointer-coarse:min-h-11 w-full items-center gap-2 px-3 text-base'
const ITEM_LIVE = `${ITEM} cursor-pointer hover:bg-fg/10`
const ITEM_KRAL = `${ITEM} cursor-pointer font-kral-mono tracking-[0.08em] uppercase transition-colors duration-150 ease-out motion-reduce:transition-none`
const ITEM_KRAL_LIVE = `${ITEM_KRAL} text-kral-fg hover:bg-kral-fg hover:text-kral-bg focus-visible:bg-kral-fg focus-visible:text-kral-bg`
const ITEM_KRAL_SOON = `${ITEM_KRAL} text-kral-muted`
const PANEL_KRAL = 'fixed z-[85] flex flex-col overflow-hidden border border-kral-rule bg-kral-bg text-kral-fg'

/**
 * The signed-in avatar as a button that opens a small panel with who is signed in and Sign out.
 * `profileTo` is where Profile goes; null shows it as coming soon, for an area with no profile page yet.
 * `ordersTo` is where My orders goes; null leaves the row out, for the staff areas, which have no customer orders.
 * `onSignOut` runs just before the session ends. `themeSwitch` adds a Dark mode row with the theme switch.
 * `tone="kral"` restyles the button and panel flat and square for the storefront pages (no theme row there).
 */
export function AccountMenu({
  user,
  profileTo = '/profile',
  ordersTo = '/orders',
  onSignOut,
  themeSwitch = false,
  messages = false,
  tone,
}: {
  user: CurrentUser
  profileTo?: string | null
  ordersTo?: string | null
  onSignOut?: () => void
  themeSwitch?: boolean
  /** With `tone="kral"`: also list Messages (customers) in the panel below md, where the bar no longer has its icon. */
  messages?: boolean
  tone?: 'kral'
}) {
  const kral = tone === 'kral'
  const live = kral ? ITEM_KRAL_LIVE : ITEM_LIVE
  const soon = kral ? ITEM_KRAL_SOON : `${ITEM_LIVE} text-fg-muted`
  const separator = `my-1 h-px ${kral ? 'bg-kral-rule' : 'bg-line-strong'}`
  const toast = useToast()
  const navigate = useNavigate()
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
    navigate('/login', { replace: true })
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
          className={kral ? KRAL_ICON_BUTTON : 'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl hover:bg-fg/10'}
        >
          <Avatar name={user.name} src={user.avatarUrl} initials={user.initials} size="sm" />
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
              className={`${kral ? PANEL_KRAL : LISTBOX_PANEL} py-1`}
            >
              <div className="min-w-0 px-3 py-2">
                <p className={`truncate text-base font-semibold ${kral ? 'font-kral-mono text-kral-fg' : 'text-fg'}`}>{user.name}</p>
                {user.email && <p className={`truncate text-sm ${kral ? 'font-kral-mono text-kral-muted' : 'text-fg-muted'}`}>{user.email}</p>}
              </div>
              <div className={separator} role="separator" />
              {profileTo ? (
                <Link to={profileTo} onClick={() => close(false)} className={live}>
                  <UserIcon />
                  Profile
                </Link>
              ) : (
                <button type="button" aria-disabled="true" className={soon}>
                  <UserIcon />
                  Profile
                  <span className="ml-auto text-sm">Soon</span>
                </button>
              )}
              {ordersTo && (
                <Link to={ordersTo} onClick={() => close(false)} className={live}>
                  <ReceiptIcon />
                  Orders
                </Link>
              )}
              {/* The settings page is still to do, so the row shows but does nothing yet. */}
              <button type="button" aria-disabled="true" className={soon}>
                <SettingsIcon />
                Settings
                <span className="ml-auto text-sm">Soon</span>
              </button>
              {themeSwitch && <ThemeRow className={`${ITEM_LIVE} focus-within:bg-fg/10`} />}
              {kral && (
                // Below md the bar keeps only the cart, wishlist and this menu: Messages and the theme switch are here instead.
                <PhoneTools messages={messages} className={live} onDone={() => close(false)} />
              )}
              <div className={separator} role="separator" />
              <button type="button" onClick={signOut} className={live}>
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

/** The Dark mode row: the whole row toggles; the switch itself and its label already handle their own clicks. */
function ThemeRow({ className }: { className: string }) {
  return (
    <div
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('.sky-toggle')) event.currentTarget.querySelector('input')?.click()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        event.currentTarget.querySelector('input')?.click()
      }}
      className={className}
    >
      <MoonIcon />
      Dark mode
      <span className="ml-auto flex">
        <ThemeToggle nativeTitle={false} />
      </span>
    </div>
  )
}

/** Messages (customers only) and Dark mode as rows, for the storefront panel on a small screen. Its own component so staff menus never read the chat count. */
function PhoneTools({ messages, className, onDone }: { messages: boolean; className: string; onDone: () => void }) {
  const wide = useMediaQuery('(min-width: 768px)')
  if (wide) return null
  return (
    <>
      {messages && <MessagesRow className={className} onDone={onDone} />}
      <ThemeRow className={`${className} focus-within:bg-kral-fg/10`} />
    </>
  )
}

function MessagesRow({ className, onDone }: { className: string; onDone: () => void }) {
  const unread = useChatUnread()
  const onMessagesPage = useLocation().pathname.replace(/\/$/, '') === '/messages'
  if (onMessagesPage) return null
  return (
    <button
      type="button"
      onClick={() => {
        onDone()
        openChat('mine', { name: CHAT_BRAND_NAME })
      }}
      className={className}
    >
      <MessageIcon />
      Messages
      {unread > 0 && <span className="ml-auto text-sm tabular-nums">{unread > 99 ? '99+' : unread} unread</span>}
    </button>
  )
}
