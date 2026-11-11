import { motion } from 'motion/react'
import type { KeyboardEvent } from 'react'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useSection } from '../../../hooks/useSection'
import { DURATION, EASE_OUT } from '../../../motion/tokens'
import { fetchMyConversation } from '../../../service/chatApi'
import { HELP_BOX, type DockBox } from '../../../service/chatDock'
import { MinusIcon, XIcon } from '../../form/icons'
import { SectionBody } from '../../staff/StaffSection'
import { Avatar } from '../../ui/Avatar'
import { Tooltip } from '../../ui/Tooltip'
import { ChatSkeleton } from '../ChatSkeleton'
import { ChatThread } from '../ChatThread'
import { HelpBot } from './HelpBot'

const HEADER_BUTTON = 'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-fg/10'

/** The customer's one thread: its id is looked up first. */
function MineThread() {
  const section = useSection(fetchMyConversation)
  return (
    <SectionBody section={section} what="your messages" skeleton={<ChatSkeleton compact />} errorClassName="p-3">
      {(conversation) => <ChatThread conversationId={conversation.id} compact publishOffset={false} />}
    </SectionBody>
  )
}

interface ChatBoxProps {
  box: DockBox
  staff: boolean
  onMinimize: () => void
  onClose: () => void
}

/** The open chat of the dock: a corner box from `sm`, a bottom sheet on a phone. Not modal, so focus is not trapped; Escape minimizes it. */
export function ChatBox({ box, staff, onMinimize, onClose }: ChatBoxProps) {
  const wide = useMediaQuery('(min-width: 640px)')

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.stopPropagation()
    onMinimize()
  }

  return (
    <motion.section
      role="region"
      aria-label={`Chat with ${box.name}`}
      onKeyDown={onKeyDown}
      // A phone's sheet publishes its height so a toast, and the heads, sit above it instead of under it.
      ref={(el) => {
        if (!el || wide) return
        const publish = () => document.documentElement.style.setProperty('--sheet-footer-h', `${el.offsetHeight}px`)
        publish()
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
        resize?.observe(el)
        return () => {
          resize?.disconnect()
          document.documentElement.style.removeProperty('--sheet-footer-h')
        }
      }}
      style={{ transformOrigin: 'bottom right' }}
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{ duration: DURATION.state, ease: EASE_OUT }}
      className="fixed inset-x-0 bottom-0 flex h-[min(32rem,80svh)] flex-col overflow-hidden rounded-t-xl border border-line-strong bg-canvas-sub text-fg shadow-popover sm:static sm:h-[30rem] sm:max-h-[calc(100svh-6rem)] sm:w-[22rem] sm:rounded-xl"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line pr-1 pl-3">
        <Avatar name={box.name} src={box.avatarUrl} size="sm" />
        <h2 className="display min-w-0 flex-1 truncate text-lg text-fg">{box.name}</h2>
        <Tooltip label="Minimize">
          <button type="button" onClick={onMinimize} aria-label={`Minimize chat with ${box.name}`} className={HEADER_BUTTON}>
            <MinusIcon />
          </button>
        </Tooltip>
        <Tooltip label="Close">
          <button type="button" onClick={onClose} aria-label={`Close chat with ${box.name}`} className={HEADER_BUTTON}>
            <XIcon />
          </button>
        </Tooltip>
      </header>
      {box.id === HELP_BOX ? <HelpBot /> : box.id === 'mine' ? <MineThread /> : <ChatThread key={box.id} conversationId={box.id} staff={staff} compact publishOffset={false} />}
    </motion.section>
  )
}
