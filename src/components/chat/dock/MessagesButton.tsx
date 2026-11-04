import { useCallback, useRef, useState } from 'react'
import { useChatUnread } from '../../../hooks/useChatUnread'
import { MessageIcon } from '../../form/icons'
import { Tooltip } from '../../ui/Tooltip'
import { UnreadBadge } from '../InboxList'
import { DockInbox } from './DockInbox'

/** The staff top bar's Messages icon: the unread count, and a popover list that opens a chat in the dock. */
export function MessagesButton({ area }: { area: string }) {
  const unread = useChatUnread()
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }, [])

  return (
    <>
      <Tooltip label="Messages">
        <button
          ref={button}
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
          onClick={() => setOpen((isOpen) => !isOpen)}
          className="relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-fg/10"
        >
          <MessageIcon />
          <span className="pointer-events-none absolute top-0.5 right-0.5">
            <UnreadBadge count={unread} />
          </span>
        </button>
      </Tooltip>
      {open && <DockInbox area={area} anchor={button} onClose={close} />}
    </>
  )
}
