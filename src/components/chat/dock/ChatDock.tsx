import { AnimatePresence, MotionConfig } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useChatUnread } from '../../../hooks/useChatUnread'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { useInbox } from '../../../hooks/useInbox'
import { close, expand, minimizeAll, reset, useChatDock, type DockBox } from '../../../service/chatDock'
import { isStaffRole } from '../../../utils/staffRole'
import { ChatBox } from './ChatBox'
import { ChatHead } from './ChatHead'

// The full-page Messages screens: the dock steps aside there (its boxes stay in the store).
const MESSAGES_PAGE = /^\/(?:(?:staff|admin|superadmin)\/)?messages(?:\/|$)/

function Heads({ boxes, unreadOf }: { boxes: DockBox[]; unreadOf: (id: string) => boolean }) {
  return (
    <>
      {boxes.map((box) => (
        <ChatHead key={box.id} id={box.id} name={box.name} avatarUrl={box.avatarUrl} unread={unreadOf(box.id)} onOpen={() => expand(box.id)} onClose={() => close(box.id)} />
      ))}
    </>
  )
}

// Staff read each head's dot from the inbox rows; a customer has one thread, so one global dot.
function StaffHeads({ boxes }: { boxes: DockBox[] }) {
  const unread = new Set(
    useInbox('all', '')
      .conversations.filter((thread) => thread.hasUnreadMessages)
      .map((thread) => thread.id),
  )
  return <Heads boxes={boxes} unreadOf={(id) => unread.has(id)} />
}

function CustomerHeads({ boxes }: { boxes: DockBox[] }) {
  const unread = useChatUnread() > 0
  return <Heads boxes={boxes} unreadOf={() => unread} />
}

/**
 * The Messenger-style chat dock: one open box and a column of heads (minimized chats) at the bottom right. Mounted outside the routes so it
 * survives navigation, and each route change minimizes the open box. Customers get it in the storefront layout, staff in theirs.
 */
export function ChatDock({ staff = false }: { staff?: boolean }) {
  const user = useCurrentUser()
  const { pathname } = useLocation()
  const { boxes } = useChatDock()
  const previous = useRef(pathname)
  const refocus = useRef<string>(undefined)
  const signedIn = user !== null && isStaffRole(user.role) === staff

  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    minimizeAll()
  }, [pathname])

  useEffect(() => {
    if (!user) reset()
  }, [user])

  // After Escape or Minimize, focus goes to the head the box turned into.
  useEffect(() => {
    if (!refocus.current) return
    document.querySelector<HTMLElement>(`[data-dock-head="${CSS.escape(refocus.current)}"]`)?.focus()
    refocus.current = undefined
  }, [boxes])

  if (!signedIn || MESSAGES_PAGE.test(pathname)) return null
  const open = boxes.find((box) => box.mode === 'open')
  const heads = boxes.filter((box) => box.mode === 'min')
  if (!open && heads.length === 0) return null

  return (
    <MotionConfig reducedMotion="user">
      <div className="pointer-events-none fixed right-3 bottom-[calc(1rem+var(--cookie-banner-h,0px)+var(--bottom-bar-h,0px)+var(--sheet-footer-h,0px)+env(safe-area-inset-bottom))] z-[80] flex flex-row-reverse items-end gap-3 sm:right-4 [&>*]:pointer-events-auto">
        {heads.length > 0 && <div className="flex flex-col-reverse gap-3">{staff ? <StaffHeads boxes={heads} /> : <CustomerHeads boxes={heads} />}</div>}
        <AnimatePresence>
          {open && (
            <ChatBox
              // One box for every chat, so switching never leaves two sheets publishing the offset at once; the thread inside is keyed.
              box={open}
              staff={staff}
              onMinimize={() => {
                refocus.current = open.id
                minimizeAll()
              }}
              onClose={() => close(open.id)}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}
