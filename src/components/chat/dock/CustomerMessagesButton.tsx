import { useLocation } from 'react-router-dom'
import { useChatUnread } from '../../../hooks/useChatUnread'
import { CHAT_BRAND_NAME } from '../../../service/chatApi'
import { openChat } from '../../../service/chatDock'
import { MessageIcon } from '../../form/icons'
import { KRAL_ICON_BUTTON, KRAL_ICON_COUNT } from '../../ui/kralIconButton'
import { Tooltip } from '../../ui/Tooltip'

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
        className={KRAL_ICON_BUTTON}
      >
        <MessageIcon />
        {unread > 0 && (
          <span aria-hidden="true" className={KRAL_ICON_COUNT}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </Tooltip>
  )
}
