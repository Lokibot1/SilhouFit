import { useLocation } from 'react-router-dom'
import { useChatUnread } from '../../../hooks/useChatUnread'
import { CHAT_BRAND_NAME } from '../../../service/chatApi'
import { openChat } from '../../../service/chatDock'
import { MessageIcon } from '../../form/icons'
import { Tooltip } from '../../ui/Tooltip'
import { UnreadBadge } from '../InboxList'

/** The customer navbar's Messages icon: the unread count, and a click opens the chat in the dock over the current page. The Messages page is already the full chat, so there it does nothing. */
export function CustomerMessagesButton() {
  const unread = useChatUnread()
  const onMessagesPage = useLocation().pathname.replace(/\/$/, '') === '/messages'

  return (
    <Tooltip label="Messages">
      <button
        type="button"
        onClick={() => !onMessagesPage && openChat('mine', { name: CHAT_BRAND_NAME })}
        aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
        className="relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-fg/10"
      >
        <MessageIcon />
        <span className="pointer-events-none absolute top-0.5 right-0.5">
          <UnreadBadge count={unread} />
        </span>
      </button>
    </Tooltip>
  )
}
