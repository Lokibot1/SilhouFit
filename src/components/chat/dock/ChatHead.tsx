import { motion } from 'motion/react'
import { DURATION, EASE_OUT } from '../../../motion/tokens'
import { XIcon } from '../../form/icons'
import { Avatar } from '../../ui/Avatar'
import { Tooltip } from '../../ui/Tooltip'
import { UnreadBadge } from '../InboxList'

interface ChatHeadProps {
  id: string
  name: string
  avatarUrl?: string
  unread: boolean
  onOpen: () => void
  onClose: () => void
}

/** A minimized chat: a round avatar button. Its close button shows on hover and focus, and always on a touch screen, where it is a 44px target. */
export function ChatHead({ id, name, avatarUrl, unread, onOpen, onClose }: ChatHeadProps) {
  return (
    <motion.div
      className="group relative"
      style={{ transformOrigin: 'bottom right' }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DURATION.state, ease: EASE_OUT }}
    >
      <Tooltip label={name}>
        <button
          type="button"
          data-dock-head={id}
          onClick={onOpen}
          aria-label={`Open chat with ${name}${unread ? ', 1 unread' : ''}`}
          className="flex size-12 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-canvas-raised shadow-popover"
        >
          <Avatar name={name} src={avatarUrl} size="md" />
        </button>
      </Tooltip>
      {unread && (
        <span className="pointer-events-none absolute -top-1 -right-1">
          <UnreadBadge count={1} />
        </span>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close chat with ${name}`}
        className="absolute top-1/2 right-full mr-2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-canvas-raised text-fg opacity-0 shadow-popover group-focus-within:opacity-100 group-hover:opacity-100 motion-safe:transition-opacity pointer-coarse:size-11 pointer-coarse:opacity-100"
      >
        <XIcon />
      </button>
    </motion.div>
  )
}
